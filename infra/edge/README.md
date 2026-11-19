# Pile `edge` — reverse proxy Traefik partagé du VPS

Un seul **Traefik** (en conteneur) tient les ports **80** et **443** du VPS et sert **tous** les projets Docker : chaque projet déclare lui-même son domaine avec quelques **labels Docker** et rejoint le réseau Docker partagé `edge`. Traefik obtient et renouvelle seul les certificats Let's Encrypt. Aucun projet ne dépend d'un autre, et cette pile ne connaît aucun projet.

Cette pile est **indépendante des applications** (y compris de l'app PixelJoy) et ne connaît aucun projet. Les autres projets du VPS s'y branchent en suivant **[CONTRACT.md](CONTRACT.md)** (réseau, labels, exemples, ordre de bascule).

## Déploiement automatique : workflow *Edge deploy*

`.github/workflows/edge-deploy.yml` (*Actions › Edge deploy › Run workflow*, entrée `environment` : `Staging` par défaut ou `production`) installe et met à jour la pile **sans sudo**, avec l'utilisateur SSH de déploiement (groupe `docker`) et les mêmes secrets que *Backoffice deploy* (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`), plus **`ACME_EMAIL`** (email du compte Let's Encrypt, **obligatoire au premier lancement** : la configuration de Traefik refuse un email vide ; ensuite facultatif).

- envoie `infra/edge` (sans `examples/`) dans `~/edge/releases/<sha>`, bascule le lien `~/edge/current` de façon atomique (5 versions gardées) ;
- crée `~/edge/shared/.env` au premier lancement (lien `.env` dans chaque version), puis ne le touche plus ;
- copie `dynamic/` fichier par fichier dans le dossier stable `~/edge/shared/dynamic` (variable `EDGE_DYNAMIC_DIR` de `shared/.env`), monté par Traefik qui le surveille et recharge seul : le conteneur ne dépend jamais d'un dossier de version (la version en cours, la précédente et toute version encore montée ne sont jamais supprimées ; relancer le même commit garde la version en cours telle quelle) ; si `docker-compose.yml` change, Traefik est recréé (`--force-recreate`) ;
- refuse un réseau `edge` dont l'`ip-range` n'est pas `172.30.0.128/25` ou dont l'adresse `172.30.0.2` est prise par un autre conteneur que Traefik ;
- vérifie Docker, crée le réseau `edge` s'il manque (`172.30.0.0/24`) ou s'arrête s'il a un autre sous-réseau, valide la configuration, `docker compose pull` (projet compose fixe `edge` : le volume `edge_acme` des certificats persiste) ;
- **si Traefik tourne déjà, ou si 80 ET 443 sont libres** : `docker compose up -d --wait`, puis vérifie `https://admin.pixeljoy.krafting.be/catalog/v1/manifest.json` (JSON `v=1`, certificat Let's Encrypt hors *staging*, jusqu'à 3 minutes) ;
- **sinon** (Nginx de l'hôte encore actif) : Traefik n'est **pas** démarré ; le workflow réussit avec l'avertissement « ports 80/443 encore utilisés (Nginx hôte) : Traefik prêt, sera démarré au prochain lancement une fois les autres projets migrés ».

Il ne touche jamais à Nginx, à `/etc` ni aux autres projets. Démarrage à la main possible : `cd ~pixeljoy/edge/current && docker compose up -d --wait`. Arrêt / retour arrière : `docker compose -p edge down` (jamais `-v`).

> Le VPS sert aujourd'hui ses sites avec le Nginx de l'hôte ? Suis l'ordre de bascule de **[CONTRACT.md](CONTRACT.md)** ; guide détaillé avec Affiny en exemple : [MIGRATION.md](MIGRATION.md).

## Ce que fait la pile

| Élément | Choix |
| --- | --- |
| Image | `traefik:v3.7.19`, **épinglée par digest** (`@sha256:…`) ; mise à jour par Dependabot (voir « Mise à jour ») |
| Ports | `80/tcp`, `443/tcp`, `443/udp` (HTTP/3) |
| HTTP | redirection permanente globale vers HTTPS, pour tous les domaines |
| Certificats | Let's Encrypt, défi **TLS-ALPN-01** (sur le port 443), email `ACME_EMAIL`, stockage `acme.json` dans le volume `edge_acme` |
| Découverte | provider Docker en `exposedByDefault=false` : seul un conteneur avec `traefik.enable=true` est publié, et uniquement via le réseau `edge` |
| Socket Docker | **jamais monté dans Traefik** : Traefik parle à `tecnativa/docker-socket-proxy`, qui a le socket en lecture seule et n'autorise que des lectures (`GET`) sur `/containers`, `/events`, `/version`, `/_ping` (`POST=0`). Ce proxy est sur un réseau interne (`socket`), injoignable depuis les conteneurs des projets |
| En-têtes | middleware `security-headers@file` appliqué à tous les routeurs HTTPS : `X-Content-Type-Options: nosniff`, suppression de `Server` et `X-Powered-By`. Middleware `hsts@file` en option pour les applis qui n'envoient pas HSTS elles-mêmes (PixelJoy l'envoie) |
| `X-Forwarded-For` | jamais repris du client (`forwardedHeaders.insecure=false`, valeur par défaut de Traefik, écrite explicitement) : Traefik supprime les `X-Forwarded-*` reçus et met l'adresse IP réelle du client |
| Journaux | **aucun access log** (règle « aucune donnée collectée » : ni IP ni requête écrite), log général en `WARN` (avertissements et erreurs) |
| Dashboard / API | désactivés. Pas de télémétrie (`sendAnonymousUsage=false`, `checkNewVersion=false`) |
| Durcissement | conteneurs en lecture seule, `no-new-privileges`, Traefik sans aucune capability sauf `NET_BIND_SERVICE` |
| Adresse fixe | Traefik a toujours l'adresse **`172.30.0.2`** sur `edge` (sous-réseau fixe `172.30.0.0/24`) : les applis ne font confiance à `X-Forwarded-For` que venant de cette adresse (PixelJoy : `TRUSTED_PROXIES=172.30.0.2`) |
| Santé | `traefik healthcheck --ping` sur un point d'entrée `ping` dédié, lié à `127.0.0.1:8082` **dans** le conteneur : ni publié, ni joignable par les autres conteneurs de `edge`. Les routeurs sans entrypoint explicite vont sur `websecure` seulement (`asDefault`). Le proxy de socket a son propre healthcheck |

## Installation manuelle (alternative au workflow)

Tu peux aussi l'installer à la main, comme décrit ci-dessous (dans ce cas, n'utilise pas en plus le workflow : un seul projet compose `edge` doit exister).

Avec ton compte sudo (pas l'utilisateur de déploiement `pixeljoy`), sur le VPS.

### 1. Récupérer les fichiers

Seul le dossier `infra/edge` est nécessaire. Par exemple dans `/opt/edge` :

```sh
sudo mkdir -p /opt/edge && sudo chown "$USER": /opt/edge
# copie infra/edge/* (docker-compose.yml, dynamic/, .env.example) dans /opt/edge, par exemple :
#   depuis ton ordinateur : scp -r infra/edge/. <ton-utilisateur>@151.80.155.198:/opt/edge/
cd /opt/edge
ls   # docker-compose.yml  dynamic/  .env.example  README.md  MIGRATION.md
```

### 2. Configurer

```sh
cp .env.example .env
chmod 600 .env
nano .env        # ACME_EMAIL=ton-adresse@exemple.com
```

`ACME_CA_SERVER` vide = Let's Encrypt production. Pour un premier essai sans risquer les limites de taux, mets l'URL *staging* indiquée dans `.env.example` (certificats de test non reconnus par les navigateurs), puis remets-la vide et supprime le volume `edge_acme` avant de passer en production.

### 3. Créer le réseau partagé `edge` (une seule fois)

```sh
docker network inspect edge >/dev/null 2>&1 && echo "edge existe déjà : voir plus bas" ||
  docker network create --subnet 172.30.0.0/24 --gateway 172.30.0.1 --ip-range 172.30.0.128/25 edge
docker network inspect edge --format '{{range .IPAM.Config}}{{.Subnet}} {{.IPRange}}{{end}}'
# → 172.30.0.0/24 172.30.0.128/25
```

- **Sous-réseau fixe** `172.30.0.0/24` : Traefik y prend l'adresse fixe `172.30.0.2` (`docker-compose.yml`), et les applis ne croient `X-Forwarded-For` que venant d'elle. Un autre conteneur du réseau (ton autre projet, par exemple) ne peut donc pas se faire passer pour un client quelconque.
- `--ip-range 172.30.0.128/25` : les conteneurs des projets reçoivent leurs adresses dynamiques entre `.128` et `.255`, jamais `172.30.0.2`. Ne donne jamais d'`ipv4_address` fixe dans ce réseau à un autre conteneur.
- Si la création échoue avec « Pool overlaps with other one on this address space », un réseau Docker existant utilise déjà `172.30.x.x` (`docker network inspect $(docker network ls -q) --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'` le montre). Le plus simple : recréer ce réseau-là ailleurs ; sinon, choisir un autre sous-réseau privé libre et le reporter partout où `172.30.0.` apparaît (`infra/edge/docker-compose.yml`, `backoffice/docker-compose.traefik.yml`, `EDGE_SUBNET`/`EDGE_TRAEFIK_IP` de `backoffice/scripts/deploy-remote.sh`).
- Il est **externe** à la pile : un `docker compose down` de la pile `edge` ne le supprime pas et ne coupe pas les projets qui y sont branchés.

#### Le réseau `edge` existe déjà sans le bon sous-réseau

(Par exemple créé avec un simple `docker network create edge`. Le déploiement PixelJoy en `proxy=traefik` s'arrête alors avec « uses subnet … instead of 172.30.0.0/24 ».) Un réseau Docker ne se modifie pas : il faut le recréer, ce qui coupe brièvement les sites branchés dessus.

```sh
docker network inspect edge --format '{{range .Containers}}{{.Name}} {{end}}'   # conteneurs branchés
cd /opt/edge && docker compose down                       # Traefik (sans -v : certificats gardés)
# pour chaque AUTRE conteneur listé (projets) : docker network disconnect edge <nom>
docker network rm edge
docker network create --subnet 172.30.0.0/24 --gateway 172.30.0.1 --ip-range 172.30.0.128/25 edge
docker compose up -d                                      # Traefik, à l'adresse 172.30.0.2
# puis, dans le dossier de chaque projet : docker compose up -d   (rebranche ses conteneurs)
# PixelJoy : relancer le workflow (proxy=traefik)
```

### 4. Pare-feu

Si `ufw` est actif (et dans le pare-feu de l'hébergeur, s'il y en a un) :

```sh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

### 5. Démarrer

Les ports 80 et 443 doivent être libres (`sudo ss -ltnp 'sport = :443'` ne doit rien afficher ; si le Nginx de l'hôte les tient, suis [MIGRATION.md](MIGRATION.md)).

```sh
docker compose up -d
docker compose ps        # traefik et socket-proxy : "healthy" après quelques secondes
docker compose logs      # rien, ou seulement des avertissements
```

### 6. Brancher un projet

Dans le `docker-compose.yml` du projet, sur le service web :

```yaml
services:
  web:
    # … (aucun "ports:" pour 80/443 : Traefik s'en charge)
    networks:
      - default
      - edge
    labels:
      traefik.enable: "true"
      traefik.docker.network: edge
      traefik.http.routers.mon-projet.rule: Host(`www.exemple.com`)
      traefik.http.routers.mon-projet.entrypoints: websecure
      traefik.http.routers.mon-projet.tls.certresolver: letsencrypt
      traefik.http.services.mon-projet.loadbalancer.server.port: "80"   # port INTERNE du conteneur
      # optionnel, si l'appli n'envoie pas HSTS elle-même :
      # traefik.http.routers.mon-projet.middlewares: hsts@file

networks:
  edge:
    external: true
    name: edge
```

Le nom du routeur et du service (`mon-projet`) doit être **unique sur tout le VPS**. Le DNS du domaine doit pointer vers le VPS **avant** le démarrage : sinon le défi Let's Encrypt échoue (et compte dans les limites de taux).

Exemple complet sans modifier le dépôt du projet (fichier *override* + site statique servi par un petit nginx) : [`examples/affiny/`](examples/affiny/), décrit dans [MIGRATION.md](MIGRATION.md), section B.

PixelJoy : déployer avec `proxy=traefik` (valeur par défaut du workflow *Backoffice deploy*), voir `backoffice/README.md`, section 3.9.

## Vérifications

```sh
curl -sI http://www.exemple.com | head -n 3        # 301/308 (redirection permanente) vers https://
curl -sI https://www.exemple.com | head -n 5       # 200, certificat valide
docker compose logs traefik                       # erreurs ACME éventuelles (DNS, port 443 fermé…)
```

## Adresse IP des clients

Traefik transmet l'IP du client dans `X-Forwarded-For` (et supprime toute valeur envoyée par le client). Les applis doivent lire l'entrée **la plus à droite** et seulement si la connexion vient de **l'adresse de Traefik, `172.30.0.2`** (c'est ce que fait PixelJoy avec `TRUSTED_PROXIES=172.30.0.2`) : faire confiance à tout le réseau `edge` permettrait à n'importe quel conteneur branché dessus de contourner Traefik et d'inventer l'IP du client. Avec Docker en IPv4 (règles iptables par défaut), l'IP source est préservée. Si le VPS reçoit aussi du trafic **IPv6** et que Docker n'a pas IPv6 activé, le `docker-proxy` relaie ces connexions et Traefik voit l'adresse de la passerelle Docker à la place du client (sans risque de sécurité, mais toutes ces connexions partagent le même compteur de limite de connexion de PixelJoy).

Tout conteneur branché sur `edge` peut joindre les autres conteneurs de ce réseau (en contournant Traefik) : n'y branche que les services web de tes propres projets, et que chaque appli ne fasse confiance qu'à `172.30.0.2`.

## Mise à jour

Avec le workflow : relance simplement *Edge deploy* après la fusion de la mise à jour (il fait `pull` puis `up -d --wait` si Traefik tourne). À la main :

Les images sont épinglées par digest ; Dependabot (`.github/dependabot.yml`, dossier `/infra/edge`) propose les nouvelles versions. Pour appliquer : remplace `docker-compose.yml` sur le VPS par la nouvelle version, puis :

```sh
cd /opt/edge
docker compose pull && docker compose up -d
```

À la main : `docker buildx imagetools inspect traefik:v3.7.19` (ligne `Digest:`) donne le digest à reporter après `@sha256:`.

## Dépannage

- `docker compose ps` montre `unhealthy` pour `socket-proxy` : regarde `docker compose logs socket-proxy` (le socket `/var/run/docker.sock` doit exister).
- Un domaine renvoie **404** : le conteneur du projet n'a pas `traefik.enable=true`, n'est pas sur le réseau `edge`, ou sa règle `Host(...)` ne correspond pas.
- **Bad Gateway** (502) : mauvais port dans `loadbalancer.server.port` (c'est le port interne du conteneur), ou `traefik.docker.network: edge` manquant alors que le conteneur est sur plusieurs réseaux.
- Certificat auto-signé « TRAEFIK DEFAULT CERT » : le certificat n'est pas encore obtenu ; `docker compose logs traefik` indique pourquoi (DNS, port 443 fermé, limite de taux).
- Arrêter la pile : `docker compose down` (le volume `edge_acme` et donc les certificats sont gardés ; ne jamais ajouter `-v`).
