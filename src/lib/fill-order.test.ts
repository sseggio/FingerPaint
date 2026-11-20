import { MAX_SIZE } from './artwork/types';
import { createBitset, encodeBase64, setBit } from './bitset';
import {
  appendFillJournal,
  completeReplayOrder,
  createFillJournal,
  decodeFillOrder,
  encodeFillOrder,
  isFillOrderConsistent,
  journalCells,
  MAX_FILL_ORDER_CELLS,
} from './fill-order';

function bitsWith(cellCount: number, cells: number[]): Uint8Array {
  const bits = createBitset(cellCount);
  for (const i of cells) setBit(bits, i);
  return bits;
}

describe('fill journal', () => {
  it('appends cells in order, never past its capacity', () => {
    const journal = createFillJournal(4);
    appendFillJournal(journal, [2, 0]);
    appendFillJournal(journal, [3]);
    expect(Array.from(journalCells(journal))).toEqual([2, 0, 3]);
    appendFillJournal(journal, [1, 1, 1]);
    expect(journal.length).toBe(4);
    expect(Array.from(journalCells(journal))).toEqual([2, 0, 3, 1]);
  });

  it('starts from a restored order and refuses grids beyond 16-bit indices', () => {
    expect(Array.from(journalCells(createFillJournal(5, [4, 1])))).toEqual([4, 1]);
    expect(() => createFillJournal(MAX_FILL_ORDER_CELLS + 1)).toThrow(RangeError);
    expect(() => createFillJournal(-1)).toThrow(RangeError);
    expect(createFillJournal(128 * 128).cells.length).toBe(16_384);
  });

  it('indexes a full 256×256 grid (65 536 cells, the Uint16 range exactly) (F33)', () => {
    const n = MAX_SIZE * MAX_SIZE;
    expect(n).toBe(MAX_FILL_ORDER_CELLS);
    const order = Array.from({ length: n }, (_, k) => n - 1 - k);
    const journal = createFillJournal(n, order);
    expect(journal.length).toBe(n);
    expect(journal.cells[0]).toBe(65_535);
    expect(journal.cells[n - 1]).toBe(0);
    const bits = createBitset(n).fill(255);
    const decoded = decodeFillOrder(encodeFillOrder(journal), bits, n);
    expect(decoded).not.toBeNull();
    expect(decoded?.length).toBe(n);
    expect(decoded?.[0]).toBe(65_535);
    expect(decoded?.[n - 1]).toBe(0);
    // One entry more than the grid: refused.
    expect(decodeFillOrder(encodeFillOrder(Uint16Array.from([...order, 0])), bits, n)).toBeNull();
    expect(decodeFillOrder(encodeFillOrder(journal), bits, n + 1)).toBeNull();
  });
});

describe('encode / decode', () => {
  it('round-trips through little-endian Uint16 base64', () => {
    const cells = [16_383, 0, 256, 1, 255];
    const bits = bitsWith(16_384, cells);
    const journal = createFillJournal(16_384, cells);
    const text = encodeFillOrder(journal);
    expect(text).toBe(encodeBase64(Uint8Array.from([255, 63, 0, 0, 0, 1, 1, 0, 255, 0])));
    expect(Array.from(decodeFillOrder(text, bits, 16_384) ?? [])).toEqual(cells);
    expect(encodeFillOrder(Uint16Array.from(cells))).toBe(text);
  });

  it('accepts an empty or partial journal (cells filled before it existed)', () => {
    const bits = bitsWith(10, [1, 2, 3]);
    expect(Array.from(decodeFillOrder('', bits, 10) ?? [9])).toEqual([]);
    expect(Array.from(decodeFillOrder(encodeFillOrder(Uint16Array.from([3])), bits, 10) ?? [])).toEqual([3]);
  });

  it.each([
    ['not a string', 42],
    ['malformed base64', 'abc'],
    ['odd byte count', encodeBase64(Uint8Array.from([1, 0, 2]))],
    ['index outside the grid', encodeFillOrder(Uint16Array.from([1, 10]))],
    ['duplicate', encodeFillOrder(Uint16Array.from([1, 2, 1]))],
    ['cell not filled in the bitset', encodeFillOrder(Uint16Array.from([1, 4]))],
    ['more entries than cells', encodeFillOrder(new Uint16Array(11))],
  ])('rejects %s', (_name, input) => {
    expect(decodeFillOrder(input, bitsWith(10, [1, 2, 3]), 10)).toBeNull();
  });
});

describe('isFillOrderConsistent', () => {
  const cells = [1, 0, 2, 2];
  it('checks grid, empty cells, bitset and duplicates', () => {
    const bits = bitsWith(4, [0, 1, 2]);
    expect(isFillOrderConsistent([2, 0], cells, bits)).toBe(true);
    expect(isFillOrderConsistent([1], cells, bits)).toBe(false); // empty cell
    expect(isFillOrderConsistent([3], cells, bits)).toBe(false); // not filled
    expect(isFillOrderConsistent([0, 0], cells, bits)).toBe(false);
    expect(isFillOrderConsistent([4], cells, bits)).toBe(false);
    expect(isFillOrderConsistent([0.5], cells, bits)).toBe(false);
  });
});

describe('completeReplayOrder', () => {
  // 3×3: values by cell, 0 = empty.
  const cells = [2, 1, 0, 1, 2, 3, 0, 3, 1];

  it('replays the journal as recorded when it is complete', () => {
    const journal = [8, 4, 0, 1, 3, 5, 7];
    expect(Array.from(completeReplayOrder(cells, journal))).toEqual(journal);
  });

  it('without journal: color by color, row by row within a color', () => {
    expect(Array.from(completeReplayOrder(cells, []))).toEqual([1, 3, 8, 0, 4, 5, 7]);
  });

  it('puts the cells missing from the journal first (they were filled before it)', () => {
    expect(Array.from(completeReplayOrder(cells, [7, 0]))).toEqual([1, 3, 8, 4, 5, 7, 0]);
  });

  it('always yields each non-empty cell exactly once, skipping bad journal entries', () => {
    const order = Array.from(completeReplayOrder(cells, [2, 0, 0, 99, -1, 5]));
    expect(order.slice(-2)).toEqual([0, 5]);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 3, 4, 5, 7, 8]);
  });
});
