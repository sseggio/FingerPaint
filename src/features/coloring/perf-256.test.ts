/**
 * F33 performance guard: the pure functions on the hot paths stay cheap on the largest grid
 * (256×256 = 65 536 cells). Budgets are generous (shared CI machines) but catch an accidental
 * quadratic loop or per-cell allocation storm: each measured operation runs in a few ms locally.
 */
import { buildThumbnailPixels, THUMBNAIL_MAX_SIDE } from '@/features/library/thumbnail-pixels';
import { toArtwork } from '@/lib/artwork/codec';
import { MAX_SIZE } from '@/lib/artwork/types';
import { bitsetFromBase64, bitsetToBase64 } from '@/lib/bitset';
import { completeReplayOrder, decodeFillOrder, encodeFillOrder, journalCells } from '@/lib/fill-order';

import { createPerfArtworkSource } from './canvas/__fixtures__/perf-artwork';
import { buildBackgroundPixels, buildColorPixels } from './canvas/layers';
import { createColoringSession, fillCells } from './coloring-session';

const BUDGET_MS = 400;

/** Best of a few runs (ignores a one-off GC pause or JIT warm-up). */
function bestMs(fn: () => void, runs = 3): number {
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('256×256 performance budget (F33)', () => {
  const source = createPerfArtworkSource();
  const artwork = toArtwork(source);
  const N = MAX_SIZE * MAX_SIZE;

  it('uses the largest grid', () => {
    expect(artwork.width * artwork.height).toBe(N);
  });

  it('decodes the artwork and builds the canvas layers quickly', () => {
    expect(bestMs(() => toArtwork(source))).toBeLessThan(BUDGET_MS);
    expect(bestMs(() => buildBackgroundPixels(artwork))).toBeLessThan(BUDGET_MS);
    const full = new Uint8Array(N / 8).fill(255);
    expect(bestMs(() => buildColorPixels(artwork, full))).toBeLessThan(BUDGET_MS);
  });

  it('fills all 65 536 cells (color by color) quickly, then replays them', () => {
    let session = createColoringSession(artwork);
    const byColor = artwork.palette.colors.map(() => [] as number[]);
    for (let i = 0; i < N; i++) if (artwork.cells[i]) byColor[artwork.cells[i] - 1].push(i);
    const ms = bestMs(() => {
      session = createColoringSession(artwork);
      byColor.forEach((cells, c) => fillCells(session, cells, c));
    });
    expect(session.completed).toBe(true);
    expect(session.filledCount).toBe(artwork.totalCells);
    expect(ms).toBeLessThan(BUDGET_MS);

    const journal = journalCells(session.order);
    expect(bestMs(() => completeReplayOrder(artwork.cells, journal))).toBeLessThan(BUDGET_MS);
    // Persistence round trip (bitset + fill order) of a finished artwork.
    expect(
      bestMs(() => {
        const bits = bitsetFromBase64(bitsetToBase64(session.filled), N);
        expect(decodeFillOrder(encodeFillOrder(session.order), bits, N)).not.toBeNull();
      }),
    ).toBeLessThan(BUDGET_MS);
    // Restoring a finished session (counters + color layer + journal check).
    expect(bestMs(() => createColoringSession(artwork, session.filled, journal))).toBeLessThan(BUDGET_MS);
  });

  it('renders a downscaled library thumbnail quickly', () => {
    const half = new Uint8Array(N / 8).fill(0b01010101);
    let pixels: Uint8Array = new Uint8Array(0);
    expect(bestMs(() => (pixels = buildThumbnailPixels(artwork, half, THUMBNAIL_MAX_SIDE)))).toBeLessThan(BUDGET_MS / 4);
    expect(pixels).toHaveLength(THUMBNAIL_MAX_SIDE * THUMBNAIL_MAX_SIDE * 4);
  });
});
