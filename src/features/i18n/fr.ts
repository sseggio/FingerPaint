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
