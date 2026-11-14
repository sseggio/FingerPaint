# FingerPaint 🎨

Coloriage pixel art par numéros, **original**, pour iPhone (Android compilable) : sans pub, sans pistage, sans pay-to-win, et qui marche entièrement hors ligne.

Construit avec Expo SDK 58, React Native, TypeScript, Expo Router, Skia, Reanimated et Zustand.

## Fonctionnalités V1

- **48 illustrations originales** en 6 albums (Jardin, Océan, Cuisine, Animaux, Espace, et le pack Océan profond), de 16×16 à 96×96.
- **Coloriage fluide** (canvas Skia) : zoom et déplacement, glisser pour remplir, indices gratuits et illimités, confettis à la complétion, sauvegarde automatique.
- **Image du jour** et série indulgente (jokers, jamais de pression).
- **Mes œuvres** : galerie, export PNG, sauvegarde/restauration de la progression dans un fichier `.fingerpaint`.
- **Accessibilité** : mode daltonien (symboles), gros numéros, contraste élevé, mode gaucher, VoiceOver, Dynamic Type, FR/EN.
- **Bien-être** : rappel de pause optionnel, aucune notification.
- **Boutique honnête** : achats uniques (Pro, pack Océan profond, thème Néon), « Restaurer les achats » toujours visible ; outils et indices toujours gratuits.
- **Confidentialité** : aucune donnée collectée, tout reste sur l'appareil (voir Réglages › À propos et [docs/privacy-policy.md](docs/privacy-policy.md)).

## Lancer en local

```bash
npm install
npx expo start                                   # boutique « bientôt disponible »
EXPO_PUBLIC_IAP_PROVIDER=mock npx expo start     # boutique simulée + panneau dev
```

Les achats (`expo-iap`) et Skia demandent un **development build** (`npx expo run:ios` ou `npx eas-cli@latest build --profile development`).

Vérifications (aussi en CI) :

```bash
npx tsc --noEmit && npx expo lint && npx jest --ci && npm run validate:art
npx expo-doctor
```

Régénérer les assets : `node scripts/generate-art.mjs` (illustrations), `node scripts/generate-icons.mjs` (icône, splash, icônes Android, favicon, à partir de la mascotte pixel art « Goutte »).

## Builder pour TestFlight

1. Remplacer les placeholders (`eas.json` : `ascAppId`, `appleTeamId` ; adresse de contact) et créer l'app dans App Store Connect avec le bundle id `com.fingerpaint.app`.
2. `npx eas-cli@latest login` puis `npx eas-cli@latest init`.
3. `npx eas-cli@latest build -p ios --profile production` (build number incrémenté par EAS).
4. `npx eas-cli@latest submit -p ios --latest`.

Détail complet (IAP, étiquette « Données non collectées », captures, fiche FR/EN, test en mode avion) : [docs/testflight-checklist.md](docs/testflight-checklist.md) et [docs/iap-setup.md](docs/iap-setup.md).

## Documentation

- Plan de développement : [docs/dev-plan.md](docs/dev-plan.md) · Analyse de marché : [docs/market-analysis.md](docs/market-analysis.md)
- Formats : [docs/artwork-format.md](docs/artwork-format.md), [docs/backup-format.md](docs/backup-format.md) · Crédits : [docs/content-credits.md](docs/content-credits.md)
- Règles pour les agents : [CLAUDE.md](CLAUDE.md)

## Pipeline qualité

Chaque feature passe par : développement → scan de vulnérabilités (`.claude/agents/security-scanner.md`) → PR → CI → revue (`.claude/agents/pr-reviewer.md`) → merge automatique si approuvée.
