# Format des illustrations

Chaque œuvre est un fichier JSON `src/content/artworks/<albumId>/<artworkId>.json`, importé statiquement par Metro via le manifeste `src/content/index.ts` (et lisible en Node). Les albums sont décrits dans `src/content/albums.json`.

## Œuvre (`ArtworkSource`, `src/lib/artwork/types.ts`)

```jsonc
{
  "v": 1,                                   // version du schéma
  "id": "strawberry",                       // kebab-case, unique, = nom du fichier
  "album": "kitchen",                       // id présent dans albums.json
  "title": { "fr": "Fraise", "en": "Strawberry" },
  "w": 16, "h": 16,                         // 8..128
  "palette": ["#7A1030", "#F2304B", "…"],   // 2..40 couleurs #RRGGBB ; palette[i] ↔ KEYS[i]
  "rows": ["7.2B7.", "…"],                  // h lignes RLE
  "access": "free",                         // "free" | "pro" | { "pack": "<id>" }
  "difficulty": 1                           // 1 | 2 | 3
}
```

### Clés et RLE

- `KEYS = A–Z puis a–z` (52 clés). `palette[0]` est `A`, `palette[1]` est `B`, etc.
- `.` désigne une case vide, non coloriable.
- Une ligne est une suite de `<n?><clé>` : `"4.3A2B"` → `....AAABB`. Sans nombre, le run vaut 1. L'alphabet ne contient aucun chiffre, donc le décodage n'est pas ambigu. Un run ne commence jamais par `0`.
- Encodage canonique (`encodeRow`) : un run de 1 s'écrit sans nombre.
- Le numéro affiché d'une couleur est `index + 1` ; son symbole (mode daltonien) est `SYMBOLS[index]` (`src/lib/artwork/palette.ts`), une forme vectorielle définie dans `src/lib/symbols.ts`.
- Les illustrations générées trient leur palette par luminance (la couleur 1 est la plus sombre).

## Album (`albums.json`)

```json
{ "v": 1, "albums": [{ "id": "garden", "title": { "fr": "Jardin", "en": "Garden" }, "order": 0 }] }
```

`pack` (optionnel) indique que l'album appartient à un pack de contenu (ex. `deep-ocean` → pack `ocean`).

## Validation (`src/lib/artwork/validate.ts`)

Lancée par Jest (`src/content/content.test.ts`) et par `npm run validate:art`. Chaque erreur cite l'id de l'œuvre et l'emplacement, au format `[id] where: message` (ex. `[strawberry] row 3: decodes to 15 cells, expected 16`).

| Règle | Emplacement cité |
| --- | --- |
| `v` vaut 1 | `v` |
| `id` en kebab-case, unique dans le contenu | `id` |
| `album` en kebab-case et présent dans `albums.json` | `album` |
| titres FR et EN non vides | `title.fr`, `title.en` |
| `access` valide, `difficulty` ∈ {1,2,3} | `access`, `difficulty` |
| `w`, `h` entiers dans 8..128 | `w`, `h` |
| palette de 2 à 40 couleurs `#RRGGBB` | `palette`, `palette[i]` |
| aucune couleur en double (insensible à la casse) | `palette[j]` |
| ΔE76 ≥ 10 entre deux couleurs (CIE Lab, D65) | `palette[j]` |
| chaque couleur est utilisée | `palette[i]` |
| exactement `h` lignes | `rows` |
| chaque ligne est du RLE valide, avec des clés de la palette, et décode à `w` cases | `row y` |

Le test de contenu vérifie aussi que chaque fichier de `artworks/` est listé dans le manifeste, au chemin `<album>/<id>.json`.

Au runtime, `src/features/artwork/registry.ts` revalide le contenu : une œuvre invalide est ignorée (avertissement en dev), jamais de crash. `getArtwork(id)` décode à la demande (`toArtwork`) et met le résultat en cache ; `listByAlbum(albumId)` renvoie les sources sans décoder.

## Ajouter une œuvre

1. Créer le JSON par l'une de ces voies :
   - à la main ;
   - dans `scripts/art/` : carte ASCII (`starter.mjs`) ou dessin procédural avec `scripts/art/engine.mjs` (formes, contours, ombrage, dégradés quantifiés), puis `node scripts/generate-art.mjs` (`--only <ids>` pour en régénérer quelques-unes, `--preview <dossier>` pour des aperçus PNG et une planche-contact) ;
   - depuis un PNG (indexé, RGB ou RGBA, un pixel par case, transparence = case vide) : `node scripts/png-to-artwork.mjs art.png --id <id> --album <album> --title-fr "…" --title-en "…" [--access free|pro|pack:<id>] [--difficulty 1|2|3] [--max-colors 24]`. Le script fusionne les couleurs trop proches (ΔE76 < 10) ou en surnombre, puis trie la palette par luminance.
2. L'ajouter au manifeste `src/content/index.ts`. `node scripts/generate-art.mjs` le régénère dans l'ordre du catalogue (album, gratuit → Pro → pack, facile → difficile), en conservant les fichiers importés.
3. `npm run validate:art`.
4. Créditer l'œuvre dans `docs/content-credits.md`.

Les créations doivent être 100 % originales (aucune marque ni personnage protégé).
