import { cellsOnLine, type Size } from './geometry';

/**
 * Drag-to-fill stroke, accumulated on the UI thread. Cells of the active color crossed by the
 * finger are collected once each (deduplicated), including the cells skipped between two touch
 * events, and handed to the JS runtime in batches: at the end of the gesture, or every
 * `DRAG_BATCH_MAX` new cells during a very long drag. All functions are worklets operating on a
 * plain state object (stored in a shared value).
 */

/** New cells after which a running drag sends a batch without waiting for the finger to lift. */
export const DRAG_BATCH_MAX = 512;

export interface StrokeState {
  /** Every cell collected by the current stroke, in order (also drawn as the live preview). */
  cells: number[];
  /** Cells already collected (dedup). */
  seen: Record<number, true>;
  /** Last cell under the finger (row-major), or -1 when outside the grid. */
  last: number;
  /** How many of `cells` were already sent to the JS runtime. */
  sent: number;
}

export function emptyStroke(): StrokeState {
  'worklet';
  return { cells: [], seen: {}, last: -1, sent: 0 };
}

/**
 * Extends the stroke to the cell (col, row): collects the cells of value `active` on the segment
 * from the previous cell, skipping cells already collected. Returns the number of cells added.
 * Mutates `state`.
 */
export function strokeTo(
  state: StrokeState,
  grid: Size,
  cells: ArrayLike<number>,
  active: number,
  col: number,
  row: number,
): number {
  'worklet';
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) {
    state.last = -1;
    return 0;
  }
  const index = row * grid.width + col;
  if (index === state.last) return 0;
  const fromCol = state.last >= 0 ? state.last % grid.width : col;
  const fromRow = state.last >= 0 ? Math.floor(state.last / grid.width) : row;
  state.last = index;
  if (active <= 0) return 0;
  let added = 0;
  const line = cellsOnLine(fromCol, fromRow, col, row);
  for (let k = 0; k < line.length; k++) {
    const i = line[k].row * grid.width + line[k].col;
    if (cells[i] !== active || state.seen[i]) continue;
    state.seen[i] = true;
    state.cells.push(i);
    added++;
  }
  return added;
}

export function pendingCount(state: StrokeState): number {
  'worklet';
  return state.cells.length - state.sent;
}

/** Cells collected since the last batch (marked as sent), or null when there are none. */
export function takeBatch(state: StrokeState): number[] | null {
  'worklet';
  if (state.cells.length <= state.sent) return null;
  const batch = state.cells.slice(state.sent);
  state.sent = state.cells.length;
  return batch;
}
