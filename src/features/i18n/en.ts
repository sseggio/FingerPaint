import type { Message } from './types';

/**
 * English dictionary: the reference catalogue. Every key and every `{param}` declared here
 * must exist in `fr.ts` (enforced by the `Dictionary` type), and `useT()` only accepts these keys.
 */
export const en = {
  'common.comingSoon': 'Coming soon ✨',

  'tabs.library': 'Library',
  'tabs.gallery': 'My artworks',
  'tabs.settings': 'Settings',

  'library.title': 'Library',
  'library.subtitle': 'Pixels to color, no ads.',
  'library.artworkCount': { one: '{count} artwork to color', other: '{count} artworks to color' },
  'library.artworksTitle': 'Artworks',
  'library.artworkMeta': { one: '{size} · {count} color', other: '{size} · {count} colors' },
  'library.openArtwork': 'Open “{title}”',
  'library.devPerf': 'Performance test 128×128 (dev)',

  'coloring.canvasLabel': '“{title}”. Pinch to zoom, double-tap to zoom in or out.',
  'coloring.canvasLabelFill':
    '“{title}”, {percent}% colored. Tap a cell to color it with color {number}. Pinch to zoom.',
  'coloring.loading': 'Loading your artwork…',
  'coloring.palette.label': 'Palette',
  'coloring.palette.color': 'Color {number}, {filled} of {total} cells',
  'coloring.palette.colorDone': 'Color {number}, done',
  'coloring.done.title': 'Masterpiece!',
  'coloring.done.body': '“{title}” is fully colored.',
  'coloring.done.again': 'You finished “{title}”.',
  'coloring.done.next': 'Next',
  'coloring.done.nextLabel': 'Color the next artwork',
  'coloring.done.library': 'Library',
  'coloring.done.libraryLabel': 'Back to the library',
  'coloring.notFound.title': 'Artwork not found',
  'coloring.notFound.body': 'This artwork does not exist or is no longer available.',
  'coloring.notFound.back': 'Back to the library',

  'gallery.title': 'My artworks',
  'gallery.subtitle': 'Your colorings, in progress and finished.',

  'settings.title': 'Settings',
  'settings.subtitle': 'Comfort, accessibility and more.',
  'settings.language.title': 'Language',
  'settings.language.system': 'System',
  'settings.language.systemHint': 'Follows your device language ({language}).',
  'settings.language.manualHint': 'Chosen manually, regardless of your device language.',

  'language.fr': 'Français',
  'language.en': 'English',
} as const satisfies Record<string, Message>;
