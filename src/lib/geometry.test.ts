import { MAX_SIZE } from '@/lib/artwork/types';

import {
  cellsOnLine,
  cellToScreen,
  clamp,
  clampTranslation,
  clampViewport,
  doubleTapViewport,
  fitScale,
  fitViewport,
  focusCellViewport,
  FOCUS_CELL_PT,
  maxVisibleCells,
  MAX_CELL_PT,
  numberThreshold,
  rangeFromKey,
  rangeKey,
  rangeSize,
  RANGE_KEY_BASE,
  scaleBounds,
  screenToCell,
  screenToWorld,
  visibleRange,
  worldToScreen,
  zoomAt,
  viewCenter,
  type Viewport,
} from './geometry';

const grid = { width: 32, height: 16 };
const view = { width: 320, height: 640 };

describe('fit and bounds', () => {
  it('fits the limiting dimension', () => {
    expect(fitScale(grid, view)).toBe(10);
    expect(fitScale({ width: 128, height: 128 }, { width: 398, height: 700 }, 7)).toBe(3);
  });

  it('never lets max fall below the fit scale', () => {
    expect(scaleBounds(grid, view)).toEqual({ min: 10, max: MAX_CELL_PT });
    expect(scaleBounds({ width: 8, height: 8 }, { width: 800, height: 800 })).toEqual({ min: 100, max: 100 });
  });

  it('centers the grid when fitted', () => {
    expect(fitViewport(grid, view)).toEqual({ scale: 10, tx: 0, ty: 240 });
  });
});

describe('clamp', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('centers small content and blocks gaps on large content', () => {
    expect(clampTranslation(50, 100, 300)).toBe(100);
    expect(clampTranslation(20, 600, 300)).toBe(0);
    expect(clampTranslation(-500, 600, 300)).toBe(-300);
    expect(clampTranslation(-120, 600, 300)).toBe(-120);
  });

  it('clamps a whole viewport', () => {
    const bounds = scaleBounds(grid, view);
    expect(clampViewport({ scale: 1, tx: 99, ty: 99 }, grid, view, bounds)).toEqual(fitViewport(grid, view));
    expect(clampViewport({ scale: 100, tx: 50, ty: -9999 }, grid, view, bounds)).toEqual({
      scale: MAX_CELL_PT,
      tx: 0,
      ty: view.height - grid.height * MAX_CELL_PT,
    });
  });
});

describe('screen ↔ cell', () => {
  const v: Viewport = { scale: 20, tx: -35, ty: 12 };

  it('round-trips world and screen coordinates', () => {
    const s = worldToScreen(3.5, 7.25, v);
    expect(screenToWorld(s.x, s.y, v)).toEqual({ x: 3.5, y: 7.25 });
  });

  it('inverts the transform to find the cell under a point', () => {
    for (const [col, row] of [
      [0, 0],
      [5, 3],
      [31, 15],
    ]) {
      const corner = cellToScreen(col, row, v);
      expect(screenToCell(corner.x + 0.5, corner.y + 0.5, v, grid)).toEqual({ col, row });
      expect(screenToCell(corner.x + 19.9, corner.y + 19.9, v, grid)).toEqual({ col, row });
    }
  });

  it('returns null outside the grid', () => {
    expect(screenToCell(-36, 20, v, grid)).toBeNull();
    expect(screenToCell(0, 11, v, grid)).toBeNull();
    const end = cellToScreen(32, 16, v);
    expect(screenToCell(end.x + 1, end.y - 5, v, grid)).toBeNull();
  });
});

describe('visibleRange', () => {
  it('covers the whole grid when fitted', () => {
    const r = visibleRange(fitViewport(grid, view), grid, view);
    expect(r).toEqual({ x0: 0, y0: 0, x1: 32, y1: 16 });
    expect(rangeSize(r)).toBe(512);
  });

  it('includes partially visible cells only', () => {
    const v: Viewport = { scale: 40, tx: -50, ty: -30 };
    // x: screen [0, 320) → world [1.25, 9.25) → cols 1..9 ; y: world [0.75, 16.75) → rows 0..15
    expect(visibleRange(v, grid, { width: 320, height: 640 })).toEqual({ x0: 1, y0: 0, x1: 10, y1: 16 });
  });

  it('packs ranges into comparable keys', () => {
    for (const r of [
      { x0: 0, y0: 0, x1: 128, y1: 128 },
      { x0: 3, y0: 127, x1: 9, y1: 128 },
      { x0: 0, y0: 5, x1: 1, y1: 6 },
    ]) {
      expect(rangeFromKey(rangeKey(r))).toEqual(r);
    }
    expect(rangeKey({ x0: 4, y0: 4, x1: 4, y1: 9 })).toBe(-1);
    // The base is tied to the validator's largest grid: every bound 0..MAX_SIZE round-trips.
    expect(RANGE_KEY_BASE).toBe(MAX_SIZE + 1);
    const max = { x0: MAX_SIZE - 1, y0: MAX_SIZE - 1, x1: MAX_SIZE, y1: MAX_SIZE };
    expect(rangeFromKey(rangeKey(max))).toEqual(max);
    expect(Number.isSafeInteger(rangeKey(max))).toBe(true);
    expect(rangeSize(rangeFromKey(-1))).toBe(0);
  });

  it('is empty when the grid is off screen', () => {
    const r = visibleRange({ scale: 10, tx: 1000, ty: 0 }, grid, view);
    expect(rangeSize(r)).toBe(0);
  });

  it('never exceeds the glyph buffer bound once numbers are shown', () => {
    const big = { width: 128, height: 128 };
    const phone = { width: 390, height: 700 };
    const threshold = numberThreshold(false);
    const cap = maxVisibleCells(phone, threshold, big);
    for (let tx = 0; tx > -1500; tx -= 37) {
      for (const scale of [threshold, threshold + 0.3, 20, 48]) {
        expect(rangeSize(visibleRange({ scale, tx, ty: tx / 2 }, big, phone))).toBeLessThanOrEqual(cap);
      }
    }
  });
});

describe('zoom', () => {
  it('keeps the focal point fixed', () => {
    const v: Viewport = { scale: 10, tx: 15, ty: -40 };
    const before = screenToWorld(120, 300, v);
    const next = zoomAt(v, 27, 120, 300);
    expect(next.scale).toBe(27);
    const after = screenToWorld(120, 300, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('uses a higher threshold in large-numbers mode', () => {
    expect(numberThreshold(false)).toBe(14);
    expect(numberThreshold(true)).toBe(18);
  });

  it('double tap zooms in around the point, then back out to the fit', () => {
    const big = { width: 128, height: 128 };
    const phone = { width: 384, height: 700 };
    const bounds = scaleBounds(big, phone);
    const fitted = fitViewport(big, phone);
    const zoomed = doubleTapViewport(fitted, 192, 350, big, phone, bounds);
    expect(zoomed.scale).toBeGreaterThanOrEqual(numberThreshold(true));
    const cell = screenToCell(192, 350, fitted, big);
    expect(screenToCell(192, 350, zoomed, big)).toEqual(cell);
    expect(doubleTapViewport(zoomed, 10, 10, big, phone, bounds)).toEqual(fitted);
  });
});

describe('cellsOnLine', () => {
  it('returns every cell between two cells, both included, without gaps', () => {
    expect(cellsOnLine(2, 3, 2, 3)).toEqual([{ col: 2, row: 3 }]);
    expect(cellsOnLine(0, 0, 3, 0).map((c) => c.col)).toEqual([0, 1, 2, 3]);
    const diag = cellsOnLine(5, 5, 0, 2);
    expect(diag[0]).toEqual({ col: 5, row: 5 });
    expect(diag[diag.length - 1]).toEqual({ col: 0, row: 2 });
    for (let i = 1; i < diag.length; i++) {
      expect(Math.abs(diag[i].col - diag[i - 1].col)).toBeLessThanOrEqual(1);
      expect(Math.abs(diag[i].row - diag[i - 1].row)).toBeLessThanOrEqual(1);
    }
  });
});

describe('focusCellViewport (Find hint)', () => {
  const bounds = scaleBounds(grid, view);

  it.each([
    ['fully zoomed out', fitViewport(grid, view)],
    ['mid zoom elsewhere', { scale: 20, tx: -300, ty: -100 }],
    ['max zoom', { scale: MAX_CELL_PT, tx: 0, ty: 0 }],
  ])('brings the cell into view, readable, from %s', (_name, start: Viewport) => {
    const target = focusCellViewport(start, 20, 9, grid, view, bounds);
    expect(target.scale).toBeGreaterThanOrEqual(Math.min(FOCUS_CELL_PT, bounds.max));
    expect(target.scale).toBeGreaterThanOrEqual(start.scale);
    // The cell is entirely on screen.
    const topLeft = cellToScreen(20, 9, target);
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(0);
    expect(topLeft.x + target.scale).toBeLessThanOrEqual(view.width);
    expect(topLeft.y + target.scale).toBeLessThanOrEqual(view.height);
    expect(clampViewport(target, grid, view, bounds)).toEqual(target);
  });

  it('centers the cell when the pan bounds allow it', () => {
    const target = focusCellViewport(fitViewport(grid, view), 16, 8, grid, view, bounds);
    // Horizontally centered on the cell; vertically the grid (448 pt) is shorter than the view,
    // so it stays centered as a whole.
    expect(viewCenter(target, view)).toEqual({ x: 16.5, y: 8 });
  });

  it('keeps corner cells inside the pan bounds', () => {
    const target = focusCellViewport(fitViewport(grid, view), 0, 0, grid, view, bounds);
    expect(target.tx).toBeLessThanOrEqual(0);
    expect(screenToCell(1, view.height / 2, target, grid)?.col).toBe(0);
  });
});
