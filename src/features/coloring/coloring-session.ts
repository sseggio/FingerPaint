import type { ProgressSummary } from '@/features/progress/progress-schema';
import type { Artwork } from '@/lib/artwork/types';
import { byteLengthFor, clearBit, getBit, setBit } from '@/lib/bitset';

import { buildColorPixels, paintCells } from './canvas/layers';

/**
 * Coloring session of one artwork: the mutable state behind the canvas. The bitset and the
 * RGBA color layer are mutated in place (never copied); `revision` counts the changes so the
 * view knows when to rebuild the color layer image.
 *
 * Only correct cells are ever stored: a cell of another color is rejected without any change.
 */
export interface ColoringSession {
  readonly artwork: Artwork;
  /** Bit i set = cell i correctly filled. Live buffer handed to the progress repo. */
  readonly filled: Uint8Array;
  /** RGBA color layer (w×h), kept in sync with `filled`. */
  readonly colorPixels: Uint8Array;
  /** colorFilled[i] = filled cells of palette color i. */
  readonly colorFilled: Uint32Array;
  filledCount: number;
  revision: number;
  /** True once every cell is filled (set once, by the batch that fills the last cell). */
  completed: boolean;
}

export interface FillResult {
  /** Cells filled by this batch (row-major indices), in batch order. */
  filled: number[];
  /** Cells of another color: not filled (the caller plays a light haptic). */
  wrong: number;
  /** Already filled, duplicated in the batch, empty or out of range. */
  ignored: number;
  /** Palette colors (0-based) whose last cell was filled by this batch. */
  completedColors: number[];
  /** True only for the batch that completes the artwork (never twice per session). */
  completedNow: boolean;
}

/**
 * Starts a session, optionally from a stored bitset. A bitset of the wrong size is ignored and
 * bits on empty cells are cleared, so counters always match the artwork.
 */
export function createColoringSession(artwork: Artwork, restored?: Uint8Array): ColoringSession {
  const total = artwork.cells.length;
  const filled = new Uint8Array(byteLengthFor(total));
  if (restored && restored.length === filled.length) filled.set(restored);
  const colorFilled = new Uint32Array(artwork.palette.colors.length);
  let filledCount = 0;
  for (let i = 0; i < total; i++) {
    if (!getBit(filled, i)) continue;
    const value = artwork.cells[i];
    if (value === 0) {
      clearBit(filled, i);
      continue;
    }
    colorFilled[value - 1]++;
    filledCount++;
  }
  // Clear padding bits beyond the last cell (they would be counted by a naive reader).
  for (let i = total; i < filled.length * 8; i++) clearBit(filled, i);
  return {
    artwork,
    filled,
    colorPixels: buildColorPixels(artwork, filled),
    colorFilled,
    filledCount,
    revision: 0,
    completed: artwork.totalCells > 0 && filledCount >= artwork.totalCells,
  };
}

export function isColorComplete(session: ColoringSession, colorIndex: number): boolean {
  return session.colorFilled[colorIndex] >= session.artwork.colorCounts[colorIndex];
}

/**
 * Fills the cells of `batch` that belong to `colorIndex` (0-based palette index). Everything
 * else is left untouched. The color layer is painted once for the whole batch.
 */
export function fillCells(session: ColoringSession, batch: ArrayLike<number>, colorIndex: number): FillResult {
  const { artwork } = session;
  const { cells } = artwork;
  const value = colorIndex + 1;
  const result: FillResult = { filled: [], wrong: 0, ignored: 0, completedColors: [], completedNow: false };
  const wasComplete = isColorComplete(session, colorIndex);

  for (let k = 0; k < batch.length; k++) {
    const i = batch[k];
    if (!Number.isInteger(i) || i < 0 || i >= cells.length || cells[i] === 0) {
      result.ignored++;
    } else if (cells[i] !== value) {
      // Already-correct cells of another color are not "wrong": nothing would change anyway.
      if (getBit(session.filled, i)) result.ignored++;
      else result.wrong++;
    } else if (setBit(session.filled, i)) {
      result.filled.push(i);
    } else {
      result.ignored++;
    }
  }

  if (result.filled.length === 0) return result;
  paintCells(session.colorPixels, artwork, result.filled);
  session.colorFilled[colorIndex] += result.filled.length;
  session.filledCount += result.filled.length;
  session.revision++;
  if (!wasComplete && isColorComplete(session, colorIndex)) result.completedColors.push(colorIndex);
  if (!session.completed && session.filledCount >= artwork.totalCells) {
    session.completed = true;
    result.completedNow = true;
  }
  return result;
}

/**
 * Next color still to finish after `from` (0-based), wrapping around; `from` itself comes last.
 * Null when every color is done. Pass -1 to get the first unfinished color.
 */
export function nextIncompleteColor(session: ColoringSession, from: number): number | null {
  const n = session.artwork.palette.colors.length;
  for (let step = 1; step <= n; step++) {
    const i = (((from + step) % n) + n) % n;
    if (!isColorComplete(session, i)) return i;
  }
  return null;
}

/** Index entry describing the session (the bitset is saved alongside, by reference). */
export function sessionSummary(
  session: ColoringSession,
  previous: ProgressSummary | undefined,
  now: number,
  activeMs: number,
): ProgressSummary {
  const summary: ProgressSummary = {
    artworkId: session.artwork.id,
    filledCount: session.filledCount,
    status: session.completed ? 'completed' : session.filledCount > 0 ? 'in_progress' : 'new',
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
    activeMs: Math.max(0, Math.round(activeMs)),
  };
  if (session.completed) summary.completedAt = previous?.completedAt ?? now;
  return summary;
}
