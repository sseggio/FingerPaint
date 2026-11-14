import { EXPORT_MAX_SIDE, exportScale, exportSize } from './export-scale';

describe('exportScale', () => {
  it.each([
    [8, 8, 32],
    [16, 16, 32],
    [64, 64, 32],
    [65, 40, 31],
    [100, 80, 20],
    [128, 128, 16],
    [128, 32, 16],
    [256, 256, 8],
    [300, 10, 6],
    [4096, 4096, 1],
  ])('%i×%i → ×%i', (w, h, scale) => {
    expect(exportScale(w, h)).toBe(scale);
  });

  it('never exceeds the 2048 px cap and stays at ×8 or more for bundled sizes', () => {
    for (let w = 8; w <= 128; w++) {
      for (const h of [8, 32, 64, 128]) {
        const size = exportSize(w, h);
        expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(EXPORT_MAX_SIDE);
        expect(size.scale).toBeGreaterThanOrEqual(8);
        expect(size.scale).toBeLessThanOrEqual(32);
        expect(size.width).toBe(w * size.scale);
      }
    }
  });

  it('rejects invalid sizes', () => {
    expect(() => exportScale(0, 10)).toThrow(RangeError);
    expect(() => exportScale(1.5, 10)).toThrow(RangeError);
  });
});
