/**
 * Live fill preview, kept in sync with the color layer (F16).
 *
 * Cells the user fills (tap or continuous stroke) are drawn right away on the UI thread, but they
 * only reach the color layer image after a hop to the JS runtime (coloring session, revision,
 * frame coalescer, new image). If the preview were dropped as soon as the finger lifts, the cells
 * would show gray (with their numbers) for a frame or more before turning colored: a flash.
 *
 * So each batch sent to the JS runtime stays in the preview until the color layer image that
 * contains it is on screen:
 * 1. UI: `addBatch` when the batch is sent (`shownAt` unknown, -1);
 * 2. JS: the batch is filled, then `settleBatch` tells which cells the session refused (dropped
 *    from the preview right away) and which layer revision will show the others;
 * 3. UI: `acknowledgeBatch` records it; `showLayer` is called one frame after the color layer
 *    image of that revision was committed (F19), when it is already drawn: removing the preview
 *    late is invisible (same pixels), removing it early would flash.
 *
 * Over cells already painted, the preview draws exactly the same thing as the color layer
 * (target color, opaque, no anti-aliasing), so keeping it a little longer is invisible.
 * All the state functions are worklets mutating a plain object stored in a shared value.
 */

/** Bytes per pixel of the color layer buffer (RGBA). */
const RGBA = 4;

export interface PreviewBatch {
  id: number;
  /** Cells still previewed (row-major). */
  cells: number[];
  /** Color layer revision that shows these cells; -1 until the JS runtime has acknowledged it. */
  shownAt: number;
}

export interface PreviewState {
  batches: PreviewBatch[];
  nextId: number;
  /** Revision of the color layer image currently drawn. */
  layer: number;
}

export function emptyPreview(layer = 0): PreviewState {
  'worklet';
  return { batches: [], nextId: 1, layer };
}

/** The batch can leave the preview: the color layer on screen already shows its cells. */
export function canClearBatch(batch: PreviewBatch, layer: number): boolean {
  'worklet';
  return batch.cells.length === 0 || (batch.shownAt >= 0 && layer >= batch.shownAt);
}

function prune(state: PreviewState) {
  'worklet';
  const kept: PreviewBatch[] = [];
  for (let k = 0; k < state.batches.length; k++) {
    if (!canClearBatch(state.batches[k], state.layer)) kept.push(state.batches[k]);
  }
  state.batches = kept;
}

/**
 * Adds cells sent to the JS runtime to the preview. Returns the batch id to acknowledge: `id`
 * when given (taken from a counter kept outside the state, F19), else the next one of the state.
 */
export function addBatch(state: PreviewState, cells: number[], batchId?: number): number {
  'worklet';
  const id = batchId ?? state.nextId;
  state.nextId = Math.max(state.nextId, id + 1);
  if (cells.length > 0) state.batches.push({ id, cells: cells.slice(), shownAt: -1 });
  return id;
}

/**
 * The JS runtime handled batch `id`: `rejected` cells were not painted (they leave the preview
 * now), the others are shown from layer revision `shownAt` on.
 */
export function acknowledgeBatch(state: PreviewState, id: number, rejected: number[], shownAt: number): void {
  'worklet';
  for (let k = 0; k < state.batches.length; k++) {
    const batch = state.batches[k];
    if (batch.id !== id) continue;
    if (rejected.length > 0) {
      const drop: Record<number, true> = {};
      for (let r = 0; r < rejected.length; r++) drop[rejected[r]] = true;
      batch.cells = batch.cells.filter((i) => !drop[i]);
    }
    batch.shownAt = shownAt;
  }
  prune(state);
}

/** The color layer image of revision `layer` is now the one drawn. */
export function showLayer(state: PreviewState, layer: number): void {
  'worklet';
  state.layer = Math.max(state.layer, layer);
  prune(state);
}

/** Every previewed cell: the pending batches, then the stroke cells not sent yet. */
export function previewCells(state: PreviewState, stroke: { cells: number[]; sent: number }): number[] {
  'worklet';
  const out: number[] = [];
  for (let k = 0; k < state.batches.length; k++) {
    const cells = state.batches[k].cells;
    for (let c = 0; c < cells.length; c++) out.push(cells[c]);
  }
  for (let k = stroke.sent; k < stroke.cells.length; k++) out.push(stroke.cells[k]);
  return out;
}

/**
 * Previewed cells grouped by their palette value (1-based, the color they get in the color
 * layer), so each group is drawn in its own color.
 */
export function groupByValue(indices: number[], cells: ArrayLike<number>): Record<number, number[]> {
  'worklet';
  const groups: Record<number, number[]> = {};
  for (let k = 0; k < indices.length; k++) {
    const value = cells[indices[k]];
    if (!value) continue;
    const group = groups[value];
    if (group) group.push(indices[k]);
    else groups[value] = [indices[k]];
  }
  return groups;
}

/** Whether each cell of `batch` is painted (opaque) in the color layer buffer. */
export function paintedMask(pixels: Uint8Array, batch: ArrayLike<number>): boolean[] {
  const mask: boolean[] = [];
  for (let k = 0; k < batch.length; k++) mask.push(pixels[batch[k] * RGBA + 3] === 255);
  return mask;
}

/**
 * JS side, right after the coloring session handled `batch`: the cells left unpainted are
 * rejected, and the batch is shown by the next layer revision if it painted anything new (the
 * session requested a rebuild), else by the current one (`layer`, the last revision handed to
 * the canvas).
 */
export function settleBatch(
  batch: ArrayLike<number>,
  before: boolean[],
  after: boolean[],
  layer: number,
): { rejected: number[]; shownAt: number } {
  const rejected: number[] = [];
  let painted = false;
  for (let k = 0; k < batch.length; k++) {
    if (!after[k]) rejected.push(batch[k]);
    else if (!before[k]) painted = true;
  }
  return { rejected, shownAt: painted ? layer + 1 : layer };
}

/**
 * JS-side mirror of the colors still in the preview: palette value (1-based) → color layer
 * revision that shows its last pending batch. Lets the canvas mount a preview path only for the
 * colors that can be previewed, without a UI → JS hop. Immutable updates (React state).
 */
export type PendingValues = Readonly<Record<number, number>>;

/**
 * A batch was settled (`settleBatch`): its painted cells stay previewed until revision
 * `shownAt`. Returns `pending` itself when nothing changes (batch fully refused, or already
 * shown by the layer on screen, `layer`).
 */
export function addPendingBatch(
  pending: PendingValues,
  batch: ArrayLike<number>,
  rejected: readonly number[],
  shownAt: number,
  layer: number,
  cells: ArrayLike<number>,
): PendingValues {
  if (shownAt <= layer) return pending;
  const refused = new Set(rejected);
  let next: Record<number, number> | null = null;
  for (let k = 0; k < batch.length; k++) {
    if (refused.has(batch[k])) continue;
    const value = cells[batch[k]];
    if (!value) continue;
    const current = (next ?? pending)[value];
    if (current !== undefined && current >= shownAt) continue;
    next ??= { ...pending };
    next[value] = shownAt;
  }
  return next ?? pending;
}

/** The color layer of revision `layer` is drawn: drops the colors it shows (same object if none). */
export function dropShownValues(pending: PendingValues, layer: number): PendingValues {
  const keys = Object.keys(pending).map(Number);
  if (!keys.some((v) => pending[v] <= layer)) return pending;
  const next: Record<number, number> = {};
  for (const v of keys) if (pending[v] > layer) next[v] = pending[v];
  return next;
}
