# Sauvegarde `.fingerpaint` et export PNG

## Fichier `.fingerpaint` (F11)

JSON UTF-8 versionné, produit par `src/features/backup/backup-format.ts` :

```json
{
  "format": "fingerpaint-backup",
  "version": 1,
  "createdAt": 1794650000000,
  "checksum": "9c1f0e2b7a4d3c11",
  "payload": {
    "progress": {
      "tabby-cat": {
        "artworkId": "tabby-cat", "filledCount": 17, "status": "in_progress",
        "startedAt": 0, "updatedAt": 0, "activeMs": 0, "filled": "<bitset base64>"
      }
    },
    "daily": { "lastActiveDay": "2026-11-14", "streak": 6, "best": 11, "jokerDays": [], "activeDays": [] },
    "settings": { "locale": "system", "theme": "system", "...": "..." }
  }
}
```

- `checksum` : FNV-1a 64 bits (implémentation pure, `src/lib/checksum.ts`) du JSON canonique
  (clés triées, sans espaces) de `payload`. Il détecte une corruption ou une retouche manuelle ;
  ce n'est pas une signature cryptographique.
- **Jamais d'achats / entitlements** : ils ne sont ni écrits ni lus. Tout membre inconnu (par
  exemple un `entitlements` injecté) est ignoré à l'import.

### Validation à l'import

Refus du fichier entier si : fichier > 5 Mo, JSON invalide, `format` différent, `version` ≠ 1,
checksum faux, `createdAt` invalide, réglages ou série invalides, bitset mal formé ou de
mauvaise longueur, bits hors grille, `filledCount` ≠ nombre de bits, statut incohérent
(`completed` ⇔ toutes les cases).

Les ids d'illustration absents du catalogue (sauvegarde d'une version plus récente) sont
**ignorés et comptés** (« N illustrations inconnues de cette version (ignorées) » dans le
résumé), sans rejeter le reste. Les réglages ajoutés après la v1 (`neonTheme`, `goldConfetti`)
prennent leur valeur par défaut s'ils manquent.

### Fusion

- Par illustration, la progression la plus avancée gagne (plus de cases ; à égalité, terminée
  bat non terminée ; égalité parfaite : l'état local est conservé).
- Série : l'état dont la série encore vivante aujourd'hui est la plus longue gagne ; les jours
  coloriés plus tard de l'autre côté sont rejoués dessus ; `best` = max.
- Réglages : restaurés depuis la sauvegarde.

Un écran de confirmation (`/backup-import`) résume les changements avant d'appliquer. Au
moment d'appliquer, le plan de fusion est **recalculé depuis l'état courant** : ce qui a été
colorié (ou effacé) pendant que l'écran était ouvert n'est jamais écrasé.

## Export PNG

`src/features/gallery/render-png.ts` : rendu sur une surface Skia hors écran (raster CPU),
une case = un carré de `scale`×`scale` pixels en échantillonnage nearest-neighbor, sans filigrane.

- Échelle (`src/lib/export-scale.ts`) : le plus grand entier de ×8 à ×32 tel que le grand côté
  tienne dans 2 048 px (16×16 → 512 px, 64×64 → 2 048 px, 128×128 → 2 048 px).
- Cases vides (non coloriables) : transparentes par défaut, ou fond clair `#FFF8F0` / sombre
  `#14121F` (tokens `colors.*.background`) au choix dans la feuille d'actions.
- Œuvre en cours : l'état partiel est exporté (cases non remplies en gris clair, comme dans l'app).
- « Exporter en PNG » garde une copie dans `Documents/exports/` puis ouvre la feuille de partage
  (Enregistrer l'image, Fichiers…) ; « Partager » passe par une copie temporaire du cache.
- Nettoyage : seule la dernière exportation de chaque œuvre est gardée dans `exports/`, les
  anciennes copies de partage du cache sont purgées à chaque partage, et seule la dernière
  sauvegarde `.fingerpaint` reste dans `cache/backups/`.
