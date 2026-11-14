import AsyncStorage from '@react-native-async-storage/async-storage';

import { createProgressRepo } from '@/features/progress/progress-repo';
import { countBits, createBitset, getBit, setBit } from '@/lib/bitset';

import { cellsOf, tinyArtwork } from './__fixtures__/tiny-artwork';
import {
  createColoringSession,
  fillCells,
  isColorComplete,
  nextIncompleteColor,
  sessionSummary,
} from './coloring-session';

const artwork = tinyArtwork();
const A = cellsOf(artwork, 0);
const B = cellsOf(artwork, 1);
const C = cellsOf(artwork, 2);
const EMPTY = 7 * 8; // first cell of the empty last row

function pixel(pixels: Uint8Array, index: number) {
  return Array.from(pixels.subarray(index * 4, index * 4 + 4));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('fixture', () => {
  it('has the expected color counts', () => {
    expect([A.length, B.length, C.length]).toEqual([20, 32, 4]);
    expect(artwork.totalCells).toBe(56);
  });
});

describe('fillCells', () => {
  it('fills cells of the active color and paints them', () => {
    const s = createColoringSession(artwork);
    const result = fillCells(s, [A[0], A[1]], 0);
    expect(result.filled).toEqual([A[0], A[1]]);
    expect(result.wrong).toBe(0);
    expect(s.filledCount).toBe(2);
    expect(s.colorFilled[0]).toBe(2);
    expect(s.revision).toBe(1);
    expect(getBit(s.filled, A[0])).toBe(true);
    expect(pixel(s.colorPixels, A[0])).toEqual([0x1b, 0x1a, 0x2e, 255]);
  });

  it('changes nothing for a wrong color', () => {
    const s = createColoringSession(artwork);
    const before = { bits: s.filled.slice(), pixels: s.colorPixels.slice() };
    const result = fillCells(s, [B[0], C[0]], 0);
    expect(result).toEqual({ filled: [], wrong: 2, ignored: 0, completedColors: [], completedNow: false });
    expect(s.filled).toEqual(before.bits);
    expect(s.colorPixels).toEqual(before.pixels);
    expect(s.filledCount).toBe(0);
    expect(s.revision).toBe(0);
  });

  it('ignores duplicates, already filled, empty and out-of-range cells', () => {
    const s = createColoringSession(artwork);
    fillCells(s, [A[0]], 0);
    const result = fillCells(s, [A[0], A[1], A[1], EMPTY, -1, 64, 1.5], 0);
    expect(result.filled).toEqual([A[1]]);
    expect(result.ignored).toBe(6);
    expect(s.filledCount).toBe(2);
    // A correct cell of another color is not "wrong" (nothing would change anyway).
    fillCells(s, [B[0]], 1);
    expect(fillCells(s, [B[0]], 0)).toMatchObject({ wrong: 0, ignored: 1 });
  });

  it('keeps only the correct cells of a mixed batch', () => {
    const s = createColoringSession(artwork);
    const result = fillCells(s, [...A.slice(0, 5), ...B.slice(0, 5)], 0);
    expect(result.filled).toHaveLength(5);
    expect(result.wrong).toBe(5);
    expect(s.colorFilled[1]).toBe(0);
  });
});

describe('completion', () => {
  it('reports a color once, when its last cell is filled', () => {
    const s = createColoringSession(artwork);
    expect(fillCells(s, C.slice(0, 3), 2).completedColors).toEqual([]);
    expect(fillCells(s, C, 2).completedColors).toEqual([2]);
    expect(isColorComplete(s, 2)).toBe(true);
    expect(fillCells(s, C, 2).completedColors).toEqual([]);
  });

  it('completes the artwork exactly once', () => {
    const s = createColoringSession(artwork);
    expect(fillCells(s, A, 0).completedNow).toBe(false);
    expect(fillCells(s, B, 1).completedNow).toBe(false);
    const last = fillCells(s, C, 2);
    expect(last.completedNow).toBe(true);
    expect(s.completed).toBe(true);
    expect(fillCells(s, C, 2).completedNow).toBe(false);
    expect(fillCells(s, A, 0).completedNow).toBe(false);
  });

  it('never completes again an artwork restored as finished', () => {
    const s = createColoringSession(artwork);
    [A, B, C].forEach((cells, i) => fillCells(s, cells, i));
    const restored = createColoringSession(artwork, s.filled);
    expect(restored.completed).toBe(true);
    expect(fillCells(restored, A, 0).completedNow).toBe(false);
  });
});

describe('nextIncompleteColor', () => {
  it('moves to the next unfinished color, wrapping around, and null when all are done', () => {
    const s = createColoringSession(artwork);
    expect(nextIncompleteColor(s, -1)).toBe(0);
    expect(nextIncompleteColor(s, 0)).toBe(1);
    fillCells(s, B, 1);
    expect(nextIncompleteColor(s, 0)).toBe(2);
    expect(nextIncompleteColor(s, 2)).toBe(0);
    fillCells(s, A, 0);
    expect(nextIncompleteColor(s, 2)).toBe(2);
    fillCells(s, C, 2);
    expect(nextIncompleteColor(s, 2)).toBeNull();
  });
});

describe('restore', () => {
  it('rebuilds counters and pixels from a bitset, dropping bits on empty cells', () => {
    const bits = createBitset(64);
    setBit(bits, A[0]);
    setBit(bits, B[3]);
    setBit(bits, EMPTY);
    const s = createColoringSession(artwork, bits);
    expect(s.filledCount).toBe(2);
    expect(Array.from(s.colorFilled)).toEqual([1, 1, 0]);
    expect(getBit(s.filled, EMPTY)).toBe(false);
    expect(pixel(s.colorPixels, B[3])).toEqual([0xff, 0x3d, 0x7f, 255]);
    // The caller's buffer is copied, not adopted.
    expect(s.filled).not.toBe(bits);
  });

  it('ignores a bitset of the wrong size', () => {
    const s = createColoringSession(artwork, new Uint8Array(3).fill(255));
    expect(s.filledCount).toBe(0);
  });
});

describe('summary', () => {
  it('derives status and keeps the first start and completion times', () => {
    const s = createColoringSession(artwork);
    expect(sessionSummary(s, undefined, 100, 0)).toEqual({
      artworkId: 'tiny',
      filledCount: 0,
      status: 'new',
      startedAt: 100,
      updatedAt: 100,
      activeMs: 0,
    });
    fillCells(s, A, 0);
    const started = sessionSummary(s, undefined, 200, 1500.4);
    expect(started).toMatchObject({ status: 'in_progress', startedAt: 200, activeMs: 1500 });
    fillCells(s, B, 1);
    fillCells(s, C, 2);
    const done = sessionSummary(s, started, 300, 2000);
    expect(done).toMatchObject({ status: 'completed', startedAt: 200, completedAt: 300, filledCount: 56 });
    expect(sessionSummary(s, done, 400, 2500).completedAt).toBe(300);
  });
});

describe('session ↔ storage round trip', () => {
  it('restores exactly the saved cells after a reload from storage', async () => {
    const s = createColoringSession(artwork);
    fillCells(s, A.slice(0, 7), 0);
    fillCells(s, B.slice(10, 20), 1);
    fillCells(s, C, 2);

    const writer = createProgressRepo();
    await writer.loadIndex();
    writer.save(sessionSummary(s, undefined, 1000, 42), s.filled);
    await writer.flush();

    // A fresh repo, as after an app restart.
    const reader = createProgressRepo();
    const index = await reader.loadIndex();
    expect(index.tiny).toMatchObject({ filledCount: 21, status: 'in_progress', activeMs: 42 });
    const bits = await reader.loadFilled('tiny', artwork.cells.length);
    const restored = createColoringSession(artwork, bits);
    expect(restored.filled).toEqual(s.filled);
    expect(restored.colorPixels).toEqual(s.colorPixels);
    expect(Array.from(restored.colorFilled)).toEqual([7, 10, 4]);
    expect(countBits(restored.filled)).toBe(restored.filledCount);
    expect(restored.completed).toBe(false);
  });
});
