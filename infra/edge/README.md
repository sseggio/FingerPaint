# Pile `edge` — reverse proxy Traefik partagé du VPS

Un seul **Traefik** (en conteneur) tient les ports **80** et **443** du VPS et sert **tous** les projets Docker : chaque projet déclare lui-même son domaine avec quelques **labels Docker** et rejoint le réseau Docker partagé `edge`. Traefik obtient et renouvelle seul les certificats Let's Encrypt. Aucun projet ne dépend d'un autre, et cette pile ne connaît aucun projet.

Cette pile est **indépendante de PixelJoy** : le workflow GitHub de PixelJoy ne la déploie jamais (l'utilisateur de déploiement n'a pas sudo). Tu l'installes une fois, à la main, avec ton compte sudo.

> Le VPS sert aujourd'hui ses sites avec le Nginx de l'hôte ? Ne démarre pas cette pile directement : suis **[MIGRATION.md](MIGRATION.md)** (ordre sûr, retour arrière).

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
| Santé | `traefik healthcheck --ping` (point d'entrée interne `:8080`, non publié) ; le proxy de socket a son propre healthcheck |

## Installation pas à pas

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
docker network create edge
```

Il est **externe** à la pile : un `docker compose down` de la pile `edge` ne le supprime pas et ne coupe pas les projets qui y sont branchés.

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

PixelJoy : déployer avec `proxy=traefik` (valeur par défaut du workflow *Backoffice deploy*), voir `backoffice/README.md`, section 3.9.

## Vérifications

```sh
curl -sI http://www.exemple.com | head -n 3        # 301/308 (redirection permanente) vers https://
curl -sI https://www.exemple.com | head -n 5       # 200, certificat valide
docker compose logs traefik                       # erreurs ACME éventuelles (DNS, port 443 fermé…)
```

## Adresse IP des clients

Traefik transmet l'IP du client dans `X-Forwarded-For` (et supprime toute valeur envoyée par le client). Les applis doivent lire l'entrée **la plus à droite** et seulement si la connexion vient du réseau Docker (c'est ce que fait PixelJoy). Avec Docker en IPv4 (règles iptables par défaut), l'IP source est préservée. Si le VPS reçoit aussi du trafic **IPv6** et que Docker n'a pas IPv6 activé, le `docker-proxy` relaie ces connexions et Traefik voit l'adresse de la passerelle Docker à la place du client (sans risque de sécurité, mais toutes ces connexions partagent le même compteur de limite de connexion de PixelJoy).

Tout conteneur branché sur `edge` peut joindre les autres conteneurs de ce réseau : n'y branche que les services web de tes propres projets.

## Mise à jour

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
