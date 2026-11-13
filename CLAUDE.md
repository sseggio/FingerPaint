# FingerPaint — guide pour les agents

App iOS/Android de coloriage pixel art par numéros, **originale** (nom, illustrations et identité propres), construite avec **Expo SDK 58 / React Native / TypeScript / Expo Router**.
Lis aussi `AGENTS.md` (règles Expo officielles) et les skills dans `.claude/skills/`.

## Règles produit (non négociables)
- **Zéro publicité, zéro SDK de tracking/analytics tiers.**
- **Pas de pay-to-win** : le payant = contenu (packs d'illustrations), cosmétiques (palettes, thèmes, effets) et soutien. Jamais de boosters payants, d'énergie, de timers, ni de contenu « de base » bloqué derrière un mur agressif.
- **Offline-first** : V1 sans backend. Persistance locale.
- Respect de l'utilisateur : pas de dark patterns, pas de notifications manipulatrices.

## Workflow (pipeline d'agents)
Branche d'intégration : `claude/trusting-turing-c692ne`. Une feature = une branche `claude/feat-<nn>-<slug>` = une PR.
1. `feature-developer` implémente + tests.
2. `security-scanner` doit renvoyer `SECURITY: PASS` **avant** l'ouverture de la PR.
3. PR ouverte vers la branche d'intégration, CI GitHub (typecheck, lint, tests, audit).
4. `pr-reviewer` → `VERDICT: APPROVE` ⇒ merge automatique (squash). `REQUEST_CHANGES` ⇒ correction puis nouvelle revue.

## Conventions de code
- Structure : `src/app` (routes uniquement), `src/screens`, `src/components`, `src/features/<domaine>`, `src/lib`, `src/theme`.
- Fichiers en kebab-case, exports nommés, TypeScript strict, pas de `any`.
- Logique pure (grilles, scoring, progression, sérialisation) dans `src/lib` avec tests Jest.
- Toute donnée relue depuis le stockage est validée (try/catch + versionnage de schéma).
- Perfs : le canvas de coloriage est dessiné avec `@shopify/react-native-skia`, gestes avec `react-native-gesture-handler` + `react-native-reanimated`. Jamais un composant React par pixel.
- Toujours `npx expo install` pour ajouter une dépendance.
- Avant de terminer : `npx tsc --noEmit && npx expo lint && npm test -- --ci`.

## Design system — « simple, design, coloré, avec du peps »
Utilise uniquement les tokens de `src/theme` (pas de couleurs en dur hors données d'illustrations).
- Couleurs (clair) : fond `#FFF8F0`, surface `#FFFFFF`, encre `#1B1A2E`, texte secondaire `#6B6880`,
  primaire rose électrique `#FF3D7F`, violet `#7B5CFF`, jaune soleil `#FFC93C`, menthe `#2ED3A0`, ciel `#3DB8FF`, orange `#FF8A3D`.
- Couleurs (sombre) : fond `#14121F`, surface `#1F1C2E`, encre `#F7F5FF`, secondaire `#A7A3BC` (accents identiques).
- Rayons : 12 / 20 / 28. Espacements base 4 (4, 8, 12, 16, 24, 32). Ombres douces colorées.
- Typo : système, titres très gras (800/900), arrondis, tailles 34/28/22/17/15/13.
- Micro-interactions : pressions avec léger scale (0.96) + haptique légère, confettis sur complétion, transitions ressorts.
- Accessibilité : `accessibilityLabel` sur tout élément interactif, contrastes AA, Dynamic Type respecté, mode daltonien.
