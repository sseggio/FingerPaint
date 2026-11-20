import { MAX_SIZE } from './artwork/types';
import { fitScale, MAX_CELL_PT, maxVisibleCells, scaleBounds } from './geometry';
import {
  GRID_FULL_CELL_PT,
  GRID_MIN_CELL_PT,
  gridVisibility,
  NUMBER_FADE_START,
  NUMBER_MIN_CELL_PT,
  NUMBER_MIN_CELL_PT_LARGE,
  NUMBER_MIN_ZOOM_OVER_FIT,
  numberOpacity,
  numberThreshold,
  numberZoomRange,
} from './number-visibility';

const phone = { width: 390, height: 700 };
const PADDING = 12;

function rangeFor(art: { width: number; height: number }, large = false) {
  const bounds = scaleBounds(art, phone, PADDING);
  return { fit: bounds.min, range: numberZoomRange(bounds.min, bounds.max, large) };
}

describe('number visibility (F17)', () => {
  it('uses one absolute threshold per mode', () => {
    expect(numberThreshold(false)).toBe(NUMBER_MIN_CELL_PT);
    expect(numberThreshold(true)).toBe(NUMBER_MIN_CELL_PT_LARGE);
    expect(NUMBER_MIN_CELL_PT_LARGE).toBeGreaterThan(NUMBER_MIN_CELL_PT);
  });

  it('shows no numbers at the overview of a small artwork (16×16 fits at ~24 pt per cell)', () => {
    const { fit, range } = rangeFor({ width: 16, height: 16 });
    expect(fit).toBeGreaterThan(20);
    expect(numberOpacity(fit, range)).toBe(0);
    // Needs both the absolute size and a zoom past the overview.
    expect(range.full).toBeCloseTo(Math.max(NUMBER_MIN_CELL_PT, fit * NUMBER_MIN_ZOOM_OVER_FIT));
  });

  it('shows no numbers at the overview of a big artwork', () => {
    const { fit, range } = rangeFor({ width: 128, height: 128 });
    expect(numberOpacity(fit, range)).toBe(0);
    expect(range.full).toBe(NUMBER_MIN_CELL_PT);
  });

  it('shows the numbers fully once zoomed in far enough', () => {
    for (const art of [
      { width: 16, height: 16 },
      { width: 64, height: 48 },
      { width: 128, height: 128 },
    ]) {
      for (const large of [false, true]) {
        const { range } = rangeFor(art, large);
        expect(numberOpacity(MAX_CELL_PT, range)).toBe(1);
        expect(numberOpacity(range.full, range)).toBe(1);
      }
    }
  });

  it('fades in smoothly between threshold × 0.85 and the threshold', () => {
    const { range } = rangeFor({ width: 128, height: 128 });
    expect(range.start).toBeCloseTo(NUMBER_MIN_CELL_PT * NUMBER_FADE_START);
    expect(numberOpacity(range.start, range)).toBe(0);
    const mid = (range.start + range.full) / 2;
    expect(numberOpacity(mid, range)).toBeCloseTo(0.5);
    let previous = 0;
    for (let s = range.start; s <= range.full; s += 0.25) {
      const o = numberOpacity(s, range);
      expect(o).toBeGreaterThanOrEqual(previous);
      previous = o;
    }
  });

  it('needs bigger cells in large-numbers mode', () => {
    const art = { width: 128, height: 128 };
    const normal = rangeFor(art).range;
    const large = rangeFor(art, true).range;
    expect(large.full).toBe(NUMBER_MIN_CELL_PT_LARGE);
    expect(numberOpacity(30, normal)).toBe(1);
    expect(numberOpacity(30, large)).toBeLessThan(1);
    expect(numberOpacity(25, large)).toBe(0);
  });

  it('keeps the numbers reachable on tiny artworks (full opacity at the max zoom at worst)', () => {
    const art = { width: 8, height: 8 };
    const fit = fitScale(art, phone, PADDING);
    const { range } = rangeFor(art, true);
    expect(range.full).toBe(MAX_CELL_PT);
    expect(range.start).toBeGreaterThanOrEqual(fit);
    expect(numberOpacity(fit, range)).toBe(0);
    expect(numberOpacity(MAX_CELL_PT, range)).toBe(1);
  });

  it('always shows the numbers when the view cannot zoom at all', () => {
    const range = numberZoomRange(60, 60, false);
    expect(numberOpacity(60, range)).toBe(1);
  });

  it('fades the grid in before the numbers start to appear', () => {
    expect(gridVisibility(GRID_MIN_CELL_PT)).toBe(0);
    expect(gridVisibility(GRID_FULL_CELL_PT)).toBe(1);
    expect(gridVisibility((GRID_MIN_CELL_PT + GRID_FULL_CELL_PT) / 2)).toBeCloseTo(0.5);
    const { range } = rangeFor({ width: 128, height: 128 });
    expect(GRID_FULL_CELL_PT).toBeLessThanOrEqual(range.start);
  });

  it('handles a 256×256 artwork (F33): sharp overview, readable numbers once zoomed in', () => {
    const art = { width: MAX_SIZE, height: MAX_SIZE };
    const bounds = scaleBounds(art, phone, PADDING);
    // The overview shows the whole grid (~1.5 pt per cell), the max zoom is unchanged in points.
    expect(bounds.min).toBeCloseTo((phone.width - 2 * PADDING) / MAX_SIZE);
    expect(bounds.max).toBe(MAX_CELL_PT);
    // So the zoom factor reaches ~33×: well past the numbers threshold.
    expect(bounds.max / bounds.min).toBeGreaterThan(30);
    for (const large of [false, true]) {
      const { fit, range } = rangeFor(art, large);
      expect(numberOpacity(fit, range)).toBe(0);
      expect(range.full).toBe(numberThreshold(large));
      expect(range.full).toBeLessThan(bounds.max);
      expect(numberOpacity(MAX_CELL_PT, range)).toBe(1);
      // The glyph buffer is sized by the visible cells at the fade start, never by w×h.
      const capacity = maxVisibleCells(phone, range.start, art);
      expect(capacity).toBeLessThan(1000);
      expect(capacity).toBeLessThan(MAX_SIZE * MAX_SIZE);
    }
    expect(gridVisibility(bounds.min)).toBe(0);
  });
});
