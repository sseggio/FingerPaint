/**
 * Remix: a color variant of an existing artwork (embedded in the app or from the catalog).
 * The grid is kept cell for cell; only the palette changes, by hue rotation or by mapping the
 * source hues onto a named palette. Lightness is preserved (same contrast, same structure),
 * then nudged where needed so every pair stays ΔE76 ≥ 10.
 */
import type { HexColor } from '../artwork-lib';
import { decode, deltaE76, MIN_DELTA_E } from '../artwork-lib';
import { hexToOklch, oklchToHex, type Oklch } from './color';
import { commonSpecs, num, PALETTE_OPTIONS, str } from './params';
import { Canvas } from './raster';
import type { GeneratorDef } from './types';

/** Moves colors apart (lightness first, then hue) until every pair is ΔE76 ≥ min. */
export function separate(colors: Oklch[], min = MIN_DELTA_E + 0.5): HexColor[] {
  const cur = colors.map((c) => ({ ...c }));
  let hex = cur.map(oklchToHex);
  for (let iter = 0; iter < 200; iter++) {
    let worst: [number, number, number] | null = null;
    for (let i = 0; i < hex.length; i++)
      for (let j = i + 1; j < hex.length; j++) {
        const d = deltaE76(hex[i], hex[j]);
        if (d < min && (!worst || d < worst[2])) worst = [i, j, d];
      }
    if (!worst) break;
    const [i, j] = worst;
    const [lo, hi] = cur[i].l <= cur[j].l ? [i, j] : [j, i];
    const step = 0.02;
    if (cur[hi].l + step <= 0.98) cur[hi].l += step;
    else cur[lo].l = Math.max(0.05, cur[lo].l - step);
    if (cur[lo].l > 0.06) cur[lo].l = Math.max(0.05, cur[lo].l - step / 2);
    if (iter % 5 === 4) cur[hi].h = (cur[hi].h + 12) % 360;
    hex = cur.map(oklchToHex);
  }
  return hex;
}

/** Source palette → hue-rotated palette (lightness and chroma kept). */
export function rotatePalette(palette: readonly string[], degrees: number): HexColor[] {
  return separate(palette.map((c) => {
    const o = hexToOklch(c);
    return { ...o, h: (o.h + degrees + 360) % 360 };
  }));
}

/**
 * Source palette → named palette: chromatic colors are grouped by hue; the most used hue group
 * takes the first key color's hue, and so on. Lightness is kept, chroma blends toward the key.
 */
export function mapPalette(palette: readonly string[], counts: readonly number[], keys: readonly HexColor[]): HexColor[] {
  const src = palette.map((c) => hexToOklch(c));
  const chromatic = src.map((o, i) => ({ o, i })).filter(({ o }) => o.c >= 0.035).sort((a, b) => a.o.h - b.o.h);
  const groupOf = new Map<number, number>();
  let group = -1;
  let prevH = -999;
  for (const { o, i } of chromatic) {
    if (o.h - prevH > 28) group++;
    groupOf.set(i, group);
    prevH = o.h;
  }
  // Wrap-around: last and first groups are one if their hues are close across 360°.
  if (chromatic.length > 1 && chromatic[0].o.h + 360 - chromatic[chromatic.length - 1].o.h <= 28) {
    const last = groupOf.get(chromatic[chromatic.length - 1].i)!;
    for (const [i, g] of groupOf) if (g === last) groupOf.set(i, 0);
  }
  const weight = new Map<number, number>();
  for (const [i, g] of groupOf) weight.set(g, (weight.get(g) ?? 0) + counts[i]);
  const ranked = [...weight.keys()].sort((a, b) => weight.get(b)! - weight.get(a)! || a - b);
  const keyOf = new Map(ranked.map((g, r) => [g, hexToOklch(keys[r % keys.length])]));
  const tint = hexToOklch(keys[0]);
  return separate(src.map((o, i) => {
    const g = groupOf.get(i);
    if (g === undefined) return { l: o.l, c: Math.min(0.025, tint.c), h: tint.h };
    const k = keyOf.get(g)!;
    return { l: o.l, c: o.c * 0.4 + k.c * 0.6, h: k.h };
  }));
}

export const remix: GeneratorDef = {
  id: 'remix',
  name: { fr: 'Remix', en: 'Remix' },
  description: 'Variante de couleurs d’une œuvre existante (même dessin, même contraste).',
  clean: false,
  params: [
    { key: 'source', kind: 'source', label: 'Œuvre source', default: '' },
    {
      key: 'mode',
      kind: 'enum',
      label: 'Variation',
      options: [
        { value: 'hue', label: 'Rotation de teinte' },
        { value: 'palette', label: 'Palette nommée' },
      ],
      default: 'hue',
    },
    { key: 'hue', kind: 'int', label: 'Rotation (°)', min: 15, max: 345, step: 15, default: 120 },
    { key: 'palette', kind: 'enum', label: 'Palette', options: PALETTE_OPTIONS, default: 'pixeljoy' },
    ...commonSpecs().filter((s) => s.key === 'difficulty'),
  ],
  draw(ctx) {
    const src = ctx.source;
    if (!src) throw new Error('remix: missing source');
    const { cells } = decode(src.rows, src.w, src.h, src.palette.length);
    const counts = new Array<number>(src.palette.length).fill(0);
    for (const v of cells) if (v > 0) counts[v - 1]++;
    const next = str(ctx.params, 'mode') === 'hue' ? rotatePalette(src.palette, num(ctx.params, 'hue')) : mapPalette(src.palette, counts, ctx.keys);
    const cv = new Canvas(src.w, src.h);
    const values = next.map((c) => cv.ink(c));
    for (let i = 0; i < cells.length; i++) cv.data[i] = cells[i] > 0 ? values[cells[i] - 1] : 0;
    return cv;
  },
};
