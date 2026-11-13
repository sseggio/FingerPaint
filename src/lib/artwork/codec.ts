import { buildPalette } from './palette';
import type { Artwork, ArtworkSource } from './types';
import { EMPTY_KEY, KEYS } from './types';

/** Raised when a row cannot be decoded. `column` is the 0-based char offset in the row string. */
export class RleError extends Error {
  constructor(
    message: string,
    readonly column: number,
  ) {
    super(message);
    this.name = 'RleError';
  }
}

/** Maps a key to a cell value: 0 for EMPTY_KEY, palette index + 1 otherwise, -1 if unknown. */
export function keyToValue(key: string): number {
  if (key === EMPTY_KEY) return 0;
  const i = KEYS.indexOf(key);
  return i < 0 ? -1 : i + 1;
}

export function valueToKey(value: number): string {
  if (value === 0) return EMPTY_KEY;
  const key = KEYS[value - 1];
  if (key === undefined) throw new RangeError(`Cell value out of range: ${value}`);
  return key;
}

/**
 * Decodes one RLE row (`"4.3A2B"` → `[0,0,0,0,1,1,1,2,2]`).
 * `paletteSize` rejects keys beyond the palette (pass KEYS.length to skip that check).
 */
export function decodeRow(row: string, paletteSize: number = KEYS.length): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < row.length) {
    const start = i;
    while (i < row.length && row.charCodeAt(i) >= 48 && row.charCodeAt(i) <= 57) i++;
    const digits = row.slice(start, i);
    if (digits.length > 0 && digits[0] === '0') {
      throw new RleError(`invalid run length "${digits}"`, start);
    }
    if (i >= row.length) throw new RleError('run length without key at end of row', start);
    const key = row[i];
    const value = keyToValue(key);
    if (value < 0) throw new RleError(`unknown key "${key}"`, i);
    if (value > paletteSize) {
      throw new RleError(`key "${key}" is outside the palette (${paletteSize} colors)`, i);
    }
    const n = digits.length > 0 ? Number(digits) : 1;
    if (n > 4096) throw new RleError(`run length ${n} is too long`, start);
    for (let k = 0; k < n; k++) out.push(value);
    i++;
  }
  return out;
}

/** Encodes one row of cell values to RLE. Runs of 1 omit the count. */
export function encodeRow(values: ArrayLike<number>): string {
  let out = '';
  let i = 0;
  while (i < values.length) {
    const v = values[i];
    let j = i + 1;
    while (j < values.length && values[j] === v) j++;
    const n = j - i;
    out += (n > 1 ? String(n) : '') + valueToKey(v);
    i = j;
  }
  return out;
}

export interface Grid {
  width: number;
  height: number;
  /** Row-major cell values (0 = empty, else palette index + 1). */
  cells: Uint8Array;
}

/** Encodes a grid into h RLE rows. */
export function encode(grid: Grid): string[] {
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    rows.push(encodeRow(grid.cells.subarray(y * grid.width, (y + 1) * grid.width)));
  }
  return rows;
}

/** Decodes RLE rows into a grid. Throws RleError (message prefixed with the row) on mismatch. */
export function decode(
  rows: readonly string[],
  width: number,
  height: number,
  paletteSize: number = KEYS.length,
): Grid {
  if (rows.length !== height) {
    throw new RleError(`expected ${height} rows, got ${rows.length}`, 0);
  }
  const cells = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    let values: number[];
    try {
      values = decodeRow(row, paletteSize);
    } catch (e) {
      if (e instanceof RleError) throw new RleError(`row ${y}: ${e.message}`, e.column);
      throw e;
    }
    if (values.length !== width) {
      throw new RleError(`row ${y}: decodes to ${values.length} cells, expected ${width}`, 0);
    }
    cells.set(values, y * width);
  });
  return { width, height, cells };
}

/** Builds the runtime Artwork model. Assumes `source` passed validation. */
export function toArtwork(source: ArtworkSource): Artwork {
  const { cells } = decode(source.rows, source.w, source.h, source.palette.length);
  const colorCounts = new Uint32Array(source.palette.length);
  let totalCells = 0;
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v > 0) {
      colorCounts[v - 1]++;
      totalCells++;
    }
  }
  return {
    id: source.id,
    albumId: source.album,
    title: source.title,
    width: source.w,
    height: source.h,
    palette: buildPalette(source.palette),
    cells,
    colorCounts,
    totalCells,
    access: source.access,
    difficulty: source.difficulty,
  };
}
