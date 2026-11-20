import type { FrameScheduler } from '@/lib/frame-coalescer';
import { REPLAY_DURATION_MS, replayCountAt } from '@/lib/replay';

import { createColorPixels, paintCells, type LayerSource } from './layers';

/**
 * Drives the completion replay (F18) on the JS thread: at each animation frame, paints the cells
 * due at that time (`replayCountAt`) into its own RGBA buffer, in one batch, then calls
 * `onFrame` once (the canvas rebuilds one image per frame at most and hands it to the UI thread
 * through a shared value: no React state per frame). Ends exactly on the last cell at
 * `durationMs`, or right away with `skip()`.
 */
export interface ReplayPlayer {
  /** RGBA buffer of the replayed color layer (starts fully transparent). */
  readonly pixels: Uint8Array;
  start(): void;
  /** Paints every remaining cell now and finishes (a tap during the replay). */
  skip(): void;
  /** Stops without finishing (unmount). */
  cancel(): void;
  /** Cells painted so far. */
  shown(): number;
}

export interface ReplayPlayerOptions {
  artwork: LayerSource;
  /** Cells in replay order (see `completeReplayOrder`). */
  order: ArrayLike<number>;
  /** Called after each frame that painted cells (and once at the start, with none painted). */
  onFrame(pixels: Uint8Array, shown: number): void;
  /** Called once, when the last cell is painted. `skipped`: finished by `skip()`. */
  onDone(skipped: boolean): void;
  durationMs?: number;
  now?: () => number;
  scheduler?: FrameScheduler;
}

const defaultScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function createReplayPlayer({
  artwork,
  order,
  onFrame,
  onDone,
  durationMs = REPLAY_DURATION_MS,
  now = Date.now,
  scheduler = defaultScheduler,
}: ReplayPlayerOptions): ReplayPlayer {
  const pixels = createColorPixels(artwork.width, artwork.height);
  const total = order.length;
  let shown = 0;
  let startedAt = 0;
  let handle: number | null = null;
  let state: 'idle' | 'running' | 'done' = 'idle';

  const paintUpTo = (target: number) => {
    if (target <= shown) return false;
    // Paints the slice in place: a frame of a 256×256 replay can hold thousands of cells.
    paintCells(pixels, artwork, order, shown, target);
    shown = target;
    return true;
  };

  const finish = (skipped: boolean) => {
    state = 'done';
    if (handle !== null) scheduler.cancel(handle);
    handle = null;
    onDone(skipped);
  };

  const tick = () => {
    handle = null;
    if (state !== 'running') return;
    const target = replayCountAt(now() - startedAt, durationMs, total);
    if (paintUpTo(target)) onFrame(pixels, shown);
    if (shown >= total) finish(false);
    else handle = scheduler.request(tick);
  };

  return {
    pixels,
    start() {
      if (state !== 'idle') return;
      state = 'running';
      startedAt = now();
      // First frame: the empty drawing (grayscale only).
      onFrame(pixels, 0);
      if (total === 0) finish(false);
      else handle = scheduler.request(tick);
    },
    skip() {
      if (state === 'done') return;
      state = 'running';
      if (paintUpTo(total)) onFrame(pixels, shown);
      finish(true);
    },
    cancel() {
      if (handle !== null) scheduler.cancel(handle);
      handle = null;
      state = 'done';
    },
    shown: () => shown,
  };
}
