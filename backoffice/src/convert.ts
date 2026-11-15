/**
 * PNG → artwork grid, same algorithm as `scripts/png-to-artwork.mjs` (one PNG pixel = one cell):
 * - pixels with alpha < 128 become empty cells;
 * - above 512 distinct colors, channels are first rounded to multiples of 16;
 * - colors are merged greedily (closest pair first, the rarer into the more frequent) until there
 *   are at most `maxColors` and every pair is at least ΔE76 10 apart;
 * - the palette is sorted by luminance (color 1 = darkest), rows are RLE-encoded.
 * Color math and RLE come from the app's `src/lib/artwork` modules.
 */
import { PNG } from 'pngjs';

import type { HexColor, Lab } from './artwork-lib';
import { encodeRow, hexToRgb, luminance, MAX_COLORS, MAX_SIZE, MIN_DELTA_E, MIN_SIZE, rgbToLab } from './artwork-lib';

export const DEFAULT_MAX_COLORS = 24;
export const MIN_MAX_COLORS = 2;
/** Upload limit enforced before decoding. */
export const MAX_PNG_BYTES = 1024 * 1024;
const PREQUANTIZE_ABOVE = 512;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class ConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConvertError';
  }
}

export interface ConvertedGrid {
  w: number;
  h: number;
  palette: HexColor[];
  rows: string[];
  /** Number of colorable (non-empty) cells. */
  cells: number;
  /** Number of source colors merged away. */
  merged: number;
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
const toHex = (r: number, g: number, b: number): HexColor => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/**
 * Reads the IHDR size without inflating anything, so oversized images (decompression bombs)
 * are rejected before pngjs allocates their pixels.
 */
export function readPngSize(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new ConvertError('Ce fichier n’est pas un PNG.');
  }
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') throw new ConvertError('En-tête PNG invalide.');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

type Grid = (HexColor | null)[][];

function readPixels(buffer: Buffer): { width: number; height: number; grid: Grid } {
  if (buffer.length > MAX_PNG_BYTES) throw new ConvertError('Le PNG dépasse 1 Mo.');
  const size = readPngSize(buffer);
  if (size.width < MIN_SIZE || size.height < MIN_SIZE || size.width > MAX_SIZE || size.height > MAX_SIZE) {
    throw new ConvertError(
      `Taille ${size.width}×${size.height} hors limites : chaque côté doit mesurer de ${MIN_SIZE} à ${MAX_SIZE} pixels (un pixel = une case).`,
    );
  }
  let png: PNG;
  try {
    png = PNG.sync.read(buffer);
  } catch {
    throw new ConvertError('PNG illisible ou corrompu.');
  }
  const grid: Grid = [];
  for (let y = 0; y < png.height; y++) {
    const row: (HexColor | null)[] = [];
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      row.push(png.data[i + 3] < 128 ? null : toHex(png.data[i], png.data[i + 1], png.data[i + 2]));
    }
    grid.push(row);
  }
  return { width: png.width, height: png.height, grid };
}

function prequantize(grid: Grid): Grid {
  const q = (v: number) => Math.min(255, Math.round(v / 16) * 16);
  return grid.map((row) =>
    row.map((c) => {
      if (!c) return c;
      const [r, g, b] = hexToRgb(c);
      return toHex(q(r), q(g), q(b));
    }),
  );
}

function labDistance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Greedy palette reduction. Returns a map original color → kept color.
 * The closest pair is merged first; the less frequent color goes into the more frequent one.
 */
export function reducePalette(
  counts: ReadonlyMap<HexColor, number>,
  maxColors = DEFAULT_MAX_COLORS,
  minDeltaE = MIN_DELTA_E,
): Map<HexColor, HexColor> {
  // Same result as the script's exhaustive search (first closest pair in (i, j) order), but with a
  // cached forward nearest neighbour per color: merging never moves a color, it only removes one,
  // so only the colors whose neighbour was removed need a rescan. Keeps 128×128 uploads fast.
  const colors = [...counts.keys()];
  const n = colors.length;
  const lab: Lab[] = colors.map((c) => rgbToLab(hexToRgb(c)));
  const count = colors.map((c) => counts.get(c)!);
  const alive = new Array<boolean>(n).fill(true);
  const nn = new Int32Array(n).fill(-1);
  const nd = new Float64Array(n).fill(Infinity);
  const rescan = (i: number) => {
    nn[i] = -1;
    nd[i] = Infinity;
    for (let j = i + 1; j < n; j++) {
      if (!alive[j]) continue;
      const d = labDistance(lab[i], lab[j]);
      if (d < nd[i]) {
        nd[i] = d;
        nn[i] = j;
      }
    }
  };
  for (let i = 0; i < n; i++) rescan(i);
  const target = new Map<HexColor, HexColor>(colors.map((c) => [c, c]));
  let aliveCount = n;
  for (;;) {
    let bi = -1;
    for (let i = 0; i < n; i++) if (alive[i] && nn[i] >= 0 && (bi < 0 || nd[i] < nd[bi])) bi = i;
    if (bi < 0 || (aliveCount <= maxColors && nd[bi] >= minDeltaE)) break;
    const bj = nn[bi];
    const [keep, drop] = count[bi] >= count[bj] ? [bi, bj] : [bj, bi];
    count[keep] += count[drop];
    alive[drop] = false;
    aliveCount--;
    for (const [orig, t] of target) if (t === colors[drop]) target.set(orig, colors[keep]);
    for (let i = 0; i < n; i++) if (alive[i] && nn[i] === drop) rescan(i);
  }
  return target;
}

export function clampMaxColors(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isInteger(n)) return DEFAULT_MAX_COLORS;
  return Math.min(MAX_COLORS, Math.max(MIN_MAX_COLORS, n));
}

/** PNG buffer → palette + RLE rows. Throws ConvertError with a French, user-facing message. */
export function convertPng(buffer: Buffer, maxColors = DEFAULT_MAX_COLORS): ConvertedGrid {
  const limit = clampMaxColors(maxColors);
  const decoded = readPixels(buffer);
  let grid = decoded.grid;
  const distinct = new Set(grid.flat().filter(Boolean));
  if (distinct.size > PREQUANTIZE_ABOVE) grid = prequantize(grid);
  const counts = new Map<HexColor, number>();
  for (const c of grid.flat()) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  const target = reducePalette(counts, limit);
  const palette = [...new Set(target.values())].sort((a, b) => luminance(a) - luminance(b) || a.localeCompare(b));
  const valueOf = new Map(palette.map((c, i) => [c, i + 1]));
  let cells = 0;
  const rows = grid.map((row) =>
    encodeRow(
      row.map((c) => {
        if (!c) return 0;
        cells++;
        return valueOf.get(target.get(c)!)!;
      }),
    ),
  );
  return { w: decoded.width, h: decoded.height, palette, rows, cells, merged: counts.size - palette.length };
}
