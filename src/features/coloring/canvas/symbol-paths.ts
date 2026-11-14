import { PathOp, Skia, type SkPath } from '@shopify/react-native-skia';

import { shapePolygon, symbolSpec, type SymbolSpec } from '@/lib/symbols';

/** Contour thickness of the outline styles, relative to the symbol box. */
export const SYMBOL_STROKE_RATIO = 0.13;

export interface SymbolPaths {
  /** Filled areas. */
  fill: SkPath | null;
  /** Contour, stroked with `strokeWidth` (outline, dot and half styles). */
  stroke: SkPath | null;
  strokeWidth: number;
}

function contourPath(spec: SymbolSpec, x: number, y: number, size: number): SkPath {
  const builder = Skia.PathBuilder.Make();
  const polygon = shapePolygon(spec.shape);
  if (polygon === null) builder.addCircle(x + size / 2, y + size / 2, size / 2);
  else builder.addPoly(polygon.map((p) => ({ x: x + p.x * size, y: y + p.y * size })), true);
  return builder.detach();
}

/** Visual center of a shape (vertex mean; the box center for the circle). */
function center(spec: SymbolSpec, x: number, y: number, size: number) {
  const polygon = shapePolygon(spec.shape);
  if (!polygon) return { x: x + size / 2, y: y + size / 2 };
  const mean = polygon.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: x + (mean.x / polygon.length) * size, y: y + (mean.y / polygon.length) * size };
}

/**
 * Skia paths of a colorblind symbol in the box (x, y, size). Strokes are inset so the symbol
 * never exceeds its box. Returns null for an unknown id.
 */
export function buildSymbolPaths(id: string, x: number, y: number, size: number): SymbolPaths | null {
  const spec = symbolSpec(id);
  if (!spec) return null;
  if (spec.style === 'solid') return { fill: contourPath(spec, x, y, size), stroke: null, strokeWidth: 0 };

  const strokeWidth = size * SYMBOL_STROKE_RATIO;
  const inset = strokeWidth / 2;
  const contour = contourPath(spec, x + inset, y + inset, size - strokeWidth);
  if (spec.style === 'outline') return { fill: null, stroke: contour, strokeWidth };
  if (spec.style === 'dot') {
    const c = center(spec, x, y, size);
    const dot = Skia.PathBuilder.Make().addCircle(c.x, c.y, size * 0.15).detach();
    return { fill: dot, stroke: contour, strokeWidth };
  }
  // half: left half filled.
  const left = Skia.PathBuilder.Make().addRect(Skia.XYWHRect(x, y, size / 2, size)).detach();
  return { fill: Skia.Path.MakeFromOp(contour, left, PathOp.Intersect), stroke: contour, strokeWidth };
}
