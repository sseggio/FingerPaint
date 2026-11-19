# Contrat `edge` — cohabiter derrière le Traefik partagé du VPS

Destiné aux **autres projets** du VPS (et à leurs agents IA). Un seul **Traefik** (pile `edge`, déployée par le workflow *Edge deploy* de PixelJoy) tient les ports **80/443**, obtient les certificats Let's Encrypt et route chaque domaine vers le conteneur qui le déclare par des **labels Docker**. Ce dépôt ne modifie jamais ton projet : c'est à toi d'appliquer ce contrat dans ton propre `docker-compose`.

## Règles

1. **Réseau** : le service web rejoint le réseau Docker **externe** `edge` (`172.30.0.0/24`). Ne demande **jamais** d'`ipv4_address` dans `172.30.0.0/25` (réservé ; tes conteneurs reçoivent une adresse dynamique en `.128–.255`). Mieux : ne demande aucune IP fixe.
2. **Proxy de confiance** : Traefik a l'adresse fixe **`172.30.0.2`**. C'est la **seule** adresse dont ton appli peut croire `X-Forwarded-For` / `X-Forwarded-Proto` (lire l'entrée **la plus à droite**). Traefik supprime les `X-Forwarded-*` envoyés par les clients.
3. **Labels requis** sur le service web (noms de routeur/service **uniques sur tout le VPS**, préfixe-les par ton projet) :
   - `traefik.enable: "true"`
   - `traefik.docker.network: edge`
   - ``traefik.http.routers.<nom>.rule: Host(`ton.domaine`)``
   - `traefik.http.routers.<nom>.entrypoints: websecure`
   - `traefik.http.routers.<nom>.tls.certresolver: letsencrypt`
   - `traefik.http.services.<nom>.loadbalancer.server.port: "<port INTERNE du conteneur>"`
4. **WebSocket** : natif, rien à configurer (pas d'en-têtes `Upgrade` à ajouter).
5. **Ports** : aucun `ports:` 80/443, aucun reverse proxy sur l'hôte, **aucun port publié pour le web**. Une base de données ou un outil d'admin qui doit être publié : `127.0.0.1:<port>` uniquement, jamais `0.0.0.0` (Docker contourne `ufw`).
6. **Fichiers statiques / SPA** : servis par un petit conteneur (ex. `nginx:alpine`, non-root, lecture seule) branché sur `edge`, pas par l'hôte.
7. **En-têtes** : `security-headers@file` (nosniff, sans bannière `Server`) est appliqué d'office sur `websecure`. HSTS en option : `traefik.http.routers.<nom>.middlewares: hsts@file` (si l'appli ne l'envoie pas elle-même).
8. **Journaux** : Traefik n'écrit **aucun access log** ; n'en ajoute pas dans tes conteneurs web non plus.
9. **DNS** : le domaine doit pointer vers le VPS **avant** le démarrage (sinon le défi ACME échoue ; Let's Encrypt limite à 5 échecs par heure et par nom).
10. Ne branche sur `edge` **que** les services web : tout conteneur du réseau peut joindre les autres.

Toujours déclarer le réseau en bas du fichier :

```yaml
networks:
  edge:
    external: true
    name: edge
```

## Exemples copiables

### Service HTTP simple

```yaml
services:
  web:
    image: mon-app:1.0
    networks: [default, edge]
    labels:
      traefik.enable: "true"
      traefik.docker.network: edge
      traefik.http.routers.monprojet-web.rule: Host(`www.exemple.com`)
      traefik.http.routers.monprojet-web.entrypoints: websecure
      traefik.http.routers.monprojet-web.tls.certresolver: letsencrypt
      traefik.http.services.monprojet-web.loadbalancer.server.port: "3000"
```

### API + WebSocket sur deux ports internes

```yaml
services:
  api:
    image: mon-api:1.0
    networks: [default, edge]          # default : base de données, redis…
    labels:
      traefik.enable: "true"
      traefik.docker.network: edge
      traefik.http.routers.monprojet-api.rule: Host(`api.exemple.com`)
      traefik.http.routers.monprojet-api.entrypoints: websecure
      traefik.http.routers.monprojet-api.tls.certresolver: letsencrypt
      traefik.http.routers.monprojet-api.service: monprojet-api
      traefik.http.services.monprojet-api.loadbalancer.server.port: "3000"
      traefik.http.routers.monprojet-ws.rule: Host(`api.exemple.com`) && PathPrefix(`/socket.io/`)
      traefik.http.routers.monprojet-ws.priority: "100"
      traefik.http.routers.monprojet-ws.entrypoints: websecure
      traefik.http.routers.monprojet-ws.tls.certresolver: letsencrypt
      traefik.http.routers.monprojet-ws.service: monprojet-ws
      traefik.http.services.monprojet-ws.loadbalancer.server.port: "3004"
  db:
    image: postgres:17
    # pas de ports: (ou "127.0.0.1:5432:5432" si un outil de l'hôte en a besoin)
```

### Site statique (SPA)

```yaml
services:
  site:
    image: nginx:1.30-alpine
    user: "101:101"
    read_only: true
    tmpfs: [/tmp, /var/cache/nginx]   # read_only : le pid va dans /tmp (pid /tmp/nginx.pid; dans la conf)
    volumes:
      - ./dist:/srv/site:ro
      - ./site-nginx.conf:/etc/nginx/nginx.conf:ro   # pid /tmp/nginx.pid; listen 8080; try_files $uri /index.html; access_log off;
    networks: [edge]
    labels:
      traefik.enable: "true"
      traefik.docker.network: edge
      traefik.http.routers.monprojet-site.rule: Host(`admin.exemple.com`)
      traefik.http.routers.monprojet-site.entrypoints: websecure
      traefik.http.routers.monprojet-site.tls.certresolver: letsencrypt
      traefik.http.services.monprojet-site.loadbalancer.server.port: "8080"
```

Exemple complet (fichier *override* sans toucher au compose d'origine, conf nginx durcie, script de vérification) : [`examples/affiny/`](examples/affiny/).

## Ordre de bascule (Nginx de l'hôte → Traefik)

1. **Chaque projet** prépare sa config : réseau `edge` + labels, **sans retirer encore** ses ports locaux si le Nginx de l'hôte les utilise (les deux cohabitent : Traefik n'est pas encore démarré). Le workflow *Edge deploy* peut être lancé dès maintenant : il installe tout et **ne démarre pas** Traefik tant que 80/443 sont occupés (succès avec avertissement).
2. **Quand tous les projets sont prêts**, l'admin du VPS : `sudo systemctl stop nginx`, puis relance le workflow *Edge deploy* de PixelJoy (ou `cd ~pixeljoy/edge/current && docker compose up -d --wait`). Traefik démarre et obtient les certificats.
3. **Chaque projet** retire ensuite ses ports locaux devenus inutiles et vérifie ses domaines en HTTPS.
4. Quelques jours plus tard, si tout va bien : `sudo systemctl disable nginx`.

**Retour arrière** : `docker compose -p edge down` (jamais `-v` : les certificats sont dans le volume `edge_acme`), puis `sudo systemctl start nginx`. Les projets qui ont gardé leurs ports locaux sont aussitôt servis de nouveau par Nginx.
