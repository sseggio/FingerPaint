# Achats intégrés (IAP) : mise en place

FingerPaint vend trois **achats uniques non consommables**. Il n'y a ni abonnement, ni monnaie virtuelle, ni booster. Les outils et les indices restent toujours gratuits.

| Product ID (SKU) | Type | Contenu |
| --- | --- | --- |
| `com.fingerpaint.app.pro` | Non-Consumable | Toutes les œuvres `access: "pro"` + bonus cosmétique (confettis dorés). Aucun outil. |
| `com.fingerpaint.app.pack.ocean` | Non-Consumable | L'album « Océan profond » (`access: { "pack": "ocean" }`). |
| `com.fingerpaint.app.pack.neon` | Non-Consumable | Cosmétique : thème de toile néon + confettis néon. Désactivable dans Réglages › Apparence. |

Pro n'inclut **pas** les packs : chaque pack est un achat de contenu distinct (voir `canAccess`).

## Architecture

- `src/features/entitlements/types.ts` : SKU et interface `EntitlementsProvider` (`init`, `getProducts`, `purchase`, `restore`, `subscribe`).
- `catalog.ts` : produits affichés, SKU → `Entitlements` (`entitlementsFromSkus`).
- `provider.ts` : choisit le provider selon `EXPO_PUBLIC_IAP_PROVIDER`.
  - `none` (défaut) → `NoopProvider` : rien n'est vendu, la boutique affiche « Bientôt disponible ».
  - `mock` → `MockProvider` : boutique simulée en local, avec un registre dans `fp:mock-store` et un panneau dev (`__DEV__` uniquement) pour choisir l'issue du prochain achat (succès, annulation, erreur, en attente), approuver les achats en attente et tout réinitialiser.
  - `storekit` → `StoreKitProvider` : App Store (et Google Play) via `expo-iap` 6.x. Le module est chargé avec `require` **dans une fonction**, pour que Jest et Expo Go ne chargent jamais le module natif.
- `entitlements-store.ts` : store Zustand réactif. Il gère :
  - le **cache hors ligne** `fp:entitlements` : une enveloppe versionnée `{ owned: Sku[], source }`, validée à la lecture. Les SKU inconnus sont ignorés. Un cache écrit par un autre provider est ignoré, donc un achat mock ne fuit jamais dans une build StoreKit ;
  - le lancement : le cache est lu pendant le splash, puis la connexion au store se fait en arrière-plan. Elle charge les prix et appelle `getAvailablePurchases` en mode silencieux. **La réponse du store remplace le cache** : le store est la source de vérité (remboursements compris). Hors ligne, le cache reste valable ;
  - « Restaurer les achats » : `restorePurchases()` (synchronisation App Store) puis `getAvailablePurchases()`. L'opération est idempotente : sans changement, rien n'est réécrit ;
  - l'achat : `requestPurchase` → `purchaseUpdatedListener` → **octroi + écriture du cache, puis `finishTransaction`**. Si l'écriture échoue, la transaction n'est pas terminée et iOS la rejouera au prochain lancement. Les transactions interrompues ou approuvées plus tard (Ask to Buy) arrivent par le même listener ;
  - les erreurs : `user-cancelled` donne un message calme (« rien n'a été débité »). `already-owned` déclenche une restauration silencieuse. Les erreurs réseau ou de store affichent un message honnête.
- Une sauvegarde `.fingerpaint` ne contient **jamais** les achats, et l'import les ignore.

## 1. App Store Connect

1. **Accords, taxes et banque** : signer l'accord *Paid Apps* (sans lui, `fetchProducts` renvoie une liste vide).
2. **App** › *Monétisation* › *Achats intégrés* › **+**, pour chaque SKU :
   - Type : **Non-Consumable** ;
   - Reference Name : par exemple « Pro », « Pack Océan profond », « Pack Néon » ;
   - Product ID : exactement le SKU du tableau ci-dessus ;
   - Prix : choisir un palier (les prix affichés viennent **toujours** du store, jamais du code) ;
   - Localisations FR et EN : nom et description fidèles à ce que décrit la boutique de l'app ;
   - Capture d'écran de revue (la boutique) et note pour l'équipe de revue ;
   - Partage familial : activable (recommandé pour des non-consommables).
3. Soumettre les achats intégrés **avec la première version** de l'app (ils restent en statut *Ready to Submit* jusque-là).
4. Bundle identifier : `ios.bundleIdentifier` dans `app.json` (F13). La capacité *In-App Purchase* est activée automatiquement par EAS lors de la synchronisation des capacités.

## 2. Configuration de l'app

- Le plugin `expo-iap` est déclaré dans `app.json` (`plugins`). Un **development build** est donc nécessaire, car Expo Go ne contient pas le module : `npx expo run:ios` ou `eas build --profile development`.
- Le provider est choisi **à la compilation** par `EXPO_PUBLIC_IAP_PROVIDER` (Expo injecte la valeur dans le bundle).
- Exemple `eas.json` (créé en F13) :

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_IAP_PROVIDER": "mock" }
    },
    "preview": {
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_IAP_PROVIDER": "storekit" }
    },
    "production": {
      "autoIncrement": true,
      "env": { "EXPO_PUBLIC_IAP_PROVIDER": "storekit" }
    }
  }
}
```

En local : `EXPO_PUBLIC_IAP_PROVIDER=mock npx expo start`. Sans variable, la valeur est `none`.

> Ne jamais livrer `mock` en production : il « vend » gratuitement. `none` est une valeur sûre pour une version sans achats.

## 3. Tester

### Mock (simulateur, Jest, dev)

1. `EXPO_PUBLIC_IAP_PROVIDER=mock`, puis ouvrir la boutique (Réglages › Boutique et soutien, ou une œuvre verrouillée).
2. Le panneau « Boutique simulée » (`__DEV__`) permet de choisir l'issue du prochain achat, d'approuver les achats en attente et de réinitialiser.
3. Vérifier : le déblocage est immédiat (bibliothèque, album, coloriage), l'achat persiste après un relancement, et la restauration après « Réinitialiser » fonctionne. Le cache est effacé mais le registre mock est conservé, sauf si on réinitialise tout.

### Sandbox (development build sur appareil)

1. App Store Connect › *Utilisateurs et accès* › *Sandbox* › créer un testeur (adresse e-mail dédiée).
2. Sur l'iPhone : Réglages › App Store › *Compte sandbox* › se connecter avec ce testeur.
3. Lancer une build `development` compilée avec `EXPO_PUBLIC_IAP_PROVIDER=storekit`.
4. Scénarios à tester :
   - achat de chaque SKU → déblocage immédiat ;
   - annulation → message calme, rien de débloqué ;
   - mode avion → les achats déjà faits restent débloqués (cache), la boutique propose « Réessayer » ;
   - réinstallation → « Restaurer les achats » ;
   - Ask to Buy (testeur sandbox « enfant ») → achat en attente, puis débloqué à l'approbation ;
   - remboursement (*Gérer* › *Clear Purchase History* dans le compte sandbox) → l'achat disparaît au lancement suivant.
5. Optionnel : un fichier StoreKit Configuration dans Xcode permet de tester sans réseau. Le générer depuis le projet `ios/` avec `npx expo prebuild`, sans le committer.

### TestFlight

1. `eas build --profile preview --platform ios` (ou `production`), puis `eas submit`.
2. Les testeurs TestFlight achètent dans l'environnement sandbox, **sans être débités**. Les achats intégrés doivent exister dans App Store Connect, mais pas forcément être approuvés.
3. Refaire les scénarios ci-dessus, et vérifier que la boutique affiche les prix localisés du store.

## Règles produit (rappel)

- Aucun compte à rebours, aucune fausse rareté, aucun paywall forcé. La boutique s'ouvre seulement à la demande (œuvre verrouillée, Réglages).
- « Restaurer les achats » est toujours visible et il y a un bouton Fermer évident.
- Le contenu gratuit (environ 75 % des œuvres), les outils et les indices ne sont jamais bloqués.
