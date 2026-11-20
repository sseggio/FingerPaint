import { MAX_SIZE, MIN_SIZE } from './artwork/types';
import { EXPORT_MAX_SIDE, EXPORT_MIN_SCALE, exportScale, exportSize } from './export-scale';

describe('exportScale', () => {
  it.each([
    [8, 8, 32],
    [16, 16, 32],
    [64, 64, 32],
    [65, 40, 31],
    [100, 80, 20],
    [128, 128, 16],
    [128, 32, 16],
    [192, 192, 10],
    [255, 200, 8],
    [256, 256, 8],
    [256, 8, 8],
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

  it('gives every valid artwork (up to MAX_SIZE = 256) at least ×8 within 2048 px (F33)', () => {
    for (let w = MIN_SIZE; w <= MAX_SIZE; w++) {
      for (const h of [MIN_SIZE, 100, 192, MAX_SIZE]) {
        const size = exportSize(w, h);
        expect(size.scale).toBeGreaterThanOrEqual(EXPORT_MIN_SCALE);
        expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(EXPORT_MAX_SIDE);
      }
    }
    expect(exportSize(MAX_SIZE, MAX_SIZE)).toEqual({ scale: 8, width: 2048, height: 2048 });
  });

  it('rejects invalid sizes', () => {
    expect(() => exportScale(0, 10)).toThrow(RangeError);
    expect(() => exportScale(1.5, 10)).toThrow(RangeError);
  });
});
