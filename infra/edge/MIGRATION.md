# Migration : du Nginx de l'hôte vers Traefik partagé (pile `edge`)

Situation de départ sur le VPS (151.80.155.198) : le **Nginx de l'hôte** (paquet Ubuntu, nginx 1.28) tient les ports 80/443, avec des certificats Certbot, et sert :

- **PixelJoy** (back-office, projet compose `pixeljoy-catalog`, déployé par GitHub Actions en mode `proxy=nginx` : l'app écoute sur `127.0.0.1:8787`) ;
- **l'autre projet Docker**, avec sa propre conf Nginx.

Cible : la pile `edge` (Traefik en conteneur, voir [README.md](README.md)) tient 80/443 ; chaque projet déclare son domaine par des labels Docker et rejoint le réseau `edge`. Nginx reste installé (arrêté) pour le retour arrière.

**Ordre sûr** : tout est préparé pendant que Nginx tourne encore ; la coupure se limite à la bascule (étape C, une à deux minutes). Toutes les commandes se lancent avec ton compte sudo, sauf mention contraire.

**Certificats** : ceux de Certbot (`/etc/letsencrypt`) ne sont **pas** réutilisés : Traefik en demande de nouveaux à la bascule (un par domaine, en quelques secondes si le DNS pointe déjà vers le VPS). Limites de taux de Let's Encrypt à garder en tête : **5 certificats identiques par semaine** (même ensemble de noms) et **5 échecs de validation par heure** par compte et par nom. Ne supprime donc jamais le volume `edge_acme` sans raison, et en cas de doute, fais un premier essai avec le serveur *staging* (`ACME_CA_SERVER` dans `.env`, voir README.md, étape 2). Les certificats Certbot restent sur le disque, utilisables en cas de retour arrière (et son timer de renouvellement peut continuer à tourner : il utilise Nginx, qui sera arrêté, donc ses renouvellements échoueront sans conséquence jusqu'au nettoyage final, étape D).

---

## A. Préparer `edge` (sans le démarrer)

```sh
sudo mkdir -p /opt/edge && sudo chown "$USER": /opt/edge
# copie infra/edge/* dans /opt/edge (README.md, étape 1)
cd /opt/edge
cp .env.example .env && chmod 600 .env
nano .env                                  # ACME_EMAIL=…
docker network inspect edge >/dev/null 2>&1 || docker network create edge
docker compose config -q && echo "configuration OK"
docker compose pull                        # télécharge les images maintenant, pas pendant la coupure
```

Ne lance **pas** `docker compose up` ici : les ports 80/443 sont encore tenus par Nginx.

**Attention** : `proxy=traefik` est la valeur par défaut du workflow PixelJoy. Une fois le réseau `edge` créé, un déploiement PixelJoy en `proxy=traefik` retire le port `127.0.0.1:8787` dont Nginx a besoin : jusqu'à la bascule (étape C), lance le workflow avec **`proxy=nginx`** explicitement. (Sans réseau `edge`, le mode `traefik` s'arrête en préflight avec une erreur claire, sans rien modifier.)

Note les domaines servis aujourd'hui (utile pour vérifier ensuite) :

```sh
sudo nginx -T 2>/dev/null | grep -E '^\s*server_name' | sort -u
```

## B. Adapter l'autre projet

Rien ne change pour le réseau `edge` tant qu'il n'est pas déclaré : on prépare la modification de **son** `docker-compose.yml` maintenant, on l'applique à l'étape C.

Modèle générique à ajouter au service web exposé du projet :

```yaml
services:
  <service-web>:                    # le service qui reçoit aujourd'hui le proxy_pass de Nginx
    # Retire (ou garde provisoirement, voir plus bas) la publication utilisée par Nginx, du type
    #   ports: ["127.0.0.1:<port-hôte>:<port-interne>"]
    networks:
      - default                     # garde ses réseaux existants (base de données…)
      - edge
    labels:
      traefik.enable: "true"
      traefik.docker.network: edge
      traefik.http.routers.<nom-unique>.rule: Host(`<domaine>`)          # plusieurs : Host(`a.fr`) || Host(`www.a.fr`)
      traefik.http.routers.<nom-unique>.entrypoints: websecure
      traefik.http.routers.<nom-unique>.tls.certresolver: letsencrypt
      traefik.http.services.<nom-unique>.loadbalancer.server.port: "<port-interne>"
      # Si l'appli n'envoie pas HSTS elle-même (Nginx le faisait peut-être : add_header Strict-Transport-Security) :
      # traefik.http.routers.<nom-unique>.middlewares: hsts@file

networks:
  edge:
    external: true
    name: edge
```

- `<port-interne>` = le port **dans** le conteneur (la partie droite de `ports:`), pas le port de l'hôte.
- Si le projet a un `networks:` par défaut implicite, ajoute bien `default` à côté de `edge`, sinon le service perd l'accès à ses autres conteneurs.
- Garder provisoirement la publication `127.0.0.1:<port-hôte>` ne gêne pas Traefik et facilite le retour arrière ; tu la retireras à l'étape D.

### À COMPLÉTER — conversion de la conf Nginx de l'autre projet

> **À compléter quand l'utilisateur fournit son `docker-compose.yml` et sa conf Nginx** (`/etc/nginx/sites-enabled/<site>`).
>
> Points à reprendre un par un depuis la conf Nginx :
>
> | Nginx | Traefik (labels ou `dynamic/*.yml`) |
> | --- | --- |
> | `server_name` | `rule: Host(...)` |
> | `proxy_pass http://127.0.0.1:<port>` | service web + `loadbalancer.server.port: "<port-interne>"` |
> | `client_max_body_size` | aucune limite par défaut dans Traefik ; middleware `buffering` (`maxRequestBodyBytes`) si une limite est voulue |
> | `proxy_read_timeout` long (websockets, uploads) | timeouts de l'entrypoint (`respondingTimeouts`) à ajuster dans `docker-compose.yml` de `edge` |
> | `location /static` servi par Nginx depuis le disque | à servir par un conteneur (ex. le service web, ou un petit `nginx:alpine` du projet) |
> | `add_header …` | middleware `headers` dédié au projet |
> | `return 301` vers `www` / sans `www` | middleware `redirectRegex` |
> | `allow` / `deny`, auth basique | middlewares `ipAllowList`, `basicAuth` |
> | `access_log` | rien : pas d'access log dans Traefik (choix volontaire) |
>
> Labels finaux de l'autre projet : _(à remplir)_

## C. Bascule

Prévois quelques minutes de coupure pour les deux sites. Les DNS pointent déjà vers le VPS (rien à changer).

```sh
# 1. Libérer 80/443
sudo nginx -t                       # (pour info : la conf actuelle est valide, utile au retour arrière)
sudo systemctl stop nginx
sudo ss -ltnp 'sport = :80' ; sudo ss -ltnp 'sport = :443'    # ne doit plus rien afficher

# 2. Démarrer Traefik
cd /opt/edge
docker compose up -d
docker compose ps                   # traefik et socket-proxy "healthy"
```

3. **PixelJoy** : sur GitHub, *Actions › Backoffice deploy › Run workflow* avec `proxy=traefik` (valeur par défaut). Le workflow vérifie que le réseau `edge` existe, recrée le conteneur de l'app **sans** son port `127.0.0.1:8787`, le branche sur `edge` avec ses labels, vérifie l'app depuis l'intérieur du conteneur, puis teste `https://admin.pixeljoy.krafting.be` (avertissement seulement si le certificat n'est pas encore là).

4. **L'autre projet** : applique la modification préparée à l'étape B, puis dans son dossier :

```sh
docker compose up -d                 # recrée le service web avec le réseau edge et les labels
```

### Vérifications

```sh
curl -sI http://admin.pixeljoy.krafting.be | head -n 3          # redirection permanente vers https://
curl -fsS https://admin.pixeljoy.krafting.be/catalog/v1/manifest.json | head -c 200
curl -sI https://<domaine-autre-projet> | head -n 5              # 200 (ou la page attendue)
echo | openssl s_client -connect admin.pixeljoy.krafting.be:443 -servername admin.pixeljoy.krafting.be 2>/dev/null \
  | openssl x509 -noout -issuer -dates                           # émetteur Let's Encrypt, dates neuves
cd /opt/edge && docker compose logs traefik                      # pas d'erreur ACME
```

Teste aussi dans un navigateur : connexion au back-office PixelJoy (`/admin`), et les parcours importants de l'autre projet (connexion, upload, websockets…).

Si un domaine affiche le certificat « TRAEFIK DEFAULT CERT » plus d'une minute, regarde `docker compose logs traefik` (DNS, pare-feu sur 443). **Ne relance pas en boucle** : chaque échec compte dans la limite de 5 par heure.

## D. Une fois validé (quelques jours plus tard)

```sh
sudo systemctl disable nginx        # ne redémarre plus au boot ; la conf /etc/nginx est GARDÉE pour un retour arrière
```

Puis, quand tu n'envisages plus de retour arrière :

- retire la publication `127.0.0.1:<port-hôte>` de l'autre projet (puis `docker compose up -d`) ;
- arrête les renouvellements Certbot devenus inutiles : `sudo certbot delete --cert-name <nom>` pour chaque certificat (liste : `sudo certbot certificates`) ;
- éventuellement `sudo apt remove nginx` (la conf dans `/etc/nginx` reste tant que tu n'utilises pas `purge`).

## E. Retour arrière

Possible à tout moment tant que Nginx et sa conf sont présents :

```sh
cd /opt/edge && docker compose down          # libère 80/443 (sans -v : les certificats Traefik sont gardés)
sudo systemctl start nginx                   # (et sudo systemctl enable nginx si tu l'avais désactivé)
```

- **PixelJoy** : relance le workflow avec `proxy=nginx` : l'app est republiée sur `127.0.0.1:8787` pour Nginx.
- **L'autre projet** : si tu as gardé sa publication `127.0.0.1:<port-hôte>`, il répond déjà à Nginx ; sinon remets son ancien `docker-compose.yml` puis `docker compose up -d`.
- Les certificats Certbot non expirés resservent tels quels ; s'ils ont expiré entre-temps : `sudo certbot renew` (Nginx tourne de nouveau).

Le réseau `edge` peut rester en place (il ne gêne pas) ; pour le supprimer : `docker network rm edge` une fois que plus aucun conteneur n'y est branché.
