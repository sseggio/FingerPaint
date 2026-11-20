import { MAX_SIZE } from './artwork/types';
import { decodeBase64, encodeBase64, getBit } from './bitset';

/**
 * Fill order journal (F18): the cells of an artwork in the order they were filled, used to
 * replay the coloring when the artwork is finished.
 *
 * - In memory: a `FillJournal`, a Uint16Array sized for the whole grid (one slot per cell, so it
 *   never grows) and the number of slots used. Cell indices fit in 16 bits: the largest artwork is
 *   MAX_SIZE² = 256×256 = 65 536 cells, indices 0..65 535, exactly the Uint16 range (F33; checked
 *   at load time below, so raising MAX_SIZE again forces a format change here).
 * - Stored: the used slots as little-endian Uint16 bytes, in padded base64 (2 bytes per cell,
 *   ~175 KB of text for a full 256×256 artwork, ~43 KB for 128×128).
 *
 * A journal read back from storage or from a backup is checked strictly (`decodeFillOrder`):
 * every index inside the grid, no duplicate, every cell set in the progress bitset. Anything
 * else drops the journal (never the progress itself). A journal may be shorter than the bitset:
 * cells filled before the journal existed (progress from an older version, imported backups)
 * are simply not in it; `completeReplayOrder` puts them back for the replay.
 */

/** Largest cell count a Uint16 journal can index. */
export const MAX_FILL_ORDER_CELLS = 65_536;
if (MAX_SIZE * MAX_SIZE > MAX_FILL_ORDER_CELLS) {
  throw new Error('fill order: MAX_SIZE² exceeds the Uint16 journal range');
}

export interface FillJournal {
  /** One slot per cell of the grid; only the first `length` are meaningful. */
  readonly cells: Uint16Array;
  length: number;
}

/** Read-only view of a journal (what the progress repo reads at save time). */
export interface FillOrderView {
  readonly cells: Uint16Array;
  readonly length: number;
}

export function createFillJournal(cellCount: number, initial?: ArrayLike<number>): FillJournal {
  if (!Number.isInteger(cellCount) || cellCount < 0 || cellCount > MAX_FILL_ORDER_CELLS) {
    throw new RangeError(`fill order: invalid cell count ${cellCount}`);
  }
  const journal: FillJournal = { cells: new Uint16Array(cellCount), length: 0 };
  if (initial) appendFillJournal(journal, initial);
  return journal;
}

/**
 * Appends cells (in order). The caller only passes newly filled cells, so the journal never
 * holds a duplicate; it stops silently at its capacity (cannot happen for a valid session).
 */
export function appendFillJournal(journal: FillJournal, cells: ArrayLike<number>): void {
  const room = journal.cells.length - journal.length;
  const n = Math.min(room, cells.length);
  for (let k = 0; k < n; k++) journal.cells[journal.length + k] = cells[k];
  journal.length += n;
}

/** The used slots of a journal (a view, not a copy). */
export function journalCells(journal: FillOrderView): Uint16Array {
  return journal.cells.subarray(0, journal.length);
}

/** Encodes the first `length` cells as base64 of little-endian Uint16 values. */
export function encodeFillOrder(order: FillOrderView | Uint16Array): string {
  const cells = order instanceof Uint16Array ? order : journalCells(order);
  const bytes = new Uint8Array(cells.length * 2);
  for (let k = 0; k < cells.length; k++) {
    bytes[k * 2] = cells[k] & 255;
    bytes[k * 2 + 1] = cells[k] >> 8;
  }
  return encodeBase64(bytes);
}

/**
 * Decodes and validates a stored journal against the progress bitset of a `cellCount`-cell
 * grid. Returns null when anything is off: malformed base64, odd byte count, more entries than
 * cells, an index outside the grid, a duplicate or a cell not set in `filled`.
 */
export function decodeFillOrder(input: unknown, filled: Uint8Array, cellCount: number): Uint16Array | null {
  if (typeof input !== 'string') return null;
  if (!Number.isInteger(cellCount) || cellCount < 0 || cellCount > MAX_FILL_ORDER_CELLS) return null;
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(input);
  } catch {
    return null;
  }
  if (bytes.length % 2 !== 0) return null;
  const length = bytes.length / 2;
  if (length > cellCount) return null;
  const order = new Uint16Array(length);
  const seen = new Uint8Array(cellCount);
  for (let k = 0; k < length; k++) {
    const index = bytes[k * 2] | (bytes[k * 2 + 1] << 8);
    if (index >= cellCount || seen[index] || (index >> 3) >= filled.length || !getBit(filled, index)) return null;
    seen[index] = 1;
    order[k] = index;
  }
  return order;
}

/**
 * Checks an in-memory journal against an artwork's cells and bitset: indices inside the grid, on
 * non-empty cells, set in `filled`, without duplicates. Used when a session restores a journal
 * (the bitset may have been cleaned of bits on empty cells).
 */
export function isFillOrderConsistent(order: ArrayLike<number>, cells: ArrayLike<number>, filled: Uint8Array): boolean {
  const seen = new Uint8Array(cells.length);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    if (!Number.isInteger(i) || i < 0 || i >= cells.length || cells[i] === 0 || seen[i] || !getBit(filled, i)) {
      return false;
    }
    seen[i] = 1;
  }
  return true;
}

/**
 * Full replay order of an artwork: every non-empty cell exactly once.
 *
 * Cells missing from the journal were filled before it started (older progress, imported
 * backups), so they come first, in a calm, readable order: palette color by palette color (as
 * if colored one number at a time), each color swept row by row, top to bottom. The journal
 * follows, in its recorded order. Invalid journal entries (outside the grid, empty cells,
 * duplicates) are skipped, so the result is always a permutation of the non-empty cells.
 */
export function completeReplayOrder(cells: ArrayLike<number>, journal: ArrayLike<number>): Uint32Array {
  const inJournal = new Uint8Array(cells.length);
  const recorded: number[] = [];
  for (let k = 0; k < journal.length; k++) {
    const i = journal[k];
    if (!Number.isInteger(i) || i < 0 || i >= cells.length || cells[i] === 0 || inJournal[i]) continue;
    inJournal[i] = 1;
    recorded.push(i);
  }
  // Counting sort of the missing cells by palette value, stable (row-major within a color).
  let maxValue = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] > maxValue) maxValue = cells[i];
  const counts = new Uint32Array(maxValue + 2);
  let missing = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 0 || inJournal[i]) continue;
    counts[cells[i] + 1]++;
    missing++;
  }
  for (let v = 1; v < counts.length; v++) counts[v] += counts[v - 1];
  const order = new Uint32Array(missing + recorded.length);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 0 || inJournal[i]) continue;
    order[counts[cells[i]]++] = i;
  }
  order.set(recorded, missing);
  return order;
}
