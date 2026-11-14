import { createBitset, setBit } from './bitset';
import { findNearestUnfilledCell, remainingCells, type HintSource } from './hints';

/** 4×3 grid: color 1 on the corners and the center row, color 2 elsewhere, one empty cell. */
function source(): HintSource & { cells: number[] } {
  // prettier-ignore
  const cells = [
    1, 2, 2, 1,
    1, 1, 0, 1,
    1, 2, 2, 1,
  ];
  return { width: 4, height: 3, cells, filled: createBitset(cells.length) };
}

describe('findNearestUnfilledCell', () => {
  it('returns the unfilled cell of the color closest to the given point', () => {
    const s = source();
    expect(findNearestUnfilledCell(s, 0, 0.5, 0.5)).toBe(0);
    expect(findNearestUnfilledCell(s, 0, 3.9, 2.9)).toBe(11);
    expect(findNearestUnfilledCell(s, 1, 3, 0)).toBe(2);
  });

  it('skips filled cells and cells of other colors', () => {
    const s = source();
    setBit(s.filled, 5);
    // Next to cell 6 (empty): cell 5 (1,1) is filled, so cell 7 is the closest.
    const next = findNearestUnfilledCell(s, 0, 2.5, 1.5);
    expect(next).not.toBe(5);
    expect(s.cells[next!]).toBe(1);
    expect(next).toBe(7);
  });

  it('breaks ties in row-major order', () => {
    const s = source();
    // (2.5, 1.5) is equidistant from cells 5 and 7: the first one wins.
    expect(findNearestUnfilledCell(s, 0, 2.5, 1.5)).toBe(5);
  });

  it('returns null when nothing is left for the color', () => {
    const s = source();
    s.cells.forEach((v, i) => {
      if (v === 2) setBit(s.filled, i);
    });
    expect(findNearestUnfilledCell(s, 1, 2, 1.5)).toBeNull();
    expect(remainingCells(s, 1)).toBe(0);
    expect(remainingCells(s, 0)).toBe(7);
    // Unknown color: nothing to find.
    expect(findNearestUnfilledCell(s, 9, 0, 0)).toBeNull();
  });

  it('works with points outside the grid (view centered off the artwork)', () => {
    expect(findNearestUnfilledCell(source(), 1, -100, -100)).toBe(1);
    expect(findNearestUnfilledCell(source(), 1, 100, 100)).toBe(10);
  });
});
