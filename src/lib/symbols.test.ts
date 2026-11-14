import { SYMBOLS } from './artwork/palette';
import { MAX_COLORS } from './artwork/types';
import { shapePolygon, SYMBOL_SHAPES, SYMBOL_SPECS, symbolSpec } from './symbols';

describe('colorblind symbols', () => {
  it('provides 40 distinct symbols, one per palette slot', () => {
    expect(SYMBOL_SPECS).toHaveLength(40);
    expect(MAX_COLORS).toBeLessThanOrEqual(SYMBOL_SPECS.length);
    expect(new Set(SYMBOL_SPECS.map((s) => s.id)).size).toBe(40);
    // Distinct drawings, not just distinct names: every (shape, style) pair is used once.
    expect(new Set(SYMBOL_SPECS.map((s) => `${s.shape}/${s.style}`)).size).toBe(40);
    expect(SYMBOLS).toEqual(SYMBOL_SPECS.map((s) => s.id));
  });

  it('starts with the solid shapes (the most distinguishable)', () => {
    expect(SYMBOL_SPECS.slice(0, SYMBOL_SHAPES.length).every((s) => s.style === 'solid')).toBe(true);
  });

  it('resolves ids back to their spec', () => {
    for (const spec of SYMBOL_SPECS) expect(symbolSpec(spec.id)).toBe(spec);
    expect(symbolSpec('nope')).toBeUndefined();
  });

  it('gives every shape a distinct contour inside the unit box', () => {
    const signatures = new Set<string>();
    for (const shape of SYMBOL_SHAPES) {
      const polygon = shapePolygon(shape);
      if (polygon === null) {
        expect(shape).toBe('circle');
        signatures.add('circle');
        continue;
      }
      expect(polygon.length).toBeGreaterThanOrEqual(3);
      for (const p of polygon) {
        expect(p.x).toBeGreaterThanOrEqual(-0.01);
        expect(p.x).toBeLessThanOrEqual(1.01);
        expect(p.y).toBeGreaterThanOrEqual(-0.01);
        expect(p.y).toBeLessThanOrEqual(1.01);
      }
      signatures.add(polygon.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));
    }
    expect(signatures.size).toBe(SYMBOL_SHAPES.length);
  });
});
