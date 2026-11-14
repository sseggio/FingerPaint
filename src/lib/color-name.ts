import { hexToRgb } from './color';

/**
 * Human color names for the colorblind mode ("light blue", "bleu clair"), read in the palette
 * and by screen readers. Approximate on purpose: a hue family plus a light/dark modifier.
 */

export type ColorNameLocale = 'fr' | 'en';

type Family =
  | 'black' | 'white' | 'gray' | 'red' | 'orange' | 'brown' | 'beige' | 'yellow' | 'lime'
  | 'green' | 'cyan' | 'blue' | 'indigo' | 'violet' | 'purple' | 'magenta' | 'pink';

const NAMES: Record<ColorNameLocale, Record<Family, string>> = {
  en: {
    black: 'black', white: 'white', gray: 'gray', red: 'red', orange: 'orange', brown: 'brown',
    beige: 'beige', yellow: 'yellow', lime: 'lime green', green: 'green', cyan: 'turquoise',
    blue: 'blue', indigo: 'indigo', violet: 'violet', purple: 'purple', magenta: 'magenta', pink: 'pink',
  },
  fr: {
    black: 'noir', white: 'blanc', gray: 'gris', red: 'rouge', orange: 'orange', brown: 'marron',
    beige: 'beige', yellow: 'jaune', lime: 'vert citron', green: 'vert', cyan: 'turquoise',
    blue: 'bleu', indigo: 'indigo', violet: 'violet', purple: 'pourpre', magenta: 'magenta', pink: 'rose',
  },
};

type Shade = 'light' | 'dark' | null;

function shaded(locale: ColorNameLocale, name: string, shade: Shade): string {
  if (!shade) return name;
  if (locale === 'fr') return `${name} ${shade === 'light' ? 'clair' : 'foncé'}`;
  return `${shade} ${name}`;
}

/** HSL of a hex color: h in [0, 360), s and l in [0, 1]. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hueFamily(h: number): Family {
  if (h < 12 || h >= 345) return 'red';
  if (h < 40) return 'orange';
  if (h < 64) return 'yellow';
  if (h < 90) return 'lime';
  if (h < 166) return 'green';
  if (h < 192) return 'cyan';
  if (h < 245) return 'blue';
  if (h < 262) return 'indigo';
  if (h < 280) return 'violet';
  if (h < 305) return 'purple';
  if (h < 325) return 'magenta';
  return 'pink';
}

/** Localized approximate name of a `#RRGGBB` color. Throws on an invalid hex (like `hexToRgb`). */
export function colorName(hex: string, locale: ColorNameLocale): string {
  const { h, s, l } = hexToHsl(hex);
  const names = NAMES[locale];

  // Achromatic colors.
  if (l <= 0.1) return names.black;
  if (l >= 0.94) return names.white;
  if (s < 0.12 || (s < 0.2 && (l < 0.25 || l > 0.85))) {
    return shaded(locale, names.gray, l > 0.7 ? 'light' : l < 0.3 ? 'dark' : null);
  }

  let family = hueFamily(h);
  // Dark oranges/yellows read as brown, pale ones as beige.
  if ((family === 'orange' || family === 'yellow' || family === 'red') && l < 0.42 && s < 0.85 && h >= 12) family = 'brown';
  if ((family === 'orange' || family === 'yellow') && l > 0.78 && s < 0.85) family = 'beige';
  // Light reds are pink.
  if (family === 'red' && l > 0.72) family = 'pink';

  const shade: Shade = family === 'beige' || family === 'brown' ? null : l >= 0.72 ? 'light' : l <= 0.3 ? 'dark' : null;
  return shaded(locale, names[family], shade);
}
