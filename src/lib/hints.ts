import { getBit } from './bitset';

/**
 * "Find" hint: the next cell to color. Pure, O(cells) (16 384 at most), called on demand only.
 */

export interface HintSource {
  width: number;
  height: number;
  /** Row-major cell values: 0 = empty, otherwise palette index + 1. */
  cells: ArrayLike<number>;
  /** Bit i set = cell i already correctly filled. */
  filled: Uint8Array;
}

/**
 * Unfilled cell of palette color `colorIndex` (0-based) whose center is the closest to the world
 * point (cx, cy) (1 unit = 1 cell, typically the center of the view). Ties go to the first cell
 * in row-major order. Returns the row-major index, or null when the color has no cell left.
 */
export function findNearestUnfilledCell(source: HintSource, colorIndex: number, cx: number, cy: number): number | null {
  const { width, cells, filled } = source;
  const value = colorIndex + 1;
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== value || getBit(filled, i)) continue;
    const dx = (i % width) + 0.5 - cx;
    const dy = Math.floor(i / width) + 0.5 - cy;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Number of unfilled cells of a color (0-based). */
export function remainingCells(source: HintSource, colorIndex: number): number {
  const value = colorIndex + 1;
  let count = 0;
  for (let i = 0; i < source.cells.length; i++) if (source.cells[i] === value && !getBit(source.filled, i)) count++;
  return count;
}
