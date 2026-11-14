import type { Dictionary } from './dictionary';

export const fr: Dictionary = {
  'common.comingSoon': 'Bientôt ici ✨',

  'tabs.library': 'Bibliothèque',
  'tabs.gallery': 'Mes œuvres',
  'tabs.settings': 'Réglages',

  'library.title': 'Bibliothèque',
  'library.subtitle': 'Des pixels à colorier, sans pub.',
  'library.artworkCount': { one: '{count} illustration à colorier', other: '{count} illustrations à colorier' },
  'library.artworksTitle': 'Illustrations',
  'library.artworkMeta': { one: '{size} · {count} couleur', other: '{size} · {count} couleurs' },
  'library.openArtwork': 'Ouvrir « {title} »',
  'library.devPerf': 'Test de performance 128×128 (dev)',

  'coloring.canvasLabel': '« {title} ». Pince pour zoomer, touche deux fois pour agrandir ou réduire.',
  'coloring.canvasLabelFill':
    '« {title} », colorié à {percent} %. Touche une case pour la colorier avec la couleur {number}. Pince pour zoomer.',
  'coloring.loading': 'Chargement de ton coloriage…',
  'coloring.palette.label': 'Palette',
  'coloring.palette.color': 'Couleur {number}, {filled} cases sur {total}',
  'coloring.palette.colorDone': 'Couleur {number}, terminée',
  'coloring.done.title': 'Chef-d’œuvre !',
  'coloring.done.body': '« {title} » est entièrement colorié.',
  'coloring.done.again': 'Tu as terminé « {title} ».',
  'coloring.done.next': 'Suivante',
  'coloring.done.nextLabel': 'Colorier l’illustration suivante',
  'coloring.done.library': 'Bibliothèque',
  'coloring.done.libraryLabel': 'Retour à la bibliothèque',
  'coloring.notFound.title': 'Illustration introuvable',
  'coloring.notFound.body': "Cette illustration n'existe pas ou n'est plus disponible.",
  'coloring.notFound.back': 'Retour à la bibliothèque',

  'gallery.title': 'Mes œuvres',
  'gallery.subtitle': 'Tes coloriages en cours et terminés.',

  'settings.title': 'Réglages',
  'settings.subtitle': 'Confort, accessibilité et plus.',
  'settings.language.title': 'Langue',
  'settings.language.system': 'Système',
  'settings.language.systemHint': 'Suit la langue de ton appareil ({language}).',
  'settings.language.manualHint': 'Choisie manuellement, quelle que soit la langue de ton appareil.',

  'language.fr': 'Français',
  'language.en': 'English',
};
