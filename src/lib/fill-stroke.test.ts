import { DRAG_BATCH_MAX, emptyStroke, pendingCount, strokeTo, takeBatch } from './fill-stroke';

const grid = { width: 64, height: 64 };
/** Every cell has value 1 except column 10 (value 2). */
const cells = Array.from({ length: 64 * 64 }, (_, i) => (i % 64 === 10 ? 2 : 1));

/** Simulates a gesture: one event per point, a batch only when full or at the end. */
function drag(points: [number, number][], active = 1) {
  const s = emptyStroke();
  const batches: number[][] = [];
  for (const [col, row] of points) {
    strokeTo(s, grid, cells, active, col, row);
    if (pendingCount(s) >= DRAG_BATCH_MAX) batches.push(takeBatch(s)!);
  }
  const last = takeBatch(s);
  if (last) batches.push(last);
  return { s, batches };
}

describe('drag-to-fill stroke', () => {
  it('sends a 50-cell drag as a single batch', () => {
    // Columns 11..60 of row 3 (all of the active color), two touch events per cell.
    const points = Array.from({ length: 50 }, (_, i): [number, number] => [11 + i, 3]).flatMap((p) => [p, p]);
    const { batches } = drag(points);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(Array.from({ length: 50 }, (_, i) => 3 * 64 + 11 + i));
  });

  it('collects 50 distinct cells along a long swipe in one batch', () => {
    const points: [number, number][] = [];
    for (let row = 0; row < 50; row++) points.push([20, row]);
    const { batches } = drag(points);
    expect(batches).toEqual([Array.from({ length: 50 }, (_, row) => row * 64 + 20)]);
  });

  it('fills the gap between two distant events', () => {
    const { batches } = drag([
      [12, 5],
      [20, 5],
    ]);
    expect(batches[0]).toEqual(Array.from({ length: 9 }, (_, k) => 5 * 64 + 12 + k));
  });

  it('deduplicates cells crossed twice', () => {
    const { batches } = drag([
      [12, 0],
      [16, 0],
      [12, 0],
    ]);
    expect(batches[0]).toHaveLength(5);
  });

  it('skips cells of other colors and positions outside the grid', () => {
    const { batches } = drag([
      [8, 2],
      [12, 2],
      [-1, 2],
      [70, 2],
    ]);
    expect(batches[0]).toEqual([2 * 64 + 8, 2 * 64 + 9, 2 * 64 + 11, 2 * 64 + 12]);
  });

  it('splits only very long drags', () => {
    const points: [number, number][] = [];
    for (let row = 0; row < 64; row++) points.push([row % 2 === 0 ? 11 : 63, row]);
    const { batches } = drag(points);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.slice(0, -1).every((b) => b.length >= DRAG_BATCH_MAX)).toBe(true);
  });

  it('collects nothing without an active color', () => {
    expect(drag([[1, 1], [5, 1]], 0).batches).toEqual([]);
  });
});
