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

## 3. Déploiement automatique depuis GitHub (recommandé)

Le workflow GitHub **Backoffice deploy** (`.github/workflows/backoffice-deploy.yml`) fait tout le déploiement pour toi, sans que le VPS ait besoin d'accéder à GitHub (le dépôt peut rester privé) :

1. il prépare une archive contenant uniquement ce qu'il faut pour construire le serveur (`backoffice/`, `src/lib/artwork`, `src/lib/color.ts`, `src/lib/symbols.ts`, `src/content/albums.json`, `src/content/artworks` : la liste est lue dans le `Dockerfile`) et l'envoie en SSH dans `~/pixeljoy/releases/<commit>` ;
2. au **premier** déploiement, il crée `~/pixeljoy/shared/.env` (droits `600`) avec `DOMAIN`, un `SESSION_SECRET` aléatoire tiré sur le VPS et le hash de ton mot de passe admin (calculé sur GitHub : le mot de passe en clair n'est jamais envoyé au VPS ni écrit nulle part) ;
3. il vérifie que Docker est installé et que les ports 80/443 sont libres, construit l'image, bascule le lien `~/pixeljoy/current` vers la nouvelle version (les 3 dernières sont gardées) et lance `docker compose up -d --build` ;
4. il vérifie enfin que `https://<domaine>/catalog/v1/manifest.json` et `https://<domaine>/admin` répondent (3 minutes max.), sinon il affiche l'état des conteneurs et leurs 100 dernières lignes de logs, et le job échoue.

Les données (base et œuvres) sont dans des volumes Docker nommés (`pixeljoy-catalog_catalog-data`, …) : elles ne dépendent pas du dossier de la version et survivent à chaque déploiement.

Il faut préparer le VPS **une seule fois**. Dans les commandes ci-dessous, remplace `151.80.155.198` par l'IP de ton VPS si elle est différente.

### 3.1 Installer Docker sur le VPS

Connecte-toi au VPS avec ton compte habituel (`ssh <ton-utilisateur>@151.80.155.198`), puis installe Docker avec le script officiel :

```sh
curl -fsSL https://get.docker.com | sudo sh
docker compose version     # doit afficher une version 2.x
```

### 3.2 Créer un utilisateur `deploy` dédié

Toujours sur le VPS :

```sh
sudo adduser --disabled-password --gecos "" deploy   # pas de mot de passe : connexion par clé uniquement
sudo usermod -aG docker deploy                        # le droit d'utiliser Docker
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

(Être dans le groupe `docker` revient à avoir les droits administrateur sur le VPS : cette clé ne doit servir qu'au déploiement.)

### 3.3 Créer une paire de clés SSH dédiée, sur TON ordinateur

Sur ton ordinateur (pas sur le VPS), dans un terminal :

```sh
ssh-keygen -t ed25519 -f pixeljoy_deploy -N "" -C pixeljoy-deploy
```

Cela crée deux fichiers dans le dossier courant : `pixeljoy_deploy` (clé **privée**, pour GitHub) et `pixeljoy_deploy.pub` (clé **publique**, pour le VPS).

Affiche la clé publique (`cat pixeljoy_deploy.pub`), copie la ligne `ssh-ed25519 AAAA… pixeljoy-deploy`, puis sur le VPS :

```sh
echo 'ssh-ed25519 AAAA…colle-ta-ligne-ici… pixeljoy-deploy' | sudo tee /home/deploy/.ssh/authorized_keys
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Vérifie depuis ton ordinateur : `ssh -i pixeljoy_deploy deploy@151.80.155.198 docker ps` doit afficher un tableau (vide), sans demander de mot de passe.

### 3.4 Récupérer l'empreinte du VPS (`VPS_KNOWN_HOSTS`)

GitHub doit savoir à l'avance à quel serveur il parle (sinon quelqu'un pourrait se faire passer pour ton VPS). Depuis ton ordinateur :

```sh
ssh-keyscan -t ed25519 151.80.155.198
```

La commande affiche une ligne `151.80.155.198 ssh-ed25519 AAAA…` : c'est la valeur du secret. **Vérifie-la** : sur le VPS, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` affiche une empreinte `SHA256:…` ; sur ton ordinateur, `ssh-keyscan -t ed25519 151.80.155.198 | ssh-keygen -lf -` doit afficher **exactement** la même. (Autre méthode sans réseau : sur le VPS, `echo "151.80.155.198 $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"` affiche directement la bonne ligne.)

### 3.5 Ajouter les 5 secrets dans GitHub

Sur la page du dépôt GitHub : *Settings › Secrets and variables › Actions › New repository secret*, crée :

| Secret | Valeur |
| --- | --- |
| `VPS_HOST` | `151.80.155.198` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | tout le contenu du fichier `pixeljoy_deploy` (clé privée), lignes `-----BEGIN…` et `-----END…` comprises |
| `VPS_KNOWN_HOSTS` | la ligne vérifiée à l'étape 3.4 |
| `BACKOFFICE_ADMIN_PASSWORD` | ton mot de passe admin (12 caractères minimum, une phrase de passe c'est très bien) |

Ensuite, supprime la clé privée de ton ordinateur si tu n'en as plus besoin (`rm pixeljoy_deploy`) : elle est dans GitHub, et tu peux toujours en refaire une.

**Environnement GitHub** : le job lit ses secrets dans l'environnement choisi au lancement (entrée `environment` : `Staging` par défaut, ou `production`), en plus des secrets de dépôt. Si tu ranges les 5 secrets dans un environnement, lance le workflow avec ce même environnement. **Optionnel, plus strict** : pour que seuls les déploiements depuis la branche d'intégration puissent lire les secrets : *Settings › Environments › Staging* (ou `production`) ; dans *Deployment branches and tags*, choisis *Selected branches and tags* et ajoute `claude/trusting-turing-c692ne` ; puis recrée les 5 secrets dans *Environment secrets* et supprime-les des *Repository secrets*. N'active **pas** *Required reviewers* : le déploiement doit rester déclenchable sans approbation manuelle (bouton *Run workflow* ou API). Lance alors le workflow sur cette branche.

### 3.6 Ouvrir les ports 80 et 443

Caddy en a besoin pour obtenir le certificat HTTPS (Let's Encrypt). Dans le pare-feu de ton hébergeur (s'il y en a un d'activé) et, si `ufw` est utilisé sur le VPS :

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

Aucun autre programme ne doit déjà utiliser ces ports (un Apache ou Nginx installé par défaut, par exemple : `sudo ss -ltnp 'sport = :80'` montre lequel). Le workflow affiche un avertissement dans ce cas.

### 3.7 Lancer le déploiement

Sur GitHub : onglet *Actions › Backoffice deploy › Run workflow*. Paramètres :

- `domain` : le sous-domaine (par défaut `admin.pixeljoy.krafting.be`, l'enregistrement DNS A doit pointer vers le VPS) ;
- `path` : le dossier sur le VPS (par défaut `~/pixeljoy`, dans le dossier personnel de `deploy`) ;
- `rotate_password` : laisse décoché. Coche-le uniquement pour **changer le mot de passe admin** : modifie d'abord le secret `BACKOFFICE_ADMIN_PASSWORD`, puis relance le workflow avec la case cochée (seul `ADMIN_PASSWORD_HASH` est remplacé dans `shared/.env`).

Pour mettre à jour le serveur plus tard, relance simplement le workflow. Après le premier déploiement, `shared/.env` n'est plus jamais réécrit (sauf `rotate_password`) : pour changer de domaine, modifie `DOMAIN` dans `~/pixeljoy/shared/.env` sur le VPS puis relance le workflow avec le nouveau `domain`.

Sur le VPS, la version en ligne est dans `~/pixeljoy/current/backoffice` : c'est le dossier où lancer les commandes `docker compose …` et `./scripts/backup.sh` des sections suivantes (les sauvegardes vont dans `~/pixeljoy/shared/backups`, conservé entre les versions). Pour revenir à une version précédente : `cd ~/pixeljoy && ln -sfn releases/<commit> current && cd "$(readlink -f current)/backoffice" && docker compose up -d`.

## 3 bis. Installation manuelle (alternative)

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

Avec le déploiement automatique (section 3), une mise à jour = relancer le workflow **Backoffice deploy** ; les commandes ci-dessus concernent l'installation manuelle.

## 6. Sauvegarde

```sh
cd ~/pixeljoy/backoffice          # déploiement automatique : cd ~/pixeljoy/current/backoffice
./scripts/backup.sh
```

Crée `backups/pixeljoy-AAAAMMJJ-HHMMSS.tar.gz` (copie cohérente de la base SQLite + fichiers d'œuvres) et garde les 30 dernières archives. Pour une sauvegarde quotidienne automatique à 3 h :

```sh
crontab -e
# ajoute la ligne :
0 3 * * * cd $HOME/pixeljoy/backoffice && ./scripts/backup.sh >/dev/null 2>&1
# (déploiement automatique : cd $HOME/pixeljoy/current/backoffice, les archives vont dans ~/pixeljoy/shared/backups)
```

Copie régulièrement le dossier `backups/` ailleurs que sur le VPS (ton ordinateur, un stockage externe).

### Restaurer une sauvegarde

```sh
cd ~/pixeljoy/backoffice          # déploiement automatique : cd ~/pixeljoy/current/backoffice
docker compose stop app
mkdir -p /tmp/restore && tar -xzf backups/pixeljoy-AAAAMMJJ-HHMMSS.tar.gz -C /tmp/restore
mv /tmp/restore/backup.sqlite /tmp/restore/catalog.sqlite
docker run --rm -v pixeljoy-catalog_catalog-data:/data -v /tmp/restore:/restore alpine \
  sh -c 'rm -rf /data/* && cp -a /restore/. /data/ && chown -R 1000:1000 /data'
docker compose start app
rm -rf /tmp/restore
```

## 7. Dépannage

- Le workflow **Backoffice deploy** échoue : ouvre le job dans l'onglet *Actions*, le message `Error` indique l'étape. « Missing repository secret » : un secret de la section 3.5 manque. « SSH connection failed » : vérifie `VPS_HOST`, `VPS_USER`, la clé publique dans `/home/deploy/.ssh/authorized_keys` et `VPS_KNOWN_HOSTS` (à refaire si le VPS a été réinstallé). « docker is not installed » / « cannot talk to the Docker daemon » : section 3.1 et 3.2 (puis relance). « Smoke test failed » : regarde l'étape *Diagnostics* (état des conteneurs et logs) ; le plus souvent DNS pas encore propagé ou ports 80/443 fermés ou déjà utilisés.
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
