/**
 * Colorblind-mode symbols: 40 vector shapes (10 outlines × 4 fill styles), drawn by Skia in the
 * canvas atlas and in the palette swatches. Vector shapes render identically on every device,
 * unlike Unicode symbols (missing glyphs, emoji presentation). Pure: geometry only, no Skia.
 */

export const SYMBOL_SHAPES = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'star',
  'plus',
  'cross',
  'hexagon',
  'triangle-down',
  'pentagon',
] as const;
export type SymbolShape = (typeof SYMBOL_SHAPES)[number];

/** solid: filled; outline: contour only; dot: contour + center dot; half: contour + left half filled. */
export const SYMBOL_STYLES = ['solid', 'outline', 'dot', 'half'] as const;
export type SymbolStyle = (typeof SYMBOL_STYLES)[number];

export interface SymbolSpec {
  id: string;
  shape: SymbolShape;
  style: SymbolStyle;
}

/** The 40 symbols in palette order: every solid shape first (the most distinct), then outlines… */
export const SYMBOL_SPECS: readonly SymbolSpec[] = SYMBOL_STYLES.flatMap((style) =>
  SYMBOL_SHAPES.map((shape) => ({ id: style === 'solid' ? shape : `${shape}-${style}`, shape, style })),
);

const SPEC_BY_ID = new Map(SYMBOL_SPECS.map((s) => [s.id, s]));

export function symbolSpec(id: string): SymbolSpec | undefined {
  return SPEC_BY_ID.get(id);
}

export interface Point {
  x: number;
  y: number;
}

function regular(sides: number, rotation: number, radius = 0.5): Point[] {
  return Array.from({ length: sides }, (_, k) => {
    const a = rotation + (k * 2 * Math.PI) / sides;
    return { x: 0.5 + radius * Math.cos(a), y: 0.5 + radius * Math.sin(a) };
  });
}

function star(points: number, outer: number, inner: number): Point[] {
  return Array.from({ length: points * 2 }, (_, k) => {
    const r = k % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (k * Math.PI) / points;
    return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) };
  });
}

/** 12-point "plus" polygon with arms `w` wide (unit box). */
function plus(w: number): Point[] {
  const a = 0.5 - w / 2;
  const b = 0.5 + w / 2;
  return [
    { x: a, y: 0 }, { x: b, y: 0 }, { x: b, y: a }, { x: 1, y: a }, { x: 1, y: b }, { x: b, y: b },
    { x: b, y: 1 }, { x: a, y: 1 }, { x: a, y: b }, { x: 0, y: b }, { x: 0, y: a }, { x: a, y: a },
  ];
}

function rotate45(points: Point[]): Point[] {
  const c = Math.SQRT1_2;
  return points.map(({ x, y }) => {
    const dx = (x - 0.5) * 0.86;
    const dy = (y - 0.5) * 0.86;
    return { x: 0.5 + dx * c - dy * c, y: 0.5 + dx * c + dy * c };
  });
}

/**
 * Contour of a shape in the unit box [0, 1]² (y down), or null for the circle (drawn as an oval).
 * Polygons are visually centered and fill most of the box.
 */
export function shapePolygon(shape: SymbolShape): Point[] | null {
  switch (shape) {
    case 'circle':
      return null;
    case 'square':
      return [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }];
    case 'triangle':
      return [{ x: 0.5, y: 0.04 }, { x: 0.98, y: 0.9 }, { x: 0.02, y: 0.9 }];
    case 'triangle-down':
      return [{ x: 0.02, y: 0.1 }, { x: 0.98, y: 0.1 }, { x: 0.5, y: 0.96 }];
    case 'diamond':
      return [{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }];
    case 'star':
      return star(5, 0.52, 0.22).map(({ x, y }) => ({ x, y: y + 0.04 }));
    case 'plus':
      return plus(0.34);
    case 'cross':
      return rotate45(plus(0.34));
    case 'hexagon':
      return regular(6, 0);
    case 'pentagon':
      return regular(5, -Math.PI / 2).map(({ x, y }) => ({ x, y: y + 0.05 }));
  }
}
