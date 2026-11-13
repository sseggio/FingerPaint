import { backgroundGray, deltaE76, isHexColor, luminance, rgbToLab } from './color';
import { buildPalette, SYMBOLS } from './palette';
import { MAX_COLORS } from './types';

describe('artwork color helpers', () => {
  it('converts sRGB to Lab', () => {
    const [l, a, b] = rgbToLab([255, 255, 255]);
    expect(l).toBeCloseTo(100, 1);
    expect(a).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 5);
    // Reference value for pure red: L*53.24 a*80.09 b*67.20
    const red = rgbToLab([255, 0, 0]);
    expect(red[0]).toBeCloseTo(53.24, 1);
    expect(red[1]).toBeCloseTo(80.09, 0);
    expect(red[2]).toBeCloseTo(67.2, 0);
  });

  it('computes ΔE76', () => {
    expect(deltaE76('#FFFFFF', '#000000')).toBeCloseTo(100, 1);
    expect(deltaE76('#FF3D7F', '#FF3D7F')).toBe(0);
    expect(deltaE76('#808080', '#828282')).toBeLessThan(10);
  });

  it('computes luminance and background gray', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBe(0);
    expect(backgroundGray('#000000')).toBe(150);
    expect(backgroundGray('#FFFFFF')).toBe(245);
  });

  it('only accepts #RRGGBB in artwork files', () => {
    expect(isHexColor('#A1b2C3')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('A1B2C3')).toBe(false);
    expect(isHexColor(42)).toBe(false);
  });

  it('numbers colors from 1 with unique symbols', () => {
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(MAX_COLORS);
    const palette = buildPalette(['#FF0000', '#00FF00', '#0000FF']);
    expect(palette.colors.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(new Set(palette.colors.map((c) => c.symbol)).size).toBe(3);
    expect(palette.colors[2].rgb).toEqual([0, 0, 255]);
  });
});
