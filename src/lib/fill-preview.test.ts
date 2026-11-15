import {
  acknowledgeBatch,
  addBatch,
  canClearBatch,
  emptyPreview,
  groupByValue,
  paintedMask,
  previewCells,
  settleBatch,
  showLayer,
} from './fill-preview';

const noStroke = { cells: [] as number[], sent: 0 };

describe('canClearBatch', () => {
  it('keeps a batch until the layer revision that shows it is drawn', () => {
    const batch = { id: 1, cells: [3], shownAt: -1 };
    // Not acknowledged yet: whatever is on screen, it does not contain these cells for sure.
    expect(canClearBatch(batch, 0)).toBe(false);
    expect(canClearBatch(batch, 99)).toBe(false);
    batch.shownAt = 4;
    expect(canClearBatch(batch, 3)).toBe(false);
    expect(canClearBatch(batch, 4)).toBe(true);
    expect(canClearBatch(batch, 5)).toBe(true);
    // Nothing left to preview.
    expect(canClearBatch({ id: 2, cells: [], shownAt: -1 }, 0)).toBe(true);
  });
});

describe('preview / color layer sync', () => {
  it('release: the stroke stays previewed until the new layer image is drawn', () => {
    const s = emptyPreview(1);
    const id = addBatch(s, [10, 11, 12]);
    expect(previewCells(s, noStroke)).toEqual([10, 11, 12]);
    // The old image is drawn again (e.g. an unrelated revision): still previewed.
    showLayer(s, 1);
    expect(previewCells(s, noStroke)).toEqual([10, 11, 12]);
    // JS painted them: shown from revision 2 on.
    acknowledgeBatch(s, id, [], 2);
    expect(previewCells(s, noStroke)).toEqual([10, 11, 12]);
    showLayer(s, 2);
    expect(previewCells(s, noStroke)).toEqual([]);
  });

  it('a layer drawn before the acknowledgment does not clear the batch', () => {
    const s = emptyPreview(1);
    const id = addBatch(s, [5]);
    showLayer(s, 2);
    expect(previewCells(s, noStroke)).toEqual([5]);
    // The batch is in revision 3 (revision 2 was built before it was painted).
    acknowledgeBatch(s, id, [], 3);
    expect(previewCells(s, noStroke)).toEqual([5]);
    showLayer(s, 3);
    expect(previewCells(s, noStroke)).toEqual([]);
  });

  it('a batch that painted nothing new leaves as soon as it is acknowledged', () => {
    const s = emptyPreview(4);
    const id = addBatch(s, [7]);
    acknowledgeBatch(s, id, [], 4);
    expect(s.batches).toEqual([]);
  });

  it('rejected cells leave the preview right away, the others wait for their layer', () => {
    const s = emptyPreview(0);
    const id = addBatch(s, [1, 2, 3]);
    acknowledgeBatch(s, id, [2], 1);
    expect(previewCells(s, noStroke)).toEqual([1, 3]);
    showLayer(s, 1);
    expect(previewCells(s, noStroke)).toEqual([]);
  });

  it('long stroke: intermediate batches and the unsent cells are all previewed until shown', () => {
    const s = emptyPreview(0);
    const stroke = { cells: [1, 2, 3, 4, 5], sent: 3 };
    const first = addBatch(s, stroke.cells.slice(0, 3));
    expect(previewCells(s, stroke)).toEqual([1, 2, 3, 4, 5]);
    acknowledgeBatch(s, first, [], 1);
    // Second batch sent on release before the first one is drawn.
    const second = addBatch(s, [4, 5]);
    stroke.sent = 5;
    expect(previewCells(s, stroke)).toEqual([1, 2, 3, 4, 5]);
    showLayer(s, 1);
    expect(previewCells(s, stroke)).toEqual([4, 5]);
    acknowledgeBatch(s, second, [], 2);
    showLayer(s, 2);
    expect(previewCells(s, stroke)).toEqual([]);
  });

  it('ignores unknown ids, never moves the drawn revision back, ids keep increasing', () => {
    const s = emptyPreview(3);
    const a = addBatch(s, [1]);
    acknowledgeBatch(s, a + 10, [1], 0);
    expect(previewCells(s, noStroke)).toEqual([1]);
    showLayer(s, 2);
    expect(s.layer).toBe(3);
    expect(addBatch(s, [])).toBeGreaterThan(a);
    expect(s.batches).toHaveLength(1);
  });
});

describe('groupByValue', () => {
  it('groups previewed cells by their target value (empty cells skipped)', () => {
    expect(groupByValue([0, 1, 2, 3], [2, 0, 2, 1])).toEqual({ 1: [3], 2: [0, 2] });
  });
});

describe('settleBatch', () => {
  const pixels = new Uint8Array(4 * 4);
  pixels[0 * 4 + 3] = 255;
  pixels[2 * 4 + 3] = 255;

  it('reads which cells are painted in the color layer buffer', () => {
    expect(paintedMask(pixels, [0, 1, 2, 3])).toEqual([true, false, true, false]);
  });

  it('newly painted cells are shown by the next revision, unpainted ones are rejected', () => {
    expect(settleBatch([0, 1, 2], [false, false, true], [true, false, true], 5)).toEqual({ rejected: [1], shownAt: 6 });
  });

  it('nothing newly painted: shown by the current revision already', () => {
    expect(settleBatch([0, 1], [true, false], [true, false], 5)).toEqual({ rejected: [1], shownAt: 5 });
  });
});
