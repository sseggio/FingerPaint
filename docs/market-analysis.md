# FingerPaint : analyse de marché des apps de coloriage pixel art par numéros

*Date : novembre 2026. Les prix viennent des fiches App Store, des trackers (App Pricing Lab, Adapty) et des pages éditeurs. Ils varient selon le pays et dans le temps : ce sont des ordres de grandeur, à revérifier avant publication.*

---

## 1. Résumé exécutif

- **Le marché est mûr et très concentré.** Easybrain (Pixel Art), X-Flow (Happy Color), MWM (Pixel Color, Color Pop AI), Wildlife (Color by Number), Pixite (Pigment), Lake et Recolor se partagent l'essentiel des revenus. Au T4 2025 aux US, les meilleures apps de la catégorie Drawing & Coloring font environ 120 k$ à 230 k$ **par semaine** sur iOS (Sensor Tower). La demande est donc réelle et durable.
- **Le modèle dominant est hostile à l'utilisateur.** On y trouve des pubs interstitielles toutes les quelques minutes, des indices débloqués par une pub et des abonnements **hebdomadaires** de 4 à 10 $ par semaine (soit 200 à 500 $ par an), souvent avec un essai gratuit qui bascule automatiquement en payant. Même le rachat « sans pub » ne supprime pas toujours les pubs d'indices (Happy Color : *« Remove ads (hint ads stay) »*).
- **Les plaintes récurrentes** portent sur la pub excessive, les abonnements chers ou piégeux, la progression perdue (pas de sauvegarde ni de synchro), les crashs pendant les pubs, les nuances trop proches pour les daltoniens ou les seniors, et la répétitivité du contenu.
- **Le positionnement de FingerPaint :** *« le coloriage pixel qu'on peut recommander à sa mère »*. Zéro pub, zéro tracking, 100 % hors ligne, un achat unique honnête, de l'accessibilité de série, et un pont entre « colorier » et « créer ses propres pixel arts » que personne ne fait bien aujourd'hui. Les apps de création (Pixaki, Resprite, dotpict) et celles de coloriage forment deux mondes séparés.
- **Le pari business :** convertir moins d'utilisateurs, mais les garder plus longtemps. Le capital confiance et le bouche-à-oreille (Reddit, avis, communautés seniors et parents) remplacent les campagnes d'acquisition payantes.

---

## 2. Panorama concurrentiel

### 2.1 Coloriage par numéros (pixel et vectoriel)

| App | Modèle économique | Prix constatés | Forces | Faiblesses |
|---|---|---|---|---|
| **Pixel Art – Color by Number** (Easybrain) | Freemium + pubs + abonnement | Hebdo ~7,99 $, mensuel jusqu'à 19,99 $, annuel ~46,99 $ (selon la région) | Énorme catalogue, finitions soignées, événements | Pubs « toutes les minutes » ; résiliation impossible pendant la période en cours ; ~46 % de sentiment négatif (analyse NLP tierce) |
| **Happy Color** (X-Flow) | Gratuit + pubs + IAP | Retrait des pubs 7,99 $ (les pubs d'indices restent), premium ~1,99 $/mois ou 9,99 $/an | 40 000+ images gratuites, 4,8★ sur 3,3 M d'avis | Pubs qui renvoient vers le store (Temu…), indice = pub, progression perdue à la réinstallation, gels pendant les pubs |
| **Pixel Color** (MWM) | Abonnement + pubs | 3,99 $/semaine, 9,99 $/mois | Marketing fort, contenu tendance | « Way too many ads » ; le support répond en proposant l'abonnement |
| **Pixel Art Book** (Picfun) | Abonnement « tout débloquer » + pubs | Abonnement, prix variables | Catalogue pixel classique | Contenu verrouillé, peu d'innovation |
| **Color by Number** (Wildlife) | Abonnement + pubs | ~7,99 $/mois ; retrait des pubs 11,99 $ | Top revenus US T4 2025 | Double monétisation pub + abonnement |
| **Vita Color for Seniors** (Vita Studio) | Gratuit + pubs + IAP | Retrait des pubs 9,99 $ (achat unique) | Cible seniors : gros chiffres, images simples | Pubs interstitielles pour un public vulnérable |
| **Pigment** (Pixite) | Freemium + abonnement | 4,99 $/semaine, 9,99 $/mois, 59,99 $/an | Coloriage libre de qualité (pinceaux, crayons) | Cher, pas de pixel art |
| **Lake** | Abonnement optionnel | 9,99 $/mois, 39,99 $/an, 7 jours d'essai | Illustrations d'artistes rémunérés, mode daltonien (noms des couleurs) | Pas de pixel art, abonnement cher |
| **Recolor** (Sumoing) | Abonnement | 10 IAP de 9,99 à 119,99 $ | Gros catalogue, communauté | Tarification opaque, prix élevés |
| **Color By Number For Adults** (Sandbox) | Gratuit, sans IAP, peu de pubs | 0 $ | Pas de harcèlement à l'achat | Monétisation fragile, peu de fonctionnalités |

### 2.2 Création pixel art libre

| App | Modèle | Prix | Forces | Faiblesses |
|---|---|---|---|---|
| **Pixaki 4 Pro** | Achat unique (iPad) | ~20 à 29 $ / 29 € | Référence pro : calques, animation | iPad seulement, intimidant pour un débutant |
| **Resprite** | Freemium + abonnement **ou** à vie | À vie 21,99 $ ; mensuel et annuel aussi | Partagé iPhone/iPad, moderne, à la Aseprite | Orienté créateurs confirmés |
| **dotpict** | Gratuit + pubs + Premium | 3,99 à 7,49 $ | Communauté, thèmes quotidiens, animation | Pubs non désactivables, 5 calques max sans Premium, bugs de publication |

**À retenir :** aucune app ne combine (a) zéro pub, (b) un achat unique, (c) du coloriage pixel *et* de la création, (d) une vraie accessibilité. Ce quadrant est vide.

---

## 3. Pain points des utilisateurs

| # | Pain point | Témoignages et sources |
|---|---|---|
| 1 | **Pub excessive et intrusive** | Easybrain : *« SO many ads »*, *« ads popping up every minute »* (justuseapp, worldsapps). Happy Color : la pub *« constantly transfers to the market for installing Temu »*, des pubs *« increasingly difficult to exit »* (kimola). Color Oasis : l'app était annoncée *« no ads »*, mais il y a une pub à l'ouverture et entre chaque image. |
| 2 | **Indices et aides payés en pubs** | Happy Color : *« ads run long »* pour un indice ; *« no ads available try again later »* quand on touche l'ampoule. Le rachat « sans pub » ne couvre pas les indices. |
| 3 | **Abonnements chers et piégeux** | Abonnements hebdo de 3,99 à 9,99 $ (Pixel Color, Number Pixel, Pixel Sandbox, Senior Color). Easybrain : *« no cancellation… during the active period »*. Demande n°1 des utilisateurs : *« an option to remove ads instead of recurring monthly subscription fees »* (marlvel.ai). |
| 4 | **Progression perdue** | Happy Color : les images en cours ne se synchronisent pas entre appareils ; une réinstallation forcée a fait perdre *« all my progress »* (App Store, justuseapp). |
| 5 | **Gels et crashs** liés aux pubs | *« Locked up several times in the last few months »* pendant les pubs (justuseapp). |
| 6 | **Nuances indiscernables** | Les petites cases et les nuances proches gênent les daltoniens et les seniors. Lake a dû ajouter un mode daltonien qui nomme les couleurs. Vita Color existe justement parce que les apps grand public sont peu lisibles. |
| 7 | **Contenu verrouillé ou répétitif** | Apps « unlock everything » par abonnement (Pixel Art Book, Pixel Paint). Les apps kids sans pub sont jugées « incomplete » et sollicitent l'achat en permanence. |
| 8 | **Créer est intimidant** | Pixaki et Resprite visent des créateurs confirmés. dotpict impose des pubs et une limite de calques. Il n'existe pas de passerelle douce entre colorier et créer. |

---

## 4. Opportunités : fonctionnalités absentes ou mal faites

Complexité : **S** = quelques jours, **M** = 1 à 3 semaines, **L** = plus d'un mois ou backend nécessaire.

| # | Fonctionnalité | Description | Impact rétention | Complexité |
|---|---|---|---|---|
| 1 | **Indices illimités et gratuits** | Loupe, « trouver la prochaine case », surbrillance de la couleur active, sans pub ni monnaie. Corrige le pain point n°2. | Élevé : supprime la frustration principale | S |
| 2 | **Sauvegarde locale robuste et export/import de sauvegarde** | Autosave à chaque coup de pinceau, fichier de sauvegarde exportable (Fichiers, Drive, iCloud via la feuille de partage). Pas besoin de backend. | Élevé : la confiance (pain point n°4) | S |
| 3 | **Mode accessibilité complet** | Mode daltonien (symboles ou motifs en plus des numéros, noms des couleurs), palettes à contraste de luminance, cases agrandies, police XXL, retour haptique, mode gaucher. | Élevé chez les seniors et daltoniens, des segments fidèles et mal servis | M |
| 4 | **Rituel « une case par jour » plutôt qu'une série punitive** | Image du jour plus un « carnet » mensuel (30 mini-pixels formant une fresque à la fin du mois). La série est **indulgente** : 2 jokers par semaine, aucune perte. | Élevé : habitude saine sans anxiété | S |
| 5 | **Minuteur de pause bienveillant** | Option « séance de 10/20 min », rappel doux de faire une pause, statistiques de temps de détente plutôt que d'engagement. Unique sur le marché. | Moyen : image de marque, bouche-à-oreille | S |
| 6 | **Passerelle Colorier → Créer** | Après une image terminée : « Remixez-la » (changer la palette, modifier des pixels) ; puis un éditeur simple (crayon, gomme, pot, symétrie, grille 16 à 64 px) qui transforme **sa propre création en coloriage par numéros** jouable. | Très élevé : contenu infini généré par l'utilisateur, pas de concurrent | M |
| 7 | **Photo → pixel art à colorier, en local** | Conversion d'une photo de la galerie en grille numérotée (quantification de couleurs sur l'appareil, sans IA serveur, rien ne quitte le téléphone). | Élevé : contenu personnel (animaux, enfants) | M |
| 8 | **Replay timelapse et export propre** | Vidéo ou GIF du coloriage, export PNG agrandi sans flou (nearest-neighbor) et sans filigrane, fond d'écran, impression en grille « point de croix ». | Moyen : partage organique | M |
| 9 | **Collections et albums thématiques à compléter** | Albums (« Jardin japonais », « Fonds marins ») avec une méta-image finale révélée. Progression visible sans gamification agressive. | Élevé : objectif à moyen terme | S |
| 10 | **Mode « pixel perfect » relaxant** | Remplissage par glissé (drag-to-fill), remplissage automatique d'une zone contiguë après N cases, zoom intelligent, sons ASMR optionnels. | Moyen : confort | S/M |
| 11 | **Profils familiaux hors ligne** | Plusieurs profils sur un appareil (enfant, parent, grand-parent) avec des réglages d'accessibilité séparés et un contrôle parental natif. | Moyen à élevé : foyers partagés, tablettes | S |
| 12 | **Défis entre proches sans compte** | Partage d'un « code image » (fichier ou QR) qu'un proche colorie à son tour ; comparaison de palettes. Social sans serveur. | Moyen | M |
| 13 | **Création de palettes et de thèmes de couleurs** | Recolorier une image terminée avec des palettes (pastel, Game Boy, sépia, palettes rétro libres de droits). | Moyen : rejouabilité du catalogue | S |
| 14 | **Synchro multi-appareils** (V2) | Synchro iCloud/Google Drive optionnelle et chiffrée, ou backend léger. | Élevé | L |
| 15 | **Galerie communautaire modérée et rémunération des artistes** (V2+) | Les créateurs publient des grilles et touchent une part des packs vendus. | Élevé | L |
| 16 | **Widget et Live Activity** | Widget « image du jour » et progression sur l'écran d'accueil. | Moyen : rappel non intrusif | M |

---

## 5. Modèle de monétisation éthique recommandé

### Principes non négociables
1. **Zéro pub et zéro tracking tiers.** C'est un argument marketing (label App Store « Données non collectées »).
2. **Aucune ressource consommable payante.** Pas d'indices, de vies ni de « pinceaux magiques » à acheter. Tous les outils de jeu sont gratuits.
3. **Pas d'abonnement hebdomadaire, pas de paywall à l'ouverture, pas d'essai qui bascule automatiquement en payant.**
4. **Ce qui est acheté l'est pour toujours,** hors ligne, et restaurable.

### Offre proposée

| Offre | Contenu | Prix suggéré | Justification |
|---|---|---|---|
| **Gratuit** | ~150 images de base, image du jour (gratuite, à conserver), éditeur de création (grille jusqu'à 32×32), tous les outils et indices, accessibilité complète | 0 € | Une vraie app utilisable, pas une démo. C'est la base du bouche-à-oreille. |
| **FingerPaint Pro** (achat unique) | Tout le catalogue de base (~600+ images au lancement), photo → pixel, éditeur avancé (64×64 et plus, calques, symétrie, export GIF/timelapse HD), profils familiaux, palettes avancées | **9,99 €** (lancement à 6,99 €) | Proche du prix du retrait de pub de Happy Color (7,99 $) et de Vita (9,99 $), mais sans aucune pub et avec du contenu. Moins de la moitié de Pixaki ou Resprite à vie (20 à 29 $). Un argument simple : « le prix d'un livre de coloriage ». |
| **Packs thématiques** (cosmétiques et contenu) | 30 à 50 images d'un thème ou d'un artiste invité, avec palettes dédiées | **1,99 à 3,99 €** chacun | Achat optionnel qui finance la production continue. Aucun impact sur la progression. |
| **Club FingerPaint** (abonnement optionnel léger) | Tous les packs présents et futurs, et 1 nouvel album par mois. *Ne débloque aucun outil.* | **2,49 €/mois ou 19,99 €/an** | 2 à 4 fois moins cher que Lake (39,99 $/an) ou Pigment (59,99 $/an). Pour les gros consommateurs uniquement ; les packs déjà téléchargés restent en cas de résiliation. |
| **Soutien créateurs** (V2) | Pourboire de 0,99 à 4,99 €, ou partage de 50 % des revenus des packs d'artistes | Variable | Différenciation éthique ; s'inspire de Lake, qui rémunère ses artistes. |

**Pourquoi ce modèle :** la demande n°1 relevée dans les avis est *« un achat unique plutôt qu'un abonnement récurrent »*. Un achat unique maîtrisé offre aussi une meilleure note sur les stores et de meilleures chances d'être mis en avant par Apple (qui valorise la confidentialité et l'absence de pub). L'abonnement reste un **raccourci de confort**, jamais une obligation. Pour la V1, se limiter à **Gratuit + Pro + 2 ou 3 packs** : c'est plus simple à valider côté stores et moins de SKU à gérer. Le Club arrive en V2, quand le flux de contenu est prouvé.

**Implémentation Expo :** `react-native-iap` ou RevenueCat (le SDK fonctionne avec une vérification de reçu locale ou du cache pour un usage hors ligne). Il faut un bouton « Restaurer les achats » visible et un statut Pro mis en cache localement.

---

## 6. Périmètre recommandé

### V1 : MVP 100 % hors ligne, sans backend (cible 8 à 12 semaines)

**Cœur coloriage**
- Moteur de grille pixel performant (Skia via `@shopify/react-native-skia`) : zoom et pan fluides, numéros visibles selon le niveau de zoom, remplissage au tap et au glissé.
- Palette numérotée, surbrillance des cases de la couleur active, compteur par couleur.
- Indices gratuits et illimités : localiser la prochaine case et la couleur restante.
- Autosave continu (SQLite ou MMKV, et fichiers pour les grilles).
- Animation de fin, galerie « Mes œuvres », export PNG agrandi sans filigrane.

**Contenu**
- ~150 images gratuites et ~450 Pro, embarquées dans le bundle (format compact JSON ou PNG indexé), toutes **originales** : commande à des artistes ou création interne.
- Image du jour : rotation déterministe sur un calendrier embarqué, sans serveur.
- Albums thématiques avec une méta-image révélée.

**Habitudes saines et accessibilité**
- Série indulgente avec jokers et rappel local optionnel (`expo-notifications`, notifications locales uniquement).
- Minuteur de séance et rappel de pause.
- Mode daltonien (symboles ou motifs), police XXL, contraste élevé, haptique, mode gaucher.

**Créativité**
- Éditeur simple (crayon, gomme, pot, pipette, symétrie, annuler/rétablir, grille 16 à 32 px gratuite, 64 px en Pro) et transformation **automatique de sa création en coloriage à numéros**.
- Photo → pixel art en local (quantification k-means ou median-cut sur l'appareil) : fonctionnalité Pro.
- Recolorier une œuvre terminée avec une autre palette.

**Monétisation et confiance**
- Gratuit + Pro en achat unique + 2 ou 3 packs, restauration des achats.
- Export et import de la sauvegarde (fichier `.fingerpaint` via la feuille de partage), qui remplace la synchro cloud en V1.
- Aucun SDK analytique tiers. Au mieux, des compteurs locaux anonymes et opt-in.
- i18n FR/EN dès le départ.

### V2 : mois 4 à 9
- Synchro optionnelle (iCloud Key-Value/CloudKit et Google Drive, ou backend léger Supabase).
- Replay timelapse et export GIF/vidéo ; widget iOS/Android.
- Partage d'image par QR ou fichier entre proches (défis).
- Profils familiaux et contrôle parental.
- Club FingerPaint (abonnement léger) et téléchargement de nouveaux packs (CDN statique, sans compte).
- Éditeur avancé : calques, animation simple sur 2 à 4 frames.

### V3 et au-delà
- Galerie communautaire modérée, publication de grilles par les utilisateurs, partage de revenus avec les créateurs.
- Mode impression (point de croix, perles Hama) : passerelle vers les loisirs créatifs physiques.
- Version iPad/tablette optimisée (Apple Pencil), puis Apple Watch « mini-pixel du jour ».

### Risques à surveiller
- **Le coût du contenu original** est le principal poste de dépense : budgéter des commandes d'artistes et réutiliser des palettes.
- **La performance** des grandes grilles (100×100 et plus) en React Native : prototyper le rendu Skia en premier.
- **La découvrabilité** sans budget d'acquisition : miser sur l'ASO (« no ads coloring », « coloriage sans pub »), sur Reddit (r/pixelart, r/iosgaming) et sur les communautés seniors et parents.

---

## 7. Sources

**Prix et modèles économiques**
- Happy Color, prix IAP : https://apppricinglab.com/app/apple/1407852246
- Happy Color, FAQ officielle : https://happycolorapp.com/faq.html
- Happy Color, App Store : https://apps.apple.com/app/1407852246
- Pixel Art (Easybrain), prix IAP : https://apppricinglab.com/app/apple/1274972321 et https://apppricinglab.com/iap/apple/1274972321
- Pixel Art (Easybrain), App Store CA : https://apps.apple.com/ca/app/id1274972321
- Pixel Color (MWM) : https://apps.apple.com/us/app/id1277229792
- Pixel Art Book : https://apps.apple.com/app/id1308131993
- Color by Number (id1435567912) : https://apps.apple.com/app/id1435567912
- Color By Number For Adults (Sandbox) : https://apps.apple.com/us/app/id1537328806
- Color Oasis : https://apps.apple.com/us/app/id6498701816
- Vita Color for Seniors : https://apps.apple.com/us/app/id6451237392
- Senior Color : https://apps.apple.com/us/app/-/id6502562037
- Pigment, prix officiels : https://support.pixiteapps.com/hc/en-us/articles/32363361249811-Pricing-Information-for-Pigment-Premium
- Lake (AppAdvice, juin 2025) : https://appadvice.com/post/one-of-my-favorite-ways-to-relax-the-lake-coloring-app-adds-great-new-features/781985
- Lake, prix IAP : https://apppricinglab.com/app/apple/1183717726
- Lake, paywall : https://adapty.io/paywall-library/lake-coloring-book-for-adults
- Recolor, prix IAP : https://apppricinglab.com/app/apple/1027352017
- Recolor, FAQ abonnement : https://global.static.cdn.recolor.com/recolor-faq/subscription/what-is-a-subscription
- Pixaki 4 Pro : https://apps.apple.com/fr/app/pixaki-4-pro/id1447665380 et https://apppricinglab.com/app/apple/1447665380
- Resprite : https://apps.apple.com/tc/app/id1662335989 et https://apppricinglab.com/app/apple/1662335989
- dotpict : https://apps.apple.com/gb/app/dotpict/id995653343

**Avis utilisateurs et pain points**
- Happy Color, avis : https://justuseapp.com/en/app/1407852246/happy-color-coloring-games/reviews
- Happy Color, problèmes : https://justuseapp.com/en/app/1407852246/happy-color-coloring-games/problems
- Happy Color, synthèses d'avis : https://kimola.com/reports/unlock-insights-with-our-happy-color-app-feedback-analysis-app-store-us-140486 et https://kimola.com/reports/unlock-insights-happy-color-app-customer-feedback-report-app-store-ca-140522
- Happy Color, Google Play : https://play.google.com/store/apps/details?id=com.pixel.art.coloring.color.number
- Pixel Art (Easybrain), avis : https://justuseapp.com/en/app/1274972321/pixel-art-color-by-number/reviews et https://worldsapps.com/reviews-pixel-art-paint-by-number
- Analyse de sentiment des apps de coloriage : https://marlvel.ai/apps/com-europosit-pixelcoloring
- Color Tap (kids, sans pub) : https://apps.apple.com/app/id1516150031

**Marché et accessibilité**
- Sensor Tower, top Drawing & Coloring US, T4 2025 : https://sensortower.com/blog/2025-q4-ios-top-5-drawing-coloring-revenue-us-6045ffa3241bc16eb803b34d
- Sensor Tower, T3 2025, plateformes réunies : https://sensortower.com/blog/2025-q3-unified-top-5-drawing & coloring-revenue-us-6045ffa3241bc16eb803b34d
- Sensor Tower, Android US, T4 2025 : https://sensortower.com/blog/2025-q4-android-top-5-drawing-coloring-revenue-us-6045ffa3241bc16eb803b34d
- Lake, concevoir pour les daltoniens : https://blog.lakecoloring.com/when-the-sunset-is-green-designing-for-colorblind-users/
- Rendre une app accessible aux daltoniens : https://medium.com/@appsogreat/how-to-make-your-app-colorblind-friendly-resources-and-experience-sharing-b46615c5a007

*Limites : je n'ai trouvé aucun fil Reddit exploitable dans les résultats de recherche. Les plaintes citées viennent des avis App Store et Google Play et de leurs agrégateurs. Les chiffres Sensor Tower sont des résumés de blog (top 5 seulement) et ne donnent pas la taille totale du marché.*
