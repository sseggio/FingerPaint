import { hexToRgb } from '@/lib/color';

export { hexToRgb };

export type Rgb = [number, number, number];
export type Lab = [number, number, number];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Strict `#RRGGBB` check (the only form allowed in artwork files). */
export function isHexColor(value: unknown): value is `#${string}` {
  return typeof value === 'string' && HEX_RE.test(value);
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** sRGB (D65) → CIE L*a*b*. */
export function rgbToLab([r, g, b]: Rgb): Lab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 color difference between two hex colors. */
export function deltaE76(a: string, b: string): number {
  const [l1, a1, b1] = rgbToLab(hexToRgb(a));
  const [l2, a2, b2] = rgbToLab(hexToRgb(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Perceived luminance 0..1 (Rec. 709 weights on linear sRGB). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Gray level 0..255 used to paint the uncolored background layer. Compressed into
 * a light range so numbers stay readable on top of it.
 */
export function backgroundGray(hex: string, min = 150, max = 245): number {
  const [l] = rgbToLab(hexToRgb(hex));
  return Math.round(min + ((max - min) * l) / 100);
}
