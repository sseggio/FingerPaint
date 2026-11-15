/**
 * When the cell numbers (or colorblind symbols) and the fine grid are drawn, depending on the
 * zoom (F17). Every threshold lives here. All functions are worklets (pure, also run in Jest).
 *
 * At the overview (zoom "fit") the artwork is shown without numbers: the grayscale drawing (and
 * the active-color highlight) reads better. Numbers fade in once BOTH:
 * - a cell is at least `NUMBER_MIN_CELL_PT` points wide (`NUMBER_MIN_CELL_PT_LARGE` in
 *   large-numbers mode): readable glyphs;
 * - the zoom is at least `NUMBER_MIN_ZOOM_OVER_FIT` × the fit scale: the user zoomed in past the
 *   overview (a 16×16 artwork fits at ~24 pt per cell on a phone, which alone would pass a
 *   small absolute threshold).
 * The fade runs from `NUMBER_FADE_START` × that scale (opacity 0) to that scale (opacity 1).
 */

/** Numbers are fully shown from this cell size (points). */
export const NUMBER_MIN_CELL_PT = 28;
/** Same in large-numbers mode (bigger glyphs need bigger cells). */
export const NUMBER_MIN_CELL_PT_LARGE = 34;
/** Numbers need a zoom at least this many times the fit scale (no numbers at the overview). */
export const NUMBER_MIN_ZOOM_OVER_FIT = 1.3;
/** The fade-in starts at this fraction of the full-opacity scale. */
export const NUMBER_FADE_START = 0.85;
/** The fine grid starts fading in at this cell size (points)... */
export const GRID_MIN_CELL_PT = 12;
/** ...and is at full strength from this one: always before the numbers start to appear. */
export const GRID_FULL_CELL_PT = 18;

/** Scales (points per cell) between which the numbers fade in. */
export interface NumberZoomRange {
  /** At or below: no numbers (opacity 0, nothing drawn). */
  start: number;
  /** At or above: numbers fully opaque. */
  full: number;
}

/** Absolute cell size (points) from which numbers are fully shown. */
export function numberThreshold(largeNumbers: boolean): number {
  'worklet';
  return largeNumbers ? NUMBER_MIN_CELL_PT_LARGE : NUMBER_MIN_CELL_PT;
}

/**
 * Fade range of the numbers for a grid fitted at `fit` points per cell, with a maximum zoom of
 * `maxScale`. The full-opacity scale never exceeds the maximum zoom (numbers stay reachable on
 * tiny artworks) and the fade never starts below the fit (no numbers at the overview), unless
 * the view cannot zoom at all: then numbers are always shown.
 */
export function numberZoomRange(fit: number, maxScale: number, largeNumbers: boolean): NumberZoomRange {
  'worklet';
  if (maxScale <= fit) return { start: fit, full: fit };
  const full = Math.min(maxScale, Math.max(numberThreshold(largeNumbers), fit * NUMBER_MIN_ZOOM_OVER_FIT));
  const start = Math.min(full, Math.max(fit, full * NUMBER_FADE_START));
  return { start, full };
}

/** Opacity (0..1) of the numbers at `scale` points per cell. */
export function numberOpacity(scale: number, range: NumberZoomRange): number {
  'worklet';
  if (scale >= range.full) return 1;
  if (scale <= range.start) return 0;
  return (scale - range.start) / (range.full - range.start);
}

/** Opacity (0..1, before the theme's max opacity) of the fine grid at `scale` points per cell. */
export function gridVisibility(scale: number): number {
  'worklet';
  if (scale >= GRID_FULL_CELL_PT) return 1;
  if (scale <= GRID_MIN_CELL_PT) return 0;
  return (scale - GRID_MIN_CELL_PT) / (GRID_FULL_CELL_PT - GRID_MIN_CELL_PT);
}
