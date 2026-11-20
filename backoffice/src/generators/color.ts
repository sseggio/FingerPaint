/**
 * Color helpers for the generators: OKLab / OKLCH (perceptual, good for ramps and hue
 * rotation), shade ramps with hue shifting, and the named harmonious palettes.
 * Palette rules (ΔE76 ≥ 10 between colors) are enforced later by the shared quantizer.
 */
import type { HexColor } from '../artwork-lib';
import { hexToRgb } from '../artwork-lib';
import type { Rng } from './prng';

export interface Oklch {
  /** Lightness 0..1. */
  l: number;
  /** Chroma 0..~0.37. */
  c: number;
  /** Hue in degrees. */
  h: number;
}

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return s * 255;
};

type Vec3 = [number, number, number];

function rgbToOklab([r, g, b]: Vec3): Vec3 {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear-light-free sRGB 0..255 (unclamped). */
function oklabToRgb([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase();
export const rgbToHex = ([r, g, b]: Vec3): HexColor => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

export function hexToOklch(hex: string): Oklch {
  const [L, a, b] = rgbToOklab(hexToRgb(hex) as Vec3);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l: L, c: Math.hypot(a, b), h: (h + 360) % 360 };
}

const inGamut = ([r, g, b]: Vec3) => r >= -0.5 && r <= 255.5 && g >= -0.5 && g <= 255.5 && b >= -0.5 && b <= 255.5;

/** OKLCH → hex, reducing chroma until the color fits in sRGB (keeps lightness and hue). */
export function oklchToHex({ l, c, h }: Oklch): HexColor {
  const L = Math.min(1, Math.max(0, l));
  const rad = (h * Math.PI) / 180;
  const at = (chroma: number): Vec3 => oklabToRgb([L, chroma * Math.cos(rad), chroma * Math.sin(rad)]);
  let rgb = at(Math.max(0, c));
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = Math.max(0, c);
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(at(mid))) lo = mid;
      else hi = mid;
    }
    rgb = at(lo);
  }
  return rgbToHex(rgb);
}

/** Interpolation in OKLab (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): HexColor {
  const A = rgbToOklab(hexToRgb(a) as Vec3);
  const B = rgbToOklab(hexToRgb(b) as Vec3);
  return rgbToHex(oklabToRgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]));
}

/** Hue moved by at most `amount` degrees toward `target`. */
function hueToward(h: number, target: number, amount: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) > amount) d = Math.sign(d) * amount;
  return (h + d + 360) % 360;
}

/** Same hue and chroma, new lightness (with pixel-art hue shift: cool shadows, warm lights). */
export function withLightness(base: string, l: number, hueShift = 14): HexColor {
  const o = hexToOklch(base);
  const dl = l - o.l;
  const h = dl < 0 ? hueToward(o.h, 285, -dl * hueShift * 3) : hueToward(o.h, 85, dl * hueShift * 3);
  // Very light and very dark shades carry less chroma (looks natural, stays in gamut).
  const edge = Math.min(1, Math.max(0, Math.min(l - 0.12, 0.98 - l) / 0.25));
  return oklchToHex({ l, c: o.c * (0.55 + 0.45 * edge), h });
}

export function lighten(base: string, dl: number): HexColor {
  return withLightness(base, Math.min(0.97, hexToOklch(base).l + dl));
}

export function darken(base: string, dl: number): HexColor {
  return withLightness(base, Math.max(0.12, hexToOklch(base).l - dl));
}

/**
 * `n` shades of `base`, dark → light, spread around its own lightness. Consecutive shades are
 * ≥ ~0.09 apart in OKLab lightness, which keeps them ΔE76-distinct (≥ 10).
 */
export function ramp(base: string, n: number, { span = 0.5, min = 0.2, max = 0.95 } = {}): HexColor[] {
  if (n <= 1) return [base.toUpperCase() as HexColor];
  const o = hexToOklch(base);
  const width = Math.max(span, (n - 1) * 0.1);
  let lo = o.l - width * 0.55;
  let hi = o.l + width * 0.45;
  if (lo < min) {
    hi += min - lo;
    lo = min;
  }
  if (hi > max) {
    lo -= hi - max;
    hi = max;
  }
  lo = Math.max(0.12, lo);
  return Array.from({ length: n }, (_, i) => withLightness(base, lo + ((hi - lo) * i) / (n - 1)));
}

/** Near-black ink tinted with the palette's hue (outlines). */
export function inkOf(base: string): HexColor {
  const o = hexToOklch(base);
  return oklchToHex({ l: 0.24, c: Math.min(0.06, o.c * 0.5), h: o.h });
}

// ---------------------------------------------------------------------------- named palettes

export interface NamedPalette {
  fr: string;
  en: string;
  /** Key colors, roughly "main, secondary, accents…, light, dark". */
  colors: HexColor[];
}

export const PALETTES = {
  pixeljoy: { fr: 'PixelJoy', en: 'PixelJoy', colors: ['#FF3D7F', '#7B5CFF', '#FFC93C', '#2ED3A0', '#3DB8FF', '#FF8A3D'] },
  sunset: { fr: 'Coucher de soleil', en: 'Sunset', colors: ['#F25C54', '#6D3B8C', '#F7B267', '#F4845F', '#355C7D', '#FFE29A'] },
  ocean: { fr: 'Océan', en: 'Ocean', colors: ['#1B98E0', '#13315C', '#2EC4B6', '#8EE3EF', '#FFBF69', '#5E60CE'] },
  forest: { fr: 'Forêt', en: 'Forest', colors: ['#4F9D69', '#2D4739', '#A7C957', '#E9A23B', '#BC4749', '#8C6A4F'] },
  candy: { fr: 'Bonbons', en: 'Candy', colors: ['#FF7AB6', '#9B7BFF', '#5CD0FF', '#FFD166', '#7CE0A3', '#FF9F7A'] },
  autumn: { fr: 'Automne', en: 'Autumn', colors: ['#D9653B', '#7A3B2E', '#F2B134', '#8F9A3E', '#B8432F', '#5D7B8A'] },
  arctic: { fr: 'Banquise', en: 'Arctic', colors: ['#4A90C2', '#1D3557', '#A8DADC', '#E63946', '#7FB7BE', '#F1C27D'] },
  retro: { fr: 'Rétro', en: 'Retro', colors: ['#2A9D8F', '#264653', '#E9C46A', '#F4A261', '#E76F51', '#8AB17D'] },
  neon: { fr: 'Néon', en: 'Neon', colors: ['#FF2A6D', '#2B1B5A', '#05D9E8', '#F9F871', '#B967FF', '#00FFA3'] },
  earth: { fr: 'Terre', en: 'Earth', colors: ['#B5835A', '#4B3B2F', '#D4A373', '#6B8F71', '#C9573C', '#E9D8A6'] },
  pastel: { fr: 'Pastel', en: 'Pastel', colors: ['#F6A6B2', '#A0C4FF', '#CAFFBF', '#FFD6A5', '#BDB2FF', '#9BF6FF'] },
  jewel: { fr: 'Pierres précieuses', en: 'Jewels', colors: ['#0F7173', '#5B1865', '#D7263D', '#F4B400', '#2E86AB', '#1B998B'] },
} satisfies Record<string, NamedPalette>;

export type PaletteName = keyof typeof PALETTES;
export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];
export const RANDOM_PALETTE = 'random';
export type PaletteChoice = PaletteName | typeof RANDOM_PALETTE;

const SCHEMES: number[][] = [
  [0, 30, 60, 180, 210, 300], // analogous + complement
  [0, 120, 240, 30, 150, 270], // triadic
  [0, 150, 210, 40, 330, 90], // split complementary
  [0, 90, 180, 270, 45, 225], // tetradic
  [0, 25, 50, 200, 330, 75], // warm analogous with a cool accent
];

/** A harmonious random palette (6 key colors) from a hue scheme. */
export function randomPalette(rng: Rng): HexColor[] {
  const h0 = rng.range(0, 360);
  const scheme = rng.pick(SCHEMES);
  return scheme.map((offset, i) => {
    const l = i === 1 ? rng.range(0.42, 0.55) : rng.range(0.6, 0.82);
    const c = rng.range(0.11, 0.17);
    return oklchToHex({ l, c, h: (h0 + offset + rng.range(-8, 8) + 360) % 360 });
  });
}

/** Key colors for a palette choice (`random` draws from the given stream). */
export function resolvePalette(choice: PaletteChoice, rng: Rng): HexColor[] {
  if (choice === RANDOM_PALETTE) return randomPalette(rng);
  return [...PALETTES[choice].colors];
}
