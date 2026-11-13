# FingerPaint : plan de développement V1

*Novembre 2026. Stack : Expo SDK 58, React Native 0.88, TypeScript strict, Expo Router, Skia, Reanimated 4, Gesture Handler 3, zustand, AsyncStorage, jest-expo. Sources : `docs/market-analysis.md`, `CLAUDE.md`.*

**Objectif V1 :** une build TestFlight 100 % hors ligne, sans backend, sans pub, sans tracking, sans pay-to-win. Elle embarque environ 48 illustrations originales en albums, un coloriage fluide jusqu'en 128×128, des indices gratuits et l'accessibilité de série. Les achats passent par une abstraction : l'app reste entièrement utilisable sans store configuré.

**Workflow :** une feature = une branche `claude/feat-<nn>-<slug>` = une PR vers `claude/trusting-turing-c692ne`. Avant chaque PR : `npx tsc --noEmit && npx expo lint && npm test -- --ci`. Une dépendance s'ajoute avec `npx expo install` ; on vérifie toujours la doc SDK 58.

---

## 1. Architecture

### 1.1 Dossiers

```
src/
  app/                    # routes uniquement
    (tabs)/index.tsx      # Bibliothèque
    (tabs)/gallery.tsx    # Mes œuvres
    (tabs)/settings.tsx
    album/[albumId].tsx  color/[artworkId].tsx  shop.tsx  about.tsx
  screens/                # écrans
  components/ui/          # primitives du design system (F01)
  features/
    artwork/  coloring/  progress/  settings/  daily/
    entitlements/  backup/  i18n/
  lib/                    # logique pure testée : codec, bitset, storage, geometry, hints, daily
  content/
    albums.json
    artworks/<albumId>/<artworkId>.json
  theme/
scripts/                  # png-to-artwork, generate-icons
```

### 1.2 Format des illustrations (sur disque)

Il y a un fichier JSON par œuvre, importé statiquement par Metro et lisible en Node.

```ts
type HexColor = `#${string}`;
interface ArtworkSource {
  v: 1;
  id: string;                     // kebab-case, unique
  album: string;
  title: { fr: string; en: string };
  w: number; h: number;           // 8..128
  palette: HexColor[];            // 2..40 ; la clé de palette[i] est KEYS[i]
  rows: string[];                 // h lignes en RLE
  access: 'free' | 'pro' | { pack: string };
  difficulty: 1 | 2 | 3;
}
```

- L'alphabet `KEYS = "A–Z" + "a–z"` contient 52 clés et `.` marque une case vide (non coloriable).
- Chaque ligne est en RLE `<n?><clé>`, par exemple `"4.3A2B"` → `....AAABB`. Il n'y a aucun chiffre dans l'alphabet, donc l'encodage n'est pas ambigu.
- **Validation** (`src/lib/artwork/validate.ts`, lancée par Jest et par `npm run validate:art`). Elle vérifie :
  - le schéma, des ids uniques et un album existant ;
  - h lignes, chacune décodée à w ;
  - des clés connues, chaque couleur utilisée et aucune couleur en double ;
  - un ΔE76 d'au moins 10 entre deux couleurs ;
  - les titres FR et EN non vides.

### 1.3 Modèles d'exécution

```ts
interface Palette { colors: { hex: HexColor; rgb: [number, number, number]; number: number; symbol: string }[] }
interface Artwork {
  id: string; albumId: string; title: { fr: string; en: string };
  width: number; height: number; palette: Palette;
  cells: Uint8Array;          // 0 = vide, sinon index palette + 1
  colorCounts: Uint32Array; totalCells: number;
  access: ArtworkSource['access']; difficulty: 1 | 2 | 3;
}
interface Progress {
  artworkId: string;
  filled: string;             // bitset base64 des cases justes (2 Ko en 128×128)
  filledCount: number;
  status: 'new' | 'in_progress' | 'completed';
  startedAt: number; updatedAt: number; completedAt?: number; activeMs: number;
}
interface Settings {
  locale: 'system' | 'fr' | 'en'; theme: 'system' | 'light' | 'dark';
  dragToFill: boolean; haptics: boolean;
  colorblindSymbols: boolean; largeNumbers: boolean; highContrast: boolean; leftHanded: boolean;
  sessionTimerMin: 0 | 10 | 20 | 30;
}
interface Entitlements { pro: boolean; packs: string[]; source: 'none' | 'mock' | 'storekit'; updatedAt: number }
```

Une mauvaise couleur ne se pose pas : on joue une haptique légère, sans pénalité. La progression ne stocke donc que les cases justes.

### 1.4 Stores et persistance versionnée

- **`lib/storage`** stocke dans AsyncStorage une enveloppe `{ schemaVersion, savedAt, data }`. Chaque lecture passe par `try/catch`, puis une garde de type, puis les migrations `n → n+1`. Une donnée corrompue revient aux valeurs par défaut, sans crash.
- **Clés :** `fp:settings`, `fp:progress-index`, `fp:progress:<id>`, `fp:daily`, `fp:entitlements`.
- **Stores zustand :**
  - `useSettingsStore` ;
  - `useProgressStore`, qui tient un index léger ; le bitset ne se charge qu'à l'ouverture d'une œuvre ;
  - `useEntitlementsStore`, qui met en cache le dernier état ;
  - `useDailyStore`.
- **Session de coloriage :** un store éphémère. Le bitset vit dans une ref `Uint8Array` mutable, avec un compteur `revision`. On ne copie jamais le tableau.
- **Autosave :** une sauvegarde différée de 400 ms, plus une sauvegarde immédiate quand `AppState` passe en `background` et à la sortie de l'écran.

### 1.5 Canvas Skia (jusqu'à 128×128)

- Un seul `<Canvas>` contient un `<Group transform>` piloté par les shared values `scale`, `tx` et `ty`. Il n'y a aucun re-render React pendant un geste.
- **Couche fond :** une `SkImage` w×h px en niveaux de gris (luminance de la couleur cible), dessinée agrandie avec `FilterMode.Nearest` en un seul draw.
- **Couche couleur :** une `SkImage` w×h régénérée par lot, au plus une fois par frame, depuis un buffer RGBA.
- **Numéros et symboles :** ils sont dessinés via `Atlas` (texture de glyphes pré-rendue, `RSXform` calculés en worklet) et **uniquement pour les cases visibles**. Ils n'apparaissent qu'au-delà de 14 pt par case (18 pt en mode grands numéros).
- **Surbrillance de la couleur active :** un masque `SkImage` par couleur, mis en cache paresseusement.
- **Gestes (API GH 3 à vérifier) :**
  - pinch avec point focal ;
  - pan à deux doigts (à un doigt si `dragToFill` est désactivé) ;
  - tap ;
  - pan à un doigt pour le drag-fill.

  Le hit-test inverse la transformation en worklet, déduplique les cases et envoie des lots au JS (`scheduleOnRN`). Le zoom va de « grille entière visible » à 48 pt par case.
- **Budget :** 60 fps en pan et zoom sur une grille 128×128 sur iPhone 12.

### 1.6 Achats

- **Interface :** `EntitlementsProvider` expose `init`, `getProducts`, `purchase(sku)`, `restore` et `subscribe`. On le choisit avec `EXPO_PUBLIC_IAP_PROVIDER=mock|storekit|none` (`none` par défaut).
- **Providers :**
  - `MockProvider` simule les achats en local ;
  - `StoreKitProvider` s'appuie sur `expo-iap`, importé dynamiquement pour que Jest et Expo Go fonctionnent ;
  - `NoopProvider` affiche une boutique « bientôt disponible ».
- **SKU non consommables :**
  - `com.fingerpaint.app.pro` ;
  - `com.fingerpaint.app.pack.ocean` (contenu) ;
  - `com.fingerpaint.app.pack.neon` (cosmétique : thème de canvas et confettis).
- **Gating :** il passe par la fonction pure `canAccess(access, entitlements)`. Environ 75 % des œuvres sont gratuites. Les outils et les indices sont toujours gratuits.

---

## 2. Features

F01 (foundation) est en cours. La liste commence à F02.

### F02 · Format des illustrations et validation
**Branche :** `claude/feat-02-artwork-format`

- **Objectif :** encoder, décoder et valider le contenu.
- **Périmètre :**
  - `src/lib/artwork/{types,codec,palette,color,validate}.ts` (RLE, ΔE76, luminance, numéros et symboles) ;
  - `src/features/artwork/registry.ts` (`getArtwork` avec cache de décodage, `listByAlbum`) ;
  - `albums.json` et 6 œuvres de départ (16 à 48 px) ;
  - script `validate:art` ;
  - `docs/artwork-format.md`.
- **Critères d'acceptation :**
  - `decode(encode(g))` est l'identité ;
  - chaque règle invalide produit une erreur qui cite l'id et la ligne ;
  - `npm run validate:art` passe.
- **Tests :** codec (cases vides, runs longs, 128 colonnes), une règle de validation par test, décodage du registre.

### F03 · Persistance versionnée et stores
**Branche :** `claude/feat-03-persistence-stores`

- **Objectif :** un stockage local robuste et les stores globaux.
- **Périmètre :**
  - `src/lib/storage/{storage,envelope,migrations}.ts` ;
  - `src/lib/bitset.ts` ;
  - `features/settings/settings-store.ts` ;
  - `features/progress/{progress-store,progress-repo}.ts` ;
  - hydratation dans le `_layout` racine, avec le splash maintenu jusqu'à la fin.
- **Critères d'acceptation :**
  - une donnée corrompue ou de version inconnue revient aux valeurs par défaut ;
  - une migration v0 → v1 est démontrée ;
  - N remplissages rapprochés produisent une seule écriture.
- **Tests :** storage avec le mock AsyncStorage officiel, bitset (aller-retour base64 sur 16 384 bits), hydratation, debounce (fake timers).

### F04 · Localisation FR/EN
**Branche :** `claude/feat-04-i18n`

- **Objectif :** toute l'UI traduite, avec la langue système par défaut et un choix manuel.
- **Périmètre :**
  - `features/i18n/{fr,en}.ts` (dictionnaires typés) ;
  - `useT()` avec interpolation et pluriels (`Intl.PluralRules`) ;
  - `localizedTitle()` ;
  - migration des chaînes de F01 ;
  - `expo.locales` dans `app.json`.
- **Dépendance npm :** `expo-localization`.
- **Critères d'acceptation :**
  - le changement de langue est immédiat ;
  - une clé manquante est une erreur TypeScript ;
  - aucune chaîne en dur dans `screens` ni `components`.
- **Tests :** parité des clés FR/EN, pluriels FR et EN, repli `system` vers `en`.

### F05 · Canvas Skia : rendu, zoom et pan
**Branche :** `claude/feat-05-canvas-render`

- **Objectif :** afficher une œuvre avec une navigation fluide.
- **Périmètre :**
  - `features/coloring/canvas/{pixel-canvas.tsx,layers.ts,glyph-atlas.ts,use-viewport.ts}` ;
  - `lib/geometry.ts` (fit, clamp, écran↔case, plage visible) ;
  - route `color/[artworkId]` en lecture seule ;
  - fixture 128×128 de perf.
- **Critères d'acceptation :**
  - pinch avec point focal, pan borné, double-tap pour zoomer ;
  - numéros selon le seuil de zoom ;
  - aucun re-render pendant un geste ;
  - 60 fps mesurés sur appareil, notés dans la PR.
- **Tests :** `geometry` (inversion, cases visibles, clamp), buffers de couches (fonctions pures), smoke render avec le mock Skia.

### F06 · Coloriage interactif et autosave
**Branche :** `claude/feat-06-coloring`

- **Objectif :** colorier une œuvre de bout en bout.
- **Périmètre :**
  - `coloring-session.ts` (`fillCells(batch)`, compteurs, détection de fin) ;
  - `palette-bar.tsx` (progression par couleur, couleur terminée cochée, passage auto à la suivante) ;
  - tap-fill et drag-fill ;
  - surbrillance de la couleur active ;
  - `expo-haptics` ;
  - autosave ;
  - écran de fin avec confettis Reanimated et boutons « Suivante » et « Bibliothèque ».
- **Critères d'acceptation :**
  - une mauvaise couleur ne change rien ;
  - un drag sur 50 cases fait un seul lot ;
  - quitter puis revenir restaure l'état exact ;
  - la fin ne se déclenche qu'une fois.
- **Tests :** `fillCells` (bonnes, mauvaises, doublons), fin de partie, couleur suivante, aller-retour session et stockage, labels d'accessibilité de la palette.

### F07 · Indices, accessibilité et réglages
**Branche :** `claude/feat-07-hints-a11y`

- **Objectif :** des aides gratuites et illimitées, et des modes inclusifs.
- **Périmètre :**
  - `lib/hints.ts` : prochaine case de la couleur active, la plus proche du centre ;
  - bouton « Trouver » qui anime la vue vers la case ;
  - mode daltonien : symboles dans l'atlas et nom de couleur avec `colorName(hex)` en FR/EN ;
  - grands numéros, contraste élevé, mode gaucher ;
  - minuteur de séance avec rappel doux de pause ;
  - écran Réglages complet, avec la réinitialisation de la progression confirmée.
- **Critères d'acceptation :**
  - « Trouver » marche à tous les zooms et signale quand il ne reste rien ;
  - 40 symboles distincts ;
  - Dynamic Type respecté ;
  - `accessibilityLabel` sur chaque contrôle.
- **Tests :** `hints`, unicité des symboles, `colorName`, minuteur (fake timers), persistance d'un toggle.

### F08 · Bibliothèque et albums
**Branche :** `claude/feat-08-library-albums`

- **Objectif :** parcourir le catalogue et reprendre une œuvre.
- **Périmètre :**
  - onglet Bibliothèque : « Continuer », cartes d'albums avec progression `x/y`, filtres par difficulté et statut ;
  - `album/[albumId]` ;
  - `artwork-thumbnail.tsx` (`SkImage` nearest-neighbor, état partiel, cache LRU) ;
  - badges Pro et Pack discrets qui ouvrent la boutique ;
  - méta-image d'album révélée quand l'album est complet.
- **Critères d'acceptation :**
  - 60 vignettes défilent de façon fluide ;
  - la progression se met à jour au retour du coloriage.
- **Tests :** sélecteurs (`albumProgress`, `continueList`, filtres), rendu d'une carte, garde de navigation sur une œuvre verrouillée.

### F09 · Contenu V1 (48 illustrations)
**Branche :** `claude/feat-09-content-v1`

- **Objectif :** 6 albums de 8 œuvres : Jardin, Océan, Cuisine, Animaux, Espace, et le pack Océan profond.
- **Périmètre :**
  - `scripts/png-to-artwork.mjs` (PNG indexé → JSON RLE, palette triée par luminance) ;
  - les JSON de 16 à 64 px, dont 2 en 96 ou 128 px ;
  - environ 32 œuvres gratuites, 8 Pro et 8 dans le pack ;
  - `docs/content-credits.md`.
- **Dépendance npm (dev) :** `pngjs`.
- **Critères d'acceptation :**
  - `validate:art` passe ;
  - créations 100 % originales, sans marque ni personnage protégé ;
  - contenu de moins de 1 Mo.
- **Tests :** script sur une fixture PNG 4×4, répartition des accès, couverture de chaque album.

### F10 · Image du jour et série indulgente
**Branche :** `claude/feat-10-daily`

- **Objectif :** un rituel quotidien sans anxiété.
- **Périmètre :**
  - `lib/daily.ts` : image déterministe par date locale, sans répétition sur 30 jours ;
  - série avec 2 jokers par semaine consommés automatiquement, sans message culpabilisant ;
  - carte « Image du jour » en tête de Bibliothèque ;
  - `useDailyStore`.
- **Critères d'acceptation :**
  - même date, même image ;
  - un joker préserve la série ;
  - un changement de fuseau ou d'heure ne casse rien.
- **Tests :** déterminisme, absence de répétition, jokers, frontières de semaine et de DST.

### F11 · Mes œuvres, export PNG et sauvegarde
**Branche :** `claude/feat-11-gallery-backup`

- **Objectif :** valoriser les œuvres et rendre la progression transférable.
- **Périmètre :**
  - onglet « Mes œuvres » (terminées et en cours) ;
  - export PNG net sans filigrane (×8 à ×32, plafond 2 048 px) via une surface Skia hors écran, `expo-file-system` et `expo-sharing` ;
  - `features/backup` : fichier `.fingerpaint` (JSON versionné avec checksum), import validé avec fusion (on garde le plus avancé par œuvre).
- **Dépendance npm :** `expo-document-picker`.
- **Critères d'acceptation :**
  - PNG net aux bonnes dimensions ;
  - export, réinstallation puis import restaurent tout ;
  - un fichier altéré est refusé ;
  - les achats ne sont jamais importés.
- **Tests :** sérialisation, checksum, fusion, rejet de version inconnue, facteur d'échelle.

### F12 · Entitlements, boutique et restauration
**Branche :** `claude/feat-12-entitlements-shop`

- **Objectif :** des achats prêts pour StoreKit et inoffensifs sans lui.
- **Périmètre :**
  - `features/entitlements/{types,catalog,provider,mock-provider,noop-provider,storekit-provider,entitlements-store,can-access}.ts` ;
  - route `shop` honnête : prix venant du store, « Restaurer les achats » toujours visible, ni paywall ni compte à rebours ;
  - pack cosmétique Néon appliqué ;
  - panneau dev du mock ;
  - plugin `expo-iap` ;
  - `docs/iap-setup.md`.
- **Dépendance npm :** `expo-iap`.
- **Critères d'acceptation :**
  - avec `none`, tout le gratuit marche et la boutique affiche « bientôt disponible » ;
  - avec `mock`, l'achat débloque immédiatement et persiste ;
  - la restauration est idempotente ;
  - le cache fonctionne hors ligne.
- **Tests :** matrice `canAccess`, mock (achat, annulation, erreur, restauration), persistance, rendu de la boutique avec `none`.

### F13 · Release readiness (TestFlight)
**Branche :** `claude/feat-13-release-readiness`

- **Objectif :** une build iOS soumissible.
- **Périmètre :**
  - `app.json` :
    - `name` FingerPaint, `slug` et `scheme` fingerpaint ;
    - `ios.bundleIdentifier` `com.fingerpaint.app` (placeholder) ;
    - `ITSAppUsesNonExemptEncryption: false` ;
    - `ios.privacyManifests` : pas de tracking, aucune donnée collectée, API déclarées (UserDefaults `CA92.1`, file timestamp `C617.1`) ;
  - `scripts/generate-icons.mjs` : icône 1024 sans alpha, splash et icônes Android générés depuis une œuvre maison ; suppression des assets du template ;
  - `eas.json` :
    - profils `development` (dev client), `preview` (interne) et `production` (autoIncrement) ;
    - `submit.production.ios` avec placeholders `ascAppId` et `appleTeamId` ;
    - `EXPO_PUBLIC_IAP_PROVIDER` par profil ;
  - route `about` : version, crédits, confidentialité, licences, contact ;
  - `docs/testflight-checklist.md` : comptes, IAP, captures, fiche FR/EN, label « Données non collectées », test en mode avion.
- **Critères d'acceptation :**
  - `npx expo-doctor` est propre ;
  - `npx expo config --type public` est correct ;
  - une build `preview` iOS réussit (ou un dry-run documenté) ;
  - l'app fonctionne en mode avion.
- **Tests :** rendu de l'écran À propos, test de configuration (bundle id, privacy manifest, profils EAS), test de liste noire des SDK de pub et d'analytics.

---

## 3. Hors périmètre V1 et backlog V2

- **Créer :** un éditeur pixel art qui transforme une création en coloriage, puis le remix d'une œuvre terminée avec une autre palette.
- **Photo → pixel :** quantification locale, en Pro.
- **Notifications :** rappel quotidien local optionnel (`expo-notifications`), exclu de la V1 pour n'avoir aucune demande de permission.
- **Replay et partage :** timelapse, export GIF ou vidéo, mode point de croix ou perles.
- **Synchro :** iCloud ou Drive. Profils familiaux.
- **Contenu :** Club FingerPaint (abonnement léger), packs téléchargeables depuis un CDN statique, catalogue au-delà de 150 œuvres.
- **Autres :** défis par QR ou fichier, widgets, sons ASMR, remplissage automatique de zone, iPad et Apple Pencil, publication Play Store (Android reste compilable).
