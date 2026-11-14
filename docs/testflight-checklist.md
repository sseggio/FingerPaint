# Checklist TestFlight (V1)

Objectif : une build iOS `production` envoyée sur TestFlight, conforme aux règles produit (zéro pub, zéro tracking, aucune donnée collectée, hors ligne).
Les valeurs `REPLACE_ME` et les placeholders ci-dessous sont à remplacer **avant** la première soumission.

## 0. Pré-requis vérifiés dans le dépôt

```bash
npx tsc --noEmit && npx expo lint && npx jest --ci && npm run validate:art
npx expo-doctor                      # 20/20 checks
npx expo config --type public        # identité, privacy manifest
npx expo export --platform ios       # le bundle JS compile
```

`src/release/app-config.test.ts` vérifie le bundle id, le privacy manifest, `ITSAppUsesNonExemptEncryption`, les profils EAS et l'icône (1024×1024 sans alpha). `src/release/sdk-blocklist.test.ts` échoue si un SDK de pub, d'analytics, de tracking ou de crash reporting entre dans `package.json`.

### Couleurs de l'icône et du splash (synchronisation)

Elles viennent des tokens de `src/theme/tokens.ts` : fond du splash `colors.light.background` (`#FFF8F0`) et `colors.dark.background` (`#14121F`), fond de l'icône adaptative Android `palette.violet` (`#7B5CFF`). La mascotte « Goutte » de `scripts/generate-icons.mjs` utilise `palette.pink`, `primary`, `ink` et les accents. Si un token change : mettre à jour `TOKENS` dans le script, relancer `node scripts/generate-icons.mjs`, puis les couleurs de `app.json` (le test de configuration compare `app.json` aux tokens).

## 1. Comptes

- [ ] **Apple Developer Program** (99 $/an) actif ; noter le **Team ID** (developer.apple.com › Membership).
- [ ] App Store Connect › *Accords, taxes et banque* : accord **Paid Apps** signé (sinon aucun achat intégré n'est renvoyé).
- [ ] Compte **Expo** (gratuit) pour EAS.

## 2. Identifiants (placeholders à remplacer)

| Où | Clé | Valeur actuelle | À faire |
| --- | --- | --- | --- |
| `app.json` | `ios.bundleIdentifier`, `android.package` | `com.fingerpaint.app` | Garder si l'identifiant est libre sur le compte Apple, sinon choisir un id unique (et mettre à jour les SKU de `src/features/entitlements/types.ts` + `docs/iap-setup.md`). |
| `eas.json` | `submit.production.ios.ascAppId` | `REPLACE_ME` | *Apple ID* numérique de l'app (App Store Connect › App › Informations générales). |
| `eas.json` | `submit.production.ios.appleTeamId` | `REPLACE_ME` | Team ID Apple (10 caractères). |
| `src/features/about/app-info.ts` | `CONTACT_EMAIL` | `hello@fingerpaint.app` | Adresse de support réelle (aussi dans `docs/privacy-policy.md`). |
| `app.json` | `extra.eas.projectId` | absent | Ajouté automatiquement par `eas init`. |

## 3. Créer l'app

1. developer.apple.com › *Identifiers* : l'identifiant `com.fingerpaint.app` peut être créé à la main, ou laissé à EAS (il le crée et active la capacité *In-App Purchase* lors de la synchronisation des capacités).
2. App Store Connect › *Apps* › **+ Nouvelle app** : plateforme iOS, nom **FingerPaint** (ou variante si pris), langue principale Français, bundle id `com.fingerpaint.app`, SKU interne libre (ex. `fingerpaint-ios`).
3. Reporter l'*Apple ID* de l'app dans `eas.json` (`ascAppId`).

## 4. EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest init                       # lie le projet, écrit extra.eas.projectId dans app.json (à committer)
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios --profile production --latest
```

- `cli.appVersionSource: remote` + `autoIncrement` : le **build number** est géré par EAS (pas de `ios.buildNumber` dans `app.json`). La **version** marketing reste `version` dans `app.json` (`1.0.0`).
- Au premier build, laisser EAS générer le certificat de distribution et le profil de provisioning (`eas credentials` pour les consulter).
- Profils : `development` (dev client, boutique simulée `mock`), `preview` (distribution interne ad hoc, StoreKit), `production` (App Store/TestFlight, StoreKit). Seul `production` peut être soumis à TestFlight.
- Raccourci possible : `npx testflight` (build + submit).
- Dry-run sans compte : `npx expo export --platform ios` valide le bundle ; `npx expo config --type public` valide la configuration. Une build `preview` réelle nécessite un compte Apple (les appareils de test doivent être enregistrés : `eas device:create`).

## 5. Achats intégrés

Suivre `docs/iap-setup.md` : créer les 3 produits **Non-Consumable** (`com.fingerpaint.app.pro`, `com.fingerpaint.app.pack.ocean`, `com.fingerpaint.app.pack.neon`), prix, localisations FR/EN, capture de revue (la boutique), partage familial. Les soumettre avec la première version.

## 6. App Privacy (étiquette de confidentialité)

- [ ] App Store Connect › *App Privacy* › **« Données non collectées » / « Data Not Collected »**.
- [ ] *Privacy Policy URL* : héberger `docs/privacy-policy.md` (FR/EN) et coller l'URL.
- [ ] Pas d'App Tracking Transparency (aucun pistage, pas d'IDFA).
- [ ] Export compliance : `ITSAppUsesNonExemptEncryption = false` (seul le HTTPS du système est utilisé, par StoreKit) : pas de question à la soumission.
- [ ] Privacy manifest (`ios.privacyManifests`) : `NSPrivacyTracking` false, aucun domaine, aucune donnée collectée ; API à raison requise : UserDefaults `CA92.1`, FileTimestamp `C617.1`/`0A2A.1`/`3B52.1`, DiskSpace `E174.1`/`85F4.1`, SystemBootTime `35F9.1` (déclarées par React Native, AsyncStorage, expo-file-system, expo-constants, expo-localization…). À revérifier après tout ajout de dépendance native : `find node_modules -name PrivacyInfo.xcprivacy`.

## 7. Captures d'écran

iPhone uniquement (`ios.supportsTablet: false`) : jeu 6,9" (1320×2868 ou 1290×2796) obligatoire ; Apple réduit pour les autres tailles.
Suggestions (FR et EN, mode clair, une en sombre) :
1. Bibliothèque avec albums colorés ;
2. Coloriage zoomé avec numéros et palette ;
3. Œuvre terminée + confettis ;
4. Image du jour et série indulgente ;
5. Mode daltonien (symboles) / gros numéros ;
6. Boutique honnête : achats uniques, « Restaurer les achats ».

## 8. Fiche App Store (proposition)

### Français
- **Nom** (30) : FingerPaint
- **Sous-titre** (30) : Pixel art par numéros, zen
- **Mots-clés** (100) : coloriage,pixel,art,numéros,peinture,détente,zen,anti-stress,dessin,couleur,mosaïque,hors ligne
- **Texte promotionnel** : Colorie des illustrations pixel art originales, sans pub et sans connexion.
- **Description** :
  > Colorie des illustrations pixel art originales, case par case, numéro par numéro.
  >
  > FingerPaint, c'est le coloriage relaxant comme il devrait être : sans publicité, sans pistage, sans énergie ni minuteur. Tout fonctionne hors ligne et tes données restent sur ton appareil.
  >
  > • 48 illustrations originales en 6 albums : jardin, océan, cuisine, animaux, espace…
  > • Coloriage fluide : zoom, glisser pour remplir, indices gratuits et illimités
  > • Une image du jour et une série indulgente (des jokers, jamais de pression)
  > • Accessible : mode daltonien avec symboles, gros numéros, contraste élevé, mode gaucher
  > • Mes œuvres : retrouve tes créations, exporte-les en PNG, sauvegarde ta progression dans un fichier
  > • Rappel de pause optionnel
  >
  > Les outils et les indices sont toujours gratuits. Des achats uniques (sans abonnement) permettent d'ajouter des illustrations Pro, un pack Océan profond ou un thème néon, et de soutenir le projet.

### English
- **Name**: FingerPaint
- **Subtitle**: Calm pixel art by numbers
- **Keywords**: coloring,pixel,art,numbers,paint,relax,zen,calm,drawing,color,mosaic,offline,book
- **Promotional text**: Color original pixel art, with no ads and no connection needed.
- **Description**:
  > Color original pixel art illustrations, cell by cell, number by number.
  >
  > FingerPaint is relaxing coloring the way it should be: no ads, no tracking, no energy, no timers. Everything works offline and your data stays on your device.
  >
  > • 48 original illustrations in 6 albums: garden, ocean, kitchen, animals, space…
  > • Smooth coloring: zoom, drag to fill, free and unlimited hints
  > • A daily picture and a forgiving streak (jokers, never pressure)
  > • Accessible: colorblind mode with symbols, large numbers, high contrast, left-handed mode
  > • My artworks: find your creations, export them as PNG, back up your progress to a file
  > • Optional break reminder
  >
  > Tools and hints are always free. One-time purchases (no subscription) add Pro illustrations, a Deep Ocean pack or a neon theme, and support the project.

- **Catégorie** : Divertissement (secondaire : Graphisme et design). **Âge** : 4+.
- **URL de support** : page statique avec l'adresse de contact. **URL de confidentialité** : voir § 6.

## 9. Tests avant d'inviter des testeurs

- [ ] **Mode avion** dès le lancement (installation fraîche puis relance) : bibliothèque, coloriage, sauvegarde automatique, image du jour, Mes œuvres, export PNG (feuille de partage), réglages, À propos fonctionnent ; la boutique affiche « Réessayer » sans bloquer ; les achats déjà faits restent débloqués.
- [ ] Achats sandbox (voir `docs/iap-setup.md` § 3) : achat, annulation, Ask to Buy, restauration après réinstallation.
- [ ] Achat bloqué (feuille StoreKit ignorée, app mise en arrière-plan) : la boutique se libère (au retour au premier plan après ~10 s, ou au bout de 2 min) avec un message honnête.
- [ ] VoiceOver sur Bibliothèque, Coloriage, Boutique, Réglages, À propos ; Dynamic Type au maximum.
- [ ] Mode sombre ; langue FR et EN (Réglages › Langue et langue système).
- [ ] Réglages › À propos : version + numéro de build corrects.

## 10. Notes de test TestFlight (« What to Test »)

### FR
> Merci de tester FingerPaint ! Points à regarder : fluidité du coloriage (zoom, glisser pour remplir), lisibilité des numéros, image du jour, export PNG et sauvegarde. Essayez aussi en mode avion : tout doit fonctionner. Les achats sont en environnement sandbox : vous ne serez pas débité. Signalez tout texte peu clair, bug ou ralentissement via le bouton « Envoyer un commentaire » de TestFlight.

### EN
> Thanks for testing FingerPaint! Please look at: coloring smoothness (zoom, drag to fill), number readability, the daily picture, PNG export and backup. Also try airplane mode: everything should work. Purchases run in the sandbox: you will not be charged. Report any unclear text, bug or slowdown with TestFlight's "Send Beta Feedback".

### Notes pour l'équipe de revue (App Review)
> No account or login is required. The app works fully offline. In-app purchases are one-time, non-consumable (Pro artworks, Deep Ocean pack, Neon theme) and can be found in Settings › Shop & support, or by tapping a locked artwork. "Restore purchases" is in the shop.
