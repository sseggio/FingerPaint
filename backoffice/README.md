# PixelJoy — catalogue en ligne et back-office

Petit serveur auto-hébergé qui publie de **nouvelles illustrations** pour l'app PixelJoy, sans mise à jour de l'app :

- un **catalogue public** en lecture seule (`/catalog/v1/…`) : aucun compte, aucun cookie, aucun journal d'accès, aucune adresse IP enregistrée ;
- un **back-office** (`/admin`) réservé à une seule personne (toi), protégé par mot de passe : import d'un PNG, conversion en œuvre à colorier, aperçu, publication immédiate ou planifiée, gestion des albums.

Les 48 œuvres embarquées dans l'app n'ont pas besoin d'être dans le catalogue ; leurs identifiants sont réservés (le serveur refuse un id déjà utilisé par l'app).

Technique : Node 22, [Hono](https://hono.dev), SQLite (`node:sqlite`, intégré à Node), fichiers JSON sur disque, Caddy en frontal (HTTPS automatique). Le code de validation et d'encodage des œuvres est **celui de l'app** (`src/lib/artwork`), importé tel quel.

---

## 1. Ce qu'il te faut

- Un **VPS** Linux (Debian/Ubuntu, 1 vCPU et 1 Go de RAM suffisent) avec un accès SSH.
- Un **nom de domaine** dont tu gères la zone DNS.
- **Docker** et **Docker Compose** sur le VPS. Si ce n'est pas déjà fait :

  ```sh
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"   # puis déconnecte-toi / reconnecte-toi
  docker compose version            # doit afficher une version 2.x
  ```

- Les ports **80** et **443** ouverts sur le VPS (pare-feu de l'hébergeur et `ufw` le cas échéant) : Caddy en a besoin pour obtenir le certificat HTTPS.

## 2. DNS

Chez ton registrar, crée un **enregistrement A** pour le sous-domaine choisi, pointant vers l'adresse IPv4 du VPS (et un enregistrement AAAA si le VPS a une IPv6) :

| Type | Nom | Valeur |
| --- | --- | --- |
| A | `catalogue` | `203.0.113.10` (l'IP de ton VPS) |

Vérifie la propagation (quelques minutes à quelques heures) : `ping catalogue.example.com` doit répondre avec l'IP du VPS.

## 3. Installation

Sur le VPS :

```sh
git clone https://github.com/<ton-compte>/<ton-depot>.git pixeljoy
cd pixeljoy/backoffice
cp .env.example .env
nano .env        # renseigne DOMAIN=catalogue.example.com
```

### Générer le secret de session

```sh
openssl rand -hex 32
```

Colle le résultat dans `.env` : `SESSION_SECRET=…`.

### Générer le hash du mot de passe admin

Le mot de passe n'est jamais stocké en clair : seul un hash scrypt va dans `.env`. Choisis un mot de passe long (12 caractères minimum, une phrase de passe c'est très bien).

Avec Docker (rien d'autre à installer) :

```sh
docker compose build app
docker compose run --rm --no-deps app node dist/hash-password.mjs
```

Ou, si Node 22 est installé sur ta machine : `npm ci && npm run hash-password`.

La commande affiche une ligne `ADMIN_PASSWORD_HASH=scrypt:…` : copie-la **telle quelle** dans `.env`.

### Démarrer

```sh
docker compose up -d
docker compose ps        # « app » doit passer à healthy, « caddy » à running
```

Ouvre `https://catalogue.example.com/admin` : la page de connexion s'affiche (le premier accès peut prendre une minute, le temps que Caddy obtienne le certificat).

Le manifeste public est à `https://catalogue.example.com/catalog/v1/manifest.json`.

### Brancher l'app sur le catalogue

L'app lit l'adresse du catalogue dans la variable `EXPO_PUBLIC_CATALOG_URL`, **absente par défaut** (catalogue en ligne désactivé : l'app ne montre que le contenu embarqué et ne fait aucune requête). Une fois le domaine en ligne :

1. Dans `eas.json` (à la racine du dépôt), ajoute `"EXPO_PUBLIC_CATALOG_URL": "https://catalogue.example.com"` (jamais une valeur vide : EAS la refuse) dans `build.preview.env` et `build.production.env` (et `build.development.env` si tu veux tester en développement). Uniquement l'origine, sans `/catalog/...` ni `/` final. Seul `https://` est accepté : toute autre valeur désactive la fonctionnalité.
2. En local : `EXPO_PUBLIC_CATALOG_URL=https://catalogue.example.com npx expo start` (ou une ligne dans `.env.local`).
3. Rebuild (`eas build`) : la variable est figée dans l'app au moment du build.

L'app télécharge le manifeste au démarrage puis au retour au premier plan (au plus toutes les 6 h), et seulement les œuvres nouvelles ou modifiées (`rev` supérieure). Requêtes anonymes : aucun cookie, aucun identifiant, aucun en-tête personnalisé. Les fichiers sont vérifiés (SHA-256, 256 Ko max., mêmes règles de validation) et gardés sur l'appareil : tout reste coloriable hors ligne. Une œuvre dépubliée disparaît de la Bibliothèque mais reste dans « Mes œuvres » pour les joueurs qui l'ont commencée. Les URL des œuvres doivent être sur le **même hôte** que `EXPO_PUBLIC_CATALOG_URL` (`PUBLIC_URL` du back-office) : sinon l'app ignore tout le manifeste.

## 4. Utilisation du back-office

1. **Nouvelle œuvre** : choisis un PNG (un pixel = une case, 8 à 128 px de côté, 1 Mo max., la transparence donne des cases vides) et le nombre maximal de couleurs, puis **Convertir**. Le serveur fusionne les couleurs trop proches (ΔE < 10) ou en surnombre et trie la palette du plus sombre au plus clair, exactement comme `scripts/png-to-artwork.mjs`.
2. Vérifie l'aperçu (image agrandie, palette numérotée, nombre de cases).
3. Renseigne l'identifiant (kebab-case, ex. `sea-otter`, définitif), les titres FR/EN, l'album (existant ou nouveau), la difficulté, l'accès (`Gratuit`, `Pro` ou `Pack` + id du pack, ex. `ocean`) et la publication (maintenant ou à une date).
4. **Enregistrer en brouillon** ou **Publier**. L'œuvre est validée avec les mêmes règles que le contenu de l'app : en cas d'erreur, la liste s'affiche et rien n'est enregistré.

Onglet **Œuvres** : statut (brouillon, planifiée, publiée), **Modifier** (titres, album, accès, difficulté, publication : un changement de contenu crée une révision `rev + 1`), **Dépublier**, **Supprimer** (seulement un brouillon jamais visible : un id qui a été visible dans le catalogue reste réservé, des joueurs ont pu commencer l'œuvre ; une œuvre planifiée puis dépubliée avant sa date reste supprimable). **Publier maintenant** une œuvre déjà visible conserve sa date de publication d'origine.

Onglet **Albums** : titres, accès et ordre d'affichage des albums du catalogue. Les albums embarqués dans l'app sont en lecture seule.

## 5. Mise à jour

```sh
cd ~/pixeljoy
git pull
cd backoffice
docker compose up -d --build
docker image prune -f
```

Les images de base (`node:22-alpine`, `caddy:2-alpine`) sont **épinglées par digest** (`@sha256:…`) dans `Dockerfile` et `docker-compose.yml` : une mise à jour d'image ne s'applique jamais à ton insu. Dependabot (`.github/dependabot.yml`) ouvre chaque semaine une PR qui met à jour ces digests (et les dépendances npm) ; une fois fusionnée, `git pull` puis `docker compose up -d --build` l'applique. Pour le faire à la main : `docker buildx imagetools inspect node:22-alpine` (ou `caddy:2-alpine`) affiche le digest courant (ligne `Digest:`) à reporter après `@sha256:`.

Les données (base + fichiers d'œuvres) sont dans le volume Docker `catalog-data` : elles survivent aux mises à jour et aux redémarrages. La liste des ids embarqués est régénérée à chaque build depuis `src/content`.

Déploiement en un clic (optionnel) : le workflow GitHub **Backoffice deploy** (`.github/workflows/backoffice-deploy.yml`, lancement manuel) se connecte au VPS en SSH et exécute ces commandes. Ajoute dans *Settings › Secrets and variables › Actions* :

| Secret | Contenu |
| --- | --- |
| `VPS_HOST` | IP ou nom du VPS |
| `VPS_USER` | utilisateur SSH (membre du groupe `docker`) |
| `VPS_SSH_KEY` | clé privée SSH dédiée au déploiement (sa clé publique dans `~/.ssh/authorized_keys` du VPS) |
| `VPS_KNOWN_HOSTS` | **obligatoire** : la ou les lignes de clé d'hôte du VPS, pour vérifier son identité (le job échoue si ce secret est vide) |

Pour obtenir `VPS_KNOWN_HOSTS` sans risque : sur le VPS lui-même, lance `for f in /etc/ssh/ssh_host_*_key.pub; do echo "<ip-du-vps> $(cut -d' ' -f1,2 "$f")"; done` et copie la sortie. (Depuis ton ordinateur, `ssh-keyscan <ip-du-vps>` fonctionne aussi si tu compares l'empreinte avec celle affichée par `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` sur le VPS.)

Le chemin du dépôt sur le VPS est un paramètre du workflow (par défaut `~/pixeljoy`).

## 6. Sauvegarde

```sh
cd ~/pixeljoy/backoffice
./scripts/backup.sh
```

Crée `backups/pixeljoy-AAAAMMJJ-HHMMSS.tar.gz` (copie cohérente de la base SQLite + fichiers d'œuvres) et garde les 30 dernières archives. Pour une sauvegarde quotidienne automatique à 3 h :

```sh
crontab -e
# ajoute la ligne :
0 3 * * * cd $HOME/pixeljoy/backoffice && ./scripts/backup.sh >/dev/null 2>&1
```

Copie régulièrement le dossier `backups/` ailleurs que sur le VPS (ton ordinateur, un stockage externe).

### Restaurer une sauvegarde

```sh
cd ~/pixeljoy/backoffice
docker compose stop app
mkdir -p /tmp/restore && tar -xzf backups/pixeljoy-AAAAMMJJ-HHMMSS.tar.gz -C /tmp/restore
mv /tmp/restore/backup.sqlite /tmp/restore/catalog.sqlite
docker run --rm -v pixeljoy-catalog_catalog-data:/data -v /tmp/restore:/restore alpine \
  sh -c 'rm -rf /data/* && cp -a /restore/. /data/ && chown -R 1000:1000 /data'
docker compose start app
rm -rf /tmp/restore
```

## 7. Dépannage

- `docker compose logs app` : messages du serveur (jamais d'IP ni de requête : il n'y a pas de journal d'accès).
- `docker compose logs caddy` : problème de certificat → vérifie le DNS et les ports 80/443.
- « Invalid configuration » au démarrage : `ADMIN_PASSWORD_HASH` ou `SESSION_SECRET` manquant ou mal copié dans `.env`.
- Mot de passe oublié : génère un nouveau hash, remplace-le dans `.env`, puis `docker compose up -d`.
- Trop de tentatives de connexion : attends 15 minutes (limite anti-force brute).
- Connexion impossible même avec le bon mot de passe (« trop de tentatives ») : la limite **globale** (50 essais / 15 min, tous clients confondus) a pu être atteinte par un robot qui essaie des mots de passe. C'est voulu (aucun robot ne peut deviner le mot de passe), mais tant que l'attaque continue, **toi aussi tu es bloqué**. Le catalogue public (`/catalog/*`) et l'app ne sont pas touchés. Solutions : attendre la fin de la fenêtre de 15 min ; redémarrer le conteneur (`docker compose restart app`, les compteurs sont en mémoire) puis te connecter aussitôt ; si ça se répète, restreindre `/admin` à ton adresse IP dans le `Caddyfile` (`@admin path /admin*` + `remote_ip`).
- Un message « WARNING: catalog artwork ids also embedded in the app » au démarrage (`docker compose logs app`, également affiché dans la liste des œuvres) : une œuvre embarquée ajoutée à l'app depuis utilise le même id qu'une œuvre du catalogue. L'app ignore l'œuvre du catalogue ; recrée-la sous un autre id puis dépublie l'ancienne.

---

## Référence technique

### API publique (format consommé par l'app, F22)

`GET /catalog/v1/manifest.json` — `Cache-Control: public, max-age=300`, `ETag` (requêtes conditionnelles `If-None-Match` → 304), gzip si `Accept-Encoding: gzip`, CORS `*`, aucun cookie. Caddy ne recompresse pas `/catalog/*` (matcher `@compressible` du `Caddyfile`) : l'ETag de l'app et les 304 sont transmis tels quels.

```jsonc
{
  "v": 1,
  "updatedAt": "2026-11-15T14:33:05.137Z",       // ISO 8601, dernière modification visible
  "albums": [                                     // albums utilisés par au moins une œuvre listée
    { "id": "pets", "title": { "fr": "Animaux", "en": "Pets" }, "access": { "pack": "pets" }, "order": 6 }
  ],
  "artworks": [                                   // uniquement status publié ET publishedAt <= maintenant
    {
      "id": "flower",
      "album": "pets",
      "rev": 2,                                   // entier >= 1, +1 à chaque modification du contenu
      "url": "https://catalogue.example.com/catalog/v1/artworks/flower.2.json",
      "sha256": "0dd2…41ae07",                    // hex, SHA-256 des octets exacts du fichier
      "publishedAt": "2026-11-15T14:33:05.132Z"
    }
  ]
}
```

- `access` (album) a la même forme que dans les œuvres : `"free"`, `"pro"` ou `{ "pack": "<id>" }`. Un album embarqué (ex. `garden`) peut apparaître s'il reçoit de nouvelles œuvres.
- Les albums sont triés par `order` puis `id`, les œuvres par `publishedAt` puis `id`.

`GET /catalog/v1/artworks/<id>.<rev>.json` — le fichier au format `ArtworkSource` (voir `docs/artwork-format.md`), immuable : `Cache-Control: public, max-age=31536000, immutable`. 404 pour une œuvre non publiée, planifiée, ou une révision inconnue.

`GET /healthz` — `ok`.

### Sécurité

- Mot de passe : hash scrypt (N = 2^15) dans `ADMIN_PASSWORD_HASH`, comparaison en temps constant.
- Session : jeton aléatoire dans un cookie `__Host-pj_admin` `HttpOnly; Secure; SameSite=Strict` (12 h), seul son HMAC (`SESSION_SECRET`) est stocké en base.
- CSRF : jeton par session exigé dans l'en-tête `X-CSRF-Token` + vérification de l'en-tête `Origin` sur toute requête qui modifie quelque chose (y compris la connexion).
- Connexion limitée à 5 tentatives / 15 min par client et 50 au total (compteurs en mémoire uniquement ; la limite globale peut bloquer aussi l'admin pendant une attaque, voir Dépannage). La tentative est comptée **avant** la vérification du mot de passe (remboursée si elle réussit), et au plus 2 vérifications scrypt tournent en parallèle (au-delà : 429 immédiat), ce qui empêche de contourner la limite par rafales et d'épuiser CPU/mémoire.
- `/admin` : CSP stricte (`default-src 'none'; script-src 'self'; …`, aucun script ni style en ligne), `X-Frame-Options: DENY`, `no-store`. HSTS ajouté par Caddy.
- Uploads : 1 Mo max., taille de l'image lue dans l'en-tête PNG **avant** décodage (8..128 px), corps JSON limités à 256 Ko, toutes les entrées validées, puis l'œuvre entière passe par `validateArtwork`.
- Conteneur : utilisateur non-root, système de fichiers en lecture seule (sauf `/data`), aucune capability, port 8080 non exposé (seul Caddy est joignable).

### Développement

```sh
cd backoffice
npm ci
npm test              # vitest
npm run typecheck
cp .env.example .env  # puis ADMIN_PASSWORD_HASH, SESSION_SECRET, et PUBLIC_URL=http://localhost:8080
npm run dev           # http://localhost:8080/admin
```

Variables optionnelles : `PUBLIC_URL` (sinon `https://$DOMAIN`), `PORT` (8080), `DATA_DIR` (`./data`), `TRUST_PROXY` (`false` par défaut dans l'image ; `docker-compose.yml` le met à `true` car seul Caddy joint l'app — ne l'active jamais si le port 8080 est exposé directement), `COOKIE_SECURE` (`false` uniquement pour tester en HTTP hors `localhost`).
