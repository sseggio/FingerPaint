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
