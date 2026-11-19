# Migration : du Nginx de l'hôte vers Traefik partagé (pile `edge`)

Situation de départ sur le VPS (151.80.155.198) : le **Nginx de l'hôte** (paquet Ubuntu, nginx 1.28) tient les ports 80/443, avec des certificats Certbot, et sert :

- **Affiny** (préproduction, `/opt/affiny/deploy/preprod`) : `api.affiny.krafting.be` (API sur `127.0.0.1:13000`, Socket.IO sur `127.0.0.1:13004`) et `admin.affiny.krafting.be` (fichiers statiques du back-office Vite, servis par Nginx depuis le disque), conf `nginx/affiny-preprod.conf` ;
- **PixelJoy** (back-office, projet compose `pixeljoy-catalog`, déployé par GitHub Actions) : **aucun site Nginx** n'existe encore pour `admin.pixeljoy.krafting.be` (le mode `proxy=nginx` publie l'app sur `127.0.0.1:8787`, sans site qui la serve).

Cible : la pile `edge` (Traefik en conteneur, voir [README.md](README.md)) tient 80/443 ; chaque projet déclare son domaine par des labels Docker et rejoint le réseau `edge`. Nginx reste installé (arrêté) pour le retour arrière.

**Ordre sûr** : tout est préparé pendant que Nginx tourne encore ; la coupure se limite à la bascule (étape C : environ **1 minute** pour Affiny, 2 à 3 minutes en comptant l'essai *staging* conseillé). Toutes les commandes se lancent avec ton compte sudo, sauf mention contraire.

**Certificats** : ceux de Certbot (`/etc/letsencrypt`) ne sont **pas** réutilisés : Traefik en demande de nouveaux à la bascule (un par domaine, en quelques secondes si le DNS pointe déjà vers le VPS). Limites de taux de Let's Encrypt à garder en tête : **5 certificats identiques par semaine** (même ensemble de noms) et **5 échecs de validation par heure** par compte et par nom. Ne supprime donc jamais le volume `edge_acme` sans raison, et en cas de doute, fais un premier essai avec le serveur *staging* (`ACME_CA_SERVER` dans `.env`, voir README.md, étape 2). Les certificats Certbot restent sur le disque, utilisables en cas de retour arrière (et son timer de renouvellement peut continuer à tourner : il utilise Nginx, qui sera arrêté, donc ses renouvellements échoueront sans conséquence jusqu'au nettoyage final, étape D).

---

## A. Préparer `edge` (sans le démarrer)

```sh
sudo mkdir -p /opt/edge && sudo chown "$USER": /opt/edge
# copie infra/edge/* dans /opt/edge (README.md, étape 1)
cd /opt/edge
cp .env.example .env && chmod 600 .env
nano .env                                  # ACME_EMAIL=…
docker network inspect edge >/dev/null 2>&1 ||
  docker network create --subnet 172.30.0.0/24 --gateway 172.30.0.1 --ip-range 172.30.0.128/25 edge
docker network inspect edge --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'   # doit afficher 172.30.0.0/24
docker compose config -q && echo "configuration OK"
docker compose pull                        # télécharge les images maintenant, pas pendant la coupure
```

Si le réseau `edge` existait déjà avec un autre sous-réseau, recrée-le maintenant (rien n'y est encore branché) : `docker network rm edge` puis la commande `docker network create` ci-dessus (détails : README.md, « Le réseau edge existe déjà sans le bon sous-réseau »). Sous-réseau fixe = Traefik toujours en `172.30.0.2`, seule adresse dont les applis acceptent `X-Forwarded-For`.

Ne lance **pas** `docker compose up` ici : les ports 80/443 sont encore tenus par Nginx.

**PixelJoy** : `proxy=traefik` est la valeur par défaut de son workflow. Comme aucun site Nginx ne sert PixelJoy aujourd'hui, rien n'est perdu à le déployer en `proxy=traefik` **dès que le réseau `edge` existe** (étape B.6) : il rejoint `edge` avec ses labels et attend Traefik. (Si tu avais entre-temps créé un site Nginx pour PixelJoy, garde `proxy=nginx` jusqu'à l'étape C : le mode `traefik` retire le port `127.0.0.1:8787`. Sans réseau `edge`, le mode `traefik` s'arrête en préflight avec une erreur claire, sans rien modifier.)

Note les domaines servis aujourd'hui (utile pour vérifier ensuite) :

```sh
sudo nginx -T 2>/dev/null | grep -E '^\s*server_name' | sort -u
```

## B. Préparer les projets (sans coupure)

Rien ne change pour les visiteurs à cette étape : Nginx tient toujours 80/443 et la préproduction d'Affiny garde ses ports `127.0.0.1:13000/13004`.

### B.1 Fichiers fournis pour Affiny

Le dépôt d'Affiny n'est pas modifié : on dépose **à côté** de son compose de préproduction trois fichiers de [`examples/affiny/`](examples/affiny/) :

| Fichier | Rôle |
| --- | --- |
| [`docker-compose.traefik.yml`](examples/affiny/docker-compose.traefik.yml) | fichier **override** (le `docker-compose.yml` d'origine reste intact) : branche `api` sur `edge` (en plus de `default`, pour `redis`), **retire** ses ports publiés (`ports: !reset []`), déclare les routeurs Traefik ; ajoute le service `backoffice` |
| [`backoffice-nginx.conf`](examples/affiny/backoffice-nginx.conf) | conf du petit nginx interne qui sert le back-office statique (SPA `try_files … /index.html`, gzip, cache long des fichiers hachés de `/assets/`, `index.html` revalidé, `access_log off`, `server_tokens off`, en-têtes de sécurité de base, port 8080, non-root) |
| [`preflight.sh`](examples/affiny/preflight.sh) | vérifications en lecture seule : version de Docker Compose, réseau `edge`, `docker compose config` de l'ensemble, ports 13000/13004 bien retirés |

Correspondance avec `nginx/affiny-preprod.conf` :

| Nginx (hôte) | Traefik |
| --- | --- |
| `api.affiny…` `location /socket.io/` → `127.0.0.1:13004`, `Upgrade`/`Connection`, `proxy_read_timeout 75s` | routeur `affiny-ws` : ``Host(`api.${PREPROD_DOMAIN}`) && PathPrefix(`/socket.io/`)``, priorité 100, service port **3004** (port interne). Traefik gère l'upgrade WebSocket nativement ; pas de compression |
| `api.affiny…` `location /` → `127.0.0.1:13000`, `gzip` JSON | routeur `affiny-api` : ``Host(`api.${PREPROD_DOMAIN}`)``, service port **3000**, middleware `affiny-compress` (gzip/brotli selon `Accept-Encoding`, réponses ≥ 1 Ko, jamais `text/event-stream`) |
| `admin.affiny…` `root /opt/affiny/deploy/preprod/backoffice`, `try_files $uri /index.html`, gzip | service `backoffice` (`nginx:1.30.7-alpine` épinglé par digest) qui monte `./backoffice` **en lecture seule** ; routeur `affiny-admin` : ``Host(`admin.${PREPROD_DOMAIN}`)``, port 8080 |
| certificats Certbot, redirections 80→443 | `tls.certresolver=letsencrypt` sur `websecure` ; redirection globale 80→443 de la pile `edge` |
| `access_log` | aucun (ni dans Traefik, ni dans le nginx du back-office) |

Les trois routeurs utilisent l'entrypoint `websecure` et reçoivent aussi `security-headers@file` (nosniff, sans bannière `Server`). Noms de routeurs et services (`affiny-api`, `affiny-ws`, `affiny-admin`) uniques sur le VPS.

**Back-office** : le workflow de déploiement d'Affiny continue de synchroniser les fichiers dans `/opt/affiny/deploy/preprod/backoffice` ; le bind mount les sert aussitôt, **sans redémarrage**. Une seule réserve : si un jour la synchro **remplace le dossier lui-même** (`rm -rf backoffice && mv …`) au lieu d'en remplacer le contenu (`rsync --delete`, `cp`), le conteneur continue de voir l'ancien dossier : il faudrait alors `docker compose restart backoffice`. Le conteneur est en lecture seule (`read_only`, `/tmp` et `/var/cache/nginx` en tmpfs), sans capability, `no-new-privileges`, uid 101, uniquement sur le réseau `edge` (il n'a besoin de rien d'autre). Pas de CSP ajoutée (elle dépend de l'appli : à ajouter dans `backoffice-nginx.conf` une fois testée), ni HSTS (Nginx n'en envoyait pas ; si voulu : `traefik.http.routers.<routeur>.middlewares: hsts@file`, et pour `affiny-api` : `affiny-compress,hsts@file`).

**WebSocket et timeouts** : rien à régler dans `edge`. Les timeouts de l'entrypoint (`respondingTimeouts` de Traefik v3 : `readTimeout` 60 s, `writeTimeout` 0, `idleTimeout` 180 s) s'appliquent aux requêtes HTTP ; lors de l'upgrade WebSocket, le serveur HTTP de Go (sur lequel Traefik repose) retire ces échéances de la connexion, qui vit ensuite tant que le client et le serveur la gardent ouverte (Socket.IO envoie un ping toutes les 25 s par défaut). Le `proxy_read_timeout 75s` de Nginx n'a donc pas d'équivalent à reproduire. Seul cas à surveiller : un upload vers l'API dont **le corps** met plus de 60 s à arriver serait coupé (`readTimeout`) ; si c'est un besoin, ajoute `--entryPoints.websecure.transport.respondingTimeouts.readTimeout=300s` dans `infra/edge/docker-compose.yml`. Traefik n'impose pas non plus de limite de taille de corps (Nginx limitait à 1 Mo par défaut si `client_max_body_size` n'était pas défini) : c'est l'API qui doit borner ce qu'elle accepte (le parseur JSON d'Express limite à 100 Ko par défaut).

#### Adresse IP des clients d'Affiny (`TRUST_PROXY: "1"` inchangé)

Avec Traefik, l'API reçoit `X-Forwarded-For` posé par Traefik, à **un** saut. `TRUST_PROXY: "1"` reste donc la bonne valeur :

- Traefik a `forwardedHeaders.insecure=false` (écrit explicitement dans `infra/edge/docker-compose.yml`) et aucun `trustedIPs` : il **ne fait confiance à aucun** `X-Forwarded-*` entrant, les **supprime**, puis met `X-Forwarded-For: <IP du client>` (l'adresse TCP qu'il voit), ainsi que `X-Forwarded-Proto: https` et `X-Forwarded-Host`.
- Express, avec `trust proxy` = `1`, fait confiance au seul pair TCP (Traefik, `172.30.0.2`) et prend comme `req.ip` **l'entrée la plus à droite** de `X-Forwarded-For` (liste lue de droite à gauche : socket → dernière entrée ; il saute un saut de confiance, soit le socket, et retient l'adresse suivante). Ici l'en-tête n'a qu'une entrée, l'IP réelle du client : `req.ip` = le client. Même si un client glissait un `X-Forwarded-For: 1.2.3.4`, Traefik l'a supprimé ; et dans le pire cas (`insecure=true` un jour), l'entrée de droite resterait celle ajoutée par Traefik. `req.protocol` vaut `https` (cookies `Secure` corrects).
- C'est le même comportement qu'avant (Nginx → `docker-proxy` = un saut), pour l'API.
- Limite à connaître : `trust proxy 1` fait confiance au pair **quel qu'il soit**. Un autre conteneur branché sur `edge` qui joindrait `api:3000` directement (en contournant Traefik) pourrait choisir l'IP vue par l'API. Sur ce VPS, `edge` ne porte que tes propres projets ; si le code d'Affiny passe la valeur telle quelle à `app.set('trust proxy', …)`, la valeur la plus stricte serait `TRUST_PROXY: "172.30.0.2"` (adresse fixe de Traefik), à n'utiliser qu'après avoir vérifié comment Affiny lit cette variable (un `parseInt` la casserait).

> **Sécurité — compose de DEV d'Affiny.** Un autre compose d'Affiny (développement) publie **PostgreSQL 5432 et Redis 6379 sur `0.0.0.0`** sans mot de passe fort. Hors du périmètre de cette migration, mais **s'il tourne sur le VPS**, ces services sont joignables depuis Internet (Docker contourne `ufw` pour les ports publiés). Publie-les sur la boucle locale uniquement (`"127.0.0.1:5432:5432"`, `"127.0.0.1:6379:6379"`) ou retire `ports:` s'ils ne servent qu'aux autres conteneurs, et mets des mots de passe forts. Vérification : `sudo ss -ltnp | grep -E ':(5432|6379)\b'` ne doit montrer que `127.0.0.1`.

### B.2 Version de Docker Compose

`ports: !reset []` (sans lui, Compose **fusionne** les listes `ports` des deux fichiers et les ports 13000/13004 resteraient publiés) demande **Docker Compose v2.24.4 ou plus récent** (la balise `!reset` existe depuis v2.24.0 ; on exige v2.24.4 pour laisser de côté les toutes premières versions de cette fonction ; `preflight.sh` le vérifie) :

```sh
docker compose version            # Docker Compose version v2.24.4 ou plus (v2.3x, v5.x…)
# trop ancien : sudo apt update && sudo apt install docker-compose-plugin
```

### B.3 Déposer les fichiers

```sh
cd /opt/affiny/deploy/preprod
ls docker-compose.yml .env backoffice/index.html          # le compose de préproduction et le build du back-office
# copie depuis ce dépôt (ton ordinateur) :
#   scp infra/edge/examples/affiny/{docker-compose.traefik.yml,backoffice-nginx.conf,preflight.sh} \
#       <ton-utilisateur>@151.80.155.198:/opt/affiny/deploy/preprod/
chmod 644 docker-compose.traefik.yml backoffice-nginx.conf
chmod o+rx backoffice && find backoffice -type d -exec chmod o+rx {} + && find backoffice -type f -exec chmod o+r {} +
#   (le nginx du conteneur tourne en uid 101 : il doit pouvoir lire le build ; c'est un site public)
grep -q '^PREPROD_DOMAIN=' .env && echo "PREPROD_DOMAIN présent"
```

Les chemins relatifs de l'override (`./backoffice`, `./backoffice-nginx.conf`) sont résolus depuis le dossier du **premier** fichier compose, `/opt/affiny/deploy/preprod` : c'est bien le dossier statique que Nginx sert aujourd'hui. Le nom du projet compose ne change pas (`preprod`, nom du dossier) : les conteneurs existants sont **recréés**, pas dupliqués.

### B.4 Faire appliquer l'override par les déploiements d'Affiny

Le workflow de déploiement d'Affiny lance `docker compose --env-file .env up -d --build` **sans** `-f` : après la bascule, il recréerait `api` sans les labels et avec ses ports, et l'API disparaîtrait de Traefik. Deux possibilités :

- **sans toucher au dépôt d'Affiny** : ajoute à `/opt/affiny/deploy/preprod/.env`, **au moment de la bascule** (étape C), la ligne
  `COMPOSE_FILE=docker-compose.yml:docker-compose.traefik.yml`
  Compose la lit dans le fichier passé par `--env-file` : la commande habituelle applique alors les deux fichiers (vérifié avec `docker compose --env-file .env config`). Un `-f` explicite reste prioritaire (c'est ce qu'utilise le retour arrière). Si le workflow **réécrit** `.env`, utilise plutôt :
- **dans le workflow d'Affiny** : `docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env up -d --build` (à fusionner juste après la bascule).

Tant que la ligne `COMPOSE_FILE` n'est pas dans `.env`, un déploiement d'Affiny avant la bascule ne change rien (ports conservés pour Nginx).

### B.5 Valider et préparer (sans rien couper)

Une fois le réseau `edge` créé (étape A) :

```sh
cd /opt/affiny/deploy/preprod
bash preflight.sh                                           # doit finir par "Ready."
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env config -q && echo "config OK"
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env config | grep -E 'published|traefik.http.routers'
#   → aucune ligne "published" ; les routeurs affiny-api, affiny-ws, affiny-admin avec les bons domaines
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env build api   # image prête : pas de build pendant la coupure
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env up -d --no-deps backoffice
#   démarre SEUL le nouveau service backoffice (api et redis ne sont pas touchés, Nginx sert toujours admin.affiny)
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env ps backoffice   # "healthy"
```

### B.6 PixelJoy

Lance *Actions › Backoffice deploy › Run workflow* avec `proxy=traefik` (valeur par défaut) : l'app rejoint `edge` avec ses labels (aucun site Nginx ne la sert aujourd'hui, donc rien n'est coupé). Le test HTTPS final du workflow ne donne qu'un avertissement tant que Traefik n'est pas démarré : c'est normal.

## C. Bascule

### C.0 Garde-fou : ne commence pas sans avoir tout coché

- [ ] **edge prêt** : `/opt/edge/.env` rempli (`ACME_EMAIL`), `cd /opt/edge && docker compose config -q` OK, images téléchargées (`docker compose pull`, étape A) ;
- [ ] **réseau** : `docker network inspect edge --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'` affiche `172.30.0.0/24` ;
- [ ] **override Affiny** en place et validé : `bash preflight.sh` → `Ready.` (dont `docker compose … config`), image `api` construite, conteneur `backoffice` `healthy` (B.5) ;
- [ ] **PixelJoy déployé** en `proxy=traefik` (B.6) : `docker ps --filter network=edge` le liste avec le `backoffice` d'Affiny ;
- [ ] **DNS** des 3 domaines vers le VPS : `for d in api.affiny.krafting.be admin.affiny.krafting.be admin.pixeljoy.krafting.be; do echo "$d $(dig +short A "$d") $(dig +short AAAA "$d")"; done` → `151.80.155.198` partout (et pas d'AAAA vers une autre machine) ;
- [ ] **pare-feu** : 80/tcp, 443/tcp, 443/udp ouverts (README.md, étape 4) ;
- [ ] **retour arrière prêt** : `sudo nginx -t` OK, ce document ouvert à la section E.

### C.1 Essai ACME en *staging* (conseillé)

Protège les limites de Let's Encrypt (5 échecs de validation par heure et par nom, 5 certificats identiques par semaine) : la première émission se fait sur le serveur de test ; on ne passe en production qu'une fois les 3 domaines validés.

```sh
cd /opt/edge
sed -i 's|^ACME_CA_SERVER=.*|ACME_CA_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory|' .env
grep ACME_CA_SERVER .env
```

Puis dérouler C.2 tel quel. Les vérifications se font avec `curl -k` (certificat de test non reconnu, émetteur `(STAGING) …`). Quand les 3 domaines ont un certificat *staging* et que tout répond, passer en production (20 à 30 s de coupure supplémentaires) :

```sh
cd /opt/edge
sed -i 's|^ACME_CA_SERVER=.*|ACME_CA_SERVER=|' .env
docker compose down                 # libère 80/443 quelques secondes
docker volume rm edge_acme          # supprime les certificats de TEST (seule fois où l'on supprime ce volume)
docker compose up -d                # certificats de production, en quelques secondes
```

Si l'essai échoue (certificat non obtenu, appli qui ne répond pas) : retour arrière (section E), on corrige à tête reposée, aucun quota de production consommé.

### C.2 Déroulé (temps de coupure estimé : ~1 minute)

| t | Action | Effet |
| --- | --- | --- |
| 0:00 | `sudo systemctl stop nginx` | **début de la coupure** (api et admin d'Affiny) |
| 0:05 | `cd /opt/edge && docker compose up -d` | Traefik démarre (~10 s jusqu'à `healthy`), voit PixelJoy et le `backoffice` d'Affiny, demande leurs certificats |
| 0:15 | Affiny : ajout de `COMPOSE_FILE` dans `.env` puis `up -d` (sans `--build`, l'image est prête) | `api` recréé sans ports, sur `edge` ; Traefik demande le certificat de `api.` |
| 0:20–0:45 | attente : `api` `healthy` (son healthcheck), certificats obtenus (TLS-ALPN, quelques secondes chacun) | admin.affiny et admin.pixeljoy répondent déjà |
| ~1:00 | vérifications (C.3) | **fin de la coupure** |

```sh
# 0:00 — libérer 80/443
sudo nginx -t && sudo systemctl stop nginx
sudo ss -ltnp 'sport = :80' ; sudo ss -ltnp 'sport = :443'   # ne doit plus rien afficher

# 0:05 — Traefik
cd /opt/edge && docker compose up -d && docker compose ps

# 0:15 — Affiny (préproduction)
cd /opt/affiny/deploy/preprod
grep -q '^COMPOSE_FILE=' .env || echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.traefik.yml' >> .env
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env up -d
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env ps   # api "healthy", backoffice "healthy", redis "running"
sudo ss -ltnp | grep -E ':1300[04]\b' || echo "ports 13000/13004 libérés"
```

Le conteneur `redis` (éphémère) n'est pas recréé : sa configuration ne change pas.

### C.3 Vérifications

Pendant l'essai *staging*, ajoute `-k` aux `curl` (et `--no-check` à `wscat`) : le certificat de test n'est pas reconnu.

```sh
D=affiny.krafting.be
# Redirections et certificats
curl -sI http://api.$D/health | head -n 3                          # 301/308 vers https://
for h in api.$D admin.$D admin.pixeljoy.krafting.be; do
  echo "== $h"; echo | openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null | openssl x509 -noout -issuer -dates
done                                                               # émetteur Let's Encrypt (ou "(STAGING)"), dates neuves

# API
curl -I https://api.$D/health                                      # HTTP/2 200
curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{http_code} %header{content-encoding}\n' https://api.$D/health
#                                                                   (gzip seulement si la réponse fait >= 1 Ko)

# Socket.IO : poignée de main en long-polling, puis upgrade WebSocket (HTTP/1.1 obligatoire pour l'upgrade)
curl -s "https://api.$D/socket.io/?EIO=4&transport=polling" | head -c 120; echo   # 0{"sid":"…","upgrades":["websocket"],…}
curl --http1.1 --include --no-buffer --max-time 5 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  -H "Origin: https://admin.$D" \
  "https://api.$D/socket.io/?EIO=4&transport=websocket"           # "HTTP/1.1 101 Switching Protocols" puis 0{"sid":…
# ou : npx wscat -c "wss://api.$D/socket.io/?EIO=4&transport=websocket"   (reçoit 0{"sid":…} ; wscat ne répond pas
#      aux pings Engine.IO, le serveur ferme donc au bout de ~45 s : normal)

# Back-office Affiny (SPA)
curl -I https://admin.$D/                                          # 200, Cache-Control: no-cache, X-Frame-Options: DENY
curl -s -o /dev/null -w '%{http_code}\n' https://admin.$D/une/route/profonde   # 200 (index.html, routeur côté client)
curl -s -o /dev/null -w '%{http_code}\n' https://admin.$D/assets/inexistant.js # 404

# PixelJoy
curl -sI http://admin.pixeljoy.krafting.be | head -n 3             # redirection permanente vers https://
curl -fsS https://admin.pixeljoy.krafting.be/catalog/v1/manifest.json | head -c 200; echo

cd /opt/edge && docker compose logs traefik                        # pas d'erreur ACME
```

Dans un navigateur : connexion au back-office d'Affiny (`https://admin.affiny.krafting.be`), un écran qui utilise le temps réel ouvert **plus de 2 minutes** (outils de développement › Réseau › WS : une seule connexion `socket.io` qui reste ouverte, pings/pongs toutes les 25 s, pas de reconnexions en boucle), puis le back-office PixelJoy (`/admin`).

Si un domaine affiche le certificat « TRAEFIK DEFAULT CERT » plus d'une minute, regarde `docker compose logs traefik` (DNS, pare-feu sur 443). **Ne relance pas en boucle** : chaque échec compte dans la limite de 5 par heure (raison de l'essai *staging*).

Enfin, si tu as choisi de modifier le workflow d'Affiny plutôt que `.env` (B.4), fusionne cette modification maintenant.

## D. Une fois validé (quelques jours plus tard)

```sh
sudo systemctl disable nginx        # ne redémarre plus au boot ; la conf /etc/nginx est GARDÉE pour un retour arrière
```

Puis, quand tu n'envisages plus de retour arrière :

- arrête les renouvellements Certbot devenus inutiles : `sudo certbot delete --cert-name <nom>` pour chaque certificat (liste : `sudo certbot certificates`) ;
- éventuellement `sudo apt remove nginx` (la conf dans `/etc/nginx` reste tant que tu n'utilises pas `purge`).

## E. Retour arrière (complet)

Possible à tout moment tant que Nginx et sa conf sont présents. Coupure : ~30 s.

```sh
# 1. Libérer 80/443
cd /opt/edge && docker compose down          # sans -v : les certificats Traefik sont gardés

# 2. Affiny : retirer l'override (sinon le prochain déploiement le réappliquerait), remettre ses ports
cd /opt/affiny/deploy/preprod
sed -i '/^COMPOSE_FILE=/d' .env
docker compose -f docker-compose.yml --env-file .env up -d          # api recréé avec 127.0.0.1:13000/13004, sans edge
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env rm -sf backoffice   # optionnel : arrête le nginx du back-office
#   (le "-f docker-compose.yml" seul l'aurait laissé tourner, en simple conteneur orphelin)
sudo ss -ltnp | grep -E '127.0.0.1:1300[04]\b'                       # les deux ports sont de nouveau écoutés

# 3. Nginx de l'hôte
sudo systemctl start nginx                   # (et sudo systemctl enable nginx si tu l'avais désactivé)
curl -I https://api.affiny.krafting.be/health && curl -I https://admin.affiny.krafting.be/
```

- **Affiny** : si tu avais modifié son workflow (B.4), annule aussi cette modification. Les fichiers `docker-compose.traefik.yml`, `backoffice-nginx.conf` et `preflight.sh` peuvent rester dans le dossier (inutilisés).
- **PixelJoy** : relance le workflow avec `proxy=nginx` : l'app est republiée sur `127.0.0.1:8787` et quitte `edge`. **Mais aucun site Nginx PixelJoy n'existe encore** : `admin.pixeljoy.krafting.be` restera injoignable tant que tu n'as pas installé le modèle `backoffice/deploy/nginx/admin.pixeljoy.conf.example` (avec son certificat Certbot : `backoffice/README.md`, section 3.8).
- Les certificats Certbot non expirés resservent tels quels ; s'ils ont expiré entre-temps : `sudo certbot renew` (Nginx tourne de nouveau).

Le réseau `edge` peut rester en place (il ne gêne pas) ; pour le supprimer : `docker network rm edge` une fois que plus aucun conteneur n'y est branché.
