/**
 * Pure viewport math for the coloring canvas. All functions are worklets so the gesture
 * handlers can call them on the UI runtime; they run unchanged in Jest / on the JS runtime.
 *
 * Model: a cell (col, row) covers world units [col, col + 1) × [row, row + 1). The viewport maps
 * world → screen with `screen = world * scale + t` (scale = points per cell).
 */

import { MAX_SIZE } from '@/lib/artwork/types';

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  /** Points per cell. */
  scale: number;
  tx: number;
  ty: number;
}

export interface ScaleBounds {
  min: number;
  max: number;
}

export interface Cell {
  col: number;
  row: number;
}

/** Half-open cell range [x0, x1) × [y0, y1); empty when x0 >= x1 or y0 >= y1. */
export interface CellRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Largest zoom: one cell is this many points wide. */
export const MAX_CELL_PT = 48;
/** Numbers appear from this cell size (points). */
export const NUMBER_MIN_CELL_PT = 14;
/** Same threshold in large-numbers mode. */
export const NUMBER_MIN_CELL_PT_LARGE = 18;
/** Grid lines appear from this cell size (points). */
export const GRID_MIN_CELL_PT = 8;
/** Cell size a double tap zooms to (at least), comfortably above the numbers threshold. */
export const DOUBLE_TAP_CELL_PT = 26;

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return value < min ? min : value > max ? max : value;
}

/** Scale at which the whole grid fits in the view (minus `padding` on each side). */
export function fitScale(grid: Size, view: Size, padding = 0): number {
  'worklet';
  const w = Math.max(1, view.width - padding * 2);
  const h = Math.max(1, view.height - padding * 2);
  return Math.min(w / grid.width, h / grid.height);
}

/** Zoom range: from "whole grid visible" to MAX_CELL_PT per cell (never below the fit). */
export function scaleBounds(grid: Size, view: Size, padding = 0, maxCellPt = MAX_CELL_PT): ScaleBounds {
  'worklet';
  const min = fitScale(grid, view, padding);
  return { min, max: Math.max(min, maxCellPt) };
}

/**
 * Bounds one translation axis: content smaller than the view is centered, larger content
 * cannot leave a gap at either edge.
 */
export function clampTranslation(t: number, contentSize: number, viewSize: number): number {
  'worklet';
  if (contentSize <= viewSize) return (viewSize - contentSize) / 2;
  return clamp(t, viewSize - contentSize, 0);
}

/** Clamps scale into `bounds` and translation so the grid stays in view. */
export function clampViewport(v: Viewport, grid: Size, view: Size, bounds: ScaleBounds): Viewport {
  'worklet';
  const scale = clamp(v.scale, bounds.min, bounds.max);
  return {
    scale,
    tx: clampTranslation(v.tx, grid.width * scale, view.width),
    ty: clampTranslation(v.ty, grid.height * scale, view.height),
  };
}

/** Whole grid visible and centered. */
export function fitViewport(grid: Size, view: Size, padding = 0): Viewport {
  'worklet';
  const scale = fitScale(grid, view, padding);
  return {
    scale,
    tx: (view.width - grid.width * scale) / 2,
    ty: (view.height - grid.height * scale) / 2,
  };
}

/** Scales by `nextScale / v.scale` around the screen point (fx, fy), which stays fixed. */
export function zoomAt(v: Viewport, nextScale: number, fx: number, fy: number): Viewport {
  'worklet';
  const k = nextScale / v.scale;
  return { scale: nextScale, tx: fx - (fx - v.tx) * k, ty: fy - (fy - v.ty) * k };
}

export function screenToWorld(x: number, y: number, v: Viewport): { x: number; y: number } {
  'worklet';
  return { x: (x - v.tx) / v.scale, y: (y - v.ty) / v.scale };
}

export function worldToScreen(x: number, y: number, v: Viewport): { x: number; y: number } {
  'worklet';
  return { x: x * v.scale + v.tx, y: y * v.scale + v.ty };
}

/** Cell under a screen point, or null outside the grid. */
export function screenToCell(x: number, y: number, v: Viewport, grid: Size): Cell | null {
  'worklet';
  const col = Math.floor((x - v.tx) / v.scale);
  const row = Math.floor((y - v.ty) / v.scale);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
  return { col, row };
}

/** Top-left screen corner of a cell. */
export function cellToScreen(col: number, row: number, v: Viewport): { x: number; y: number } {
  'worklet';
  return worldToScreen(col, row, v);
}

/** Cells at least partially visible in the view, clamped to the grid. */
export function visibleRange(v: Viewport, grid: Size, view: Size): CellRange {
  'worklet';
  const x0 = Math.max(0, Math.floor(-v.tx / v.scale));
  const y0 = Math.max(0, Math.floor(-v.ty / v.scale));
  const x1 = Math.min(grid.width, Math.ceil((view.width - v.tx) / v.scale));
  const y1 = Math.min(grid.height, Math.ceil((view.height - v.ty) / v.scale));
  return { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

export function rangeSize(r: CellRange): number {
  'worklet';
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
}

/** Cell size from which numbers are drawn. */
export function numberThreshold(largeNumbers: boolean): number {
  'worklet';
  return largeNumbers ? NUMBER_MIN_CELL_PT_LARGE : NUMBER_MIN_CELL_PT;
}

/**
 * Upper bound of visible cells once numbers are shown (scale >= threshold): sizes the glyph
 * buffer. A view `n` points wide shows at most ceil(n / threshold) + 1 partial columns.
 */
export function maxVisibleCells(view: Size, threshold: number, grid: Size): number {
  'worklet';
  const cols = Math.min(grid.width, Math.ceil(view.width / threshold) + 1);
  const rows = Math.min(grid.height, Math.ceil(view.height / threshold) + 1);
  return Math.max(0, cols * rows);
}

/**
 * Double tap: zoom in around the tapped point to a readable cell size; when already zoomed in
 * that far, zoom back out to the whole grid.
 */
export function doubleTapViewport(
  v: Viewport,
  fx: number,
  fy: number,
  grid: Size,
  view: Size,
  bounds: ScaleBounds,
): Viewport {
  'worklet';
  const readable = clamp(Math.max(DOUBLE_TAP_CELL_PT, bounds.min * 2), bounds.min, bounds.max);
  if (v.scale >= readable * 0.95) return clampViewport({ scale: bounds.min, tx: 0, ty: 0 }, grid, view, bounds);
  return clampViewport(zoomAt(v, readable, fx, fy), grid, view, bounds);
}

/** Cell size the "Find" hint zooms to (at least): numbers are readable, even in large mode. */
export const FOCUS_CELL_PT = 28;

/** World point (in cells) at the center of the view. */
export function viewCenter(v: Viewport, view: Size): { x: number; y: number } {
  'worklet';
  return screenToWorld(view.width / 2, view.height / 2, v);
}

/**
 * "Find" hint target: the cell (col, row) centered in the view (as far as the pan bounds allow),
 * zoomed in to at least `minCellPt` per cell. A deeper zoom is kept, so it works at any zoom.
 */
export function focusCellViewport(
  v: Viewport,
  col: number,
  row: number,
  grid: Size,
  view: Size,
  bounds: ScaleBounds,
  minCellPt = FOCUS_CELL_PT,
): Viewport {
  'worklet';
  const scale = clamp(Math.max(v.scale, minCellPt), bounds.min, bounds.max);
  return clampViewport(
    { scale, tx: view.width / 2 - (col + 0.5) * scale, ty: view.height / 2 - (row + 0.5) * scale },
    grid,
    view,
    bounds,
  );
}

/**
 * Base for packing range bounds into one number. Bounds go from 0 to the grid size, and the
 * artwork validator caps grids at MAX_SIZE (128), so each bound takes MAX_SIZE + 1 values.
 * Raising MAX_SIZE raises the base with it; the packed key (< base⁴ ≈ 2.8e8 for 128) must stay
 * a safe integer, which holds for any grid up to ~9 000 cells wide.
 */
export const RANGE_KEY_BASE = MAX_SIZE + 1;
if (RANGE_KEY_BASE ** 4 > Number.MAX_SAFE_INTEGER) {
  throw new Error('geometry: MAX_SIZE too large for rangeKey packing');
}

/** An empty range. */
export const EMPTY_RANGE: CellRange = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * Packs a range into one number (empty ranges → -1) so a reaction on the UI thread can detect
 * a change with `!==` and only then rebuild the glyph buffers.
 */
export function rangeKey(r: CellRange): number {
  'worklet';
  if (rangeSize(r) === 0) return -1;
  const b = RANGE_KEY_BASE;
  return r.x0 + b * (r.y0 + b * (r.x1 + b * r.y1));
}

export function rangeFromKey(key: number): CellRange {
  'worklet';
  if (key < 0) return EMPTY_RANGE;
  const b = RANGE_KEY_BASE;
  const x0 = key % b;
  const y0 = Math.floor(key / b) % b;
  const x1 = Math.floor(key / (b * b)) % b;
  const y1 = Math.floor(key / (b * b * b));
  return { x0, y0, x1, y1 };
}

/**
 * Cells crossed by the segment between two cells (both included), in order, without gaps
 * (Bresenham). Used by drag-to-fill so a fast swipe does not skip cells between two events.
 */
export function cellsOnLine(c0: number, r0: number, c1: number, r1: number): Cell[] {
  'worklet';
  const out: Cell[] = [];
  const dc = Math.abs(c1 - c0);
  const dr = -Math.abs(r1 - r0);
  const sc = c0 < c1 ? 1 : -1;
  const sr = r0 < r1 ? 1 : -1;
  let err = dc + dr;
  let c = c0;
  let r = r0;
  // Bounded loop: at most dc + |dr| + 1 cells.
  for (let guard = dc - dr + 1; guard > 0; guard--) {
    out.push({ col: c, row: r });
    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 >= dr) {
      err += dr;
      c += sc;
    }
    if (e2 <= dc) {
      err += dc;
      r += sr;
    }
  }
  return out;
}
