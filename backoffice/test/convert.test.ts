import { describe, expect, it } from 'vitest';

import { formatIssue, MAX_SIZE, validateArtwork } from '../src/artwork-lib';
import { clampMaxColors, convertPng, ConvertError, MAX_PNG_BYTES, readPngSize, reducePalette } from '../src/convert';
import { renderPreview } from '../src/preview';
import { makePng, samplePng } from './helpers';

describe('convertPng', () => {
  it('converts a PNG into a valid artwork grid (transparency, ΔE merge, luminance order)', () => {
    const grid = convertPng(samplePng());
    expect(grid.w).toBe(16);
    expect(grid.h).toBe(16);
    // Blue is darker than red: sorted by luminance.
    expect(grid.palette).toEqual(['#0000FF', '#FF0000']);
    expect(grid.merged).toBe(1);
    expect(grid.cells).toBe(15 * 15);
    expect(grid.rows[0]).toBe('16.');
    expect(grid.rows[1]).toBe('.7B8A');
    const art = {
      v: 1, id: 'sample', album: 'garden', title: { fr: 'A', en: 'A' },
      w: grid.w, h: grid.h, palette: grid.palette, rows: grid.rows, access: 'free', difficulty: 1,
    };
    expect(validateArtwork(art).map(formatIssue)).toEqual([]);
  });

  it('caps the palette to maxColors', () => {
    const colors: [number, number, number][] = [
      [255, 0, 0], [0, 160, 0], [0, 0, 255], [255, 220, 0], [130, 0, 200], [0, 0, 0],
    ];
    const png = makePng(12, 8, (x) => [...colors[x % colors.length], 255]);
    expect(convertPng(png, 24).palette).toHaveLength(6);
    expect(convertPng(png, 3).palette).toHaveLength(3);
    expect(clampMaxColors(1)).toBe(2);
    expect(clampMaxColors(99)).toBe(40);
    expect(clampMaxColors('x')).toBe(24);
  });

  it('merges the rarer color into the more frequent one', () => {
    const counts = new Map<`#${string}`, number>([['#FF0000', 10], ['#FE0101', 2], ['#0000FF', 5]]);
    const target = reducePalette(counts, 24);
    expect(target.get('#FE0101')).toBe('#FF0000');
    expect(target.get('#0000FF')).toBe('#0000FF');
  });

  it('refuses non-PNG, oversized dimensions and files over 1 MB before decoding', () => {
    expect(() => convertPng(Buffer.from('GIF89a not a png at all, definitely not'))).toThrow(ConvertError);
    expect(() => convertPng(makePng(4, 4, () => [0, 0, 0, 255]))).toThrow(/hors limites/);
    expect(() => convertPng(makePng(257, 8, () => [0, 0, 0, 255]))).toThrow(/hors limites/);
    expect(() => convertPng(makePng(8, 257, () => [0, 0, 0, 255]))).toThrow(/8 à 256 pixels/);
    expect(() => convertPng(Buffer.alloc(MAX_PNG_BYTES + 1))).toThrow(/1 Mo/);
    // A forged IHDR claiming a huge image is rejected from the header alone.
    const forged = Buffer.from(makePng(8, 8, () => [0, 0, 0, 255]));
    forged.writeUInt32BE(50_000, 16);
    expect(readPngSize(forged).width).toBe(50_000);
    expect(() => convertPng(forged)).toThrow(/hors limites/);
  });

  it('stays fast on a noisy 128×128 image (many distinct colors)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
    const png = makePng(128, 128, () => [rnd(), rnd(), rnd(), 255]);
    const t = Date.now();
    const grid = convertPng(png, 40);
    expect(grid.palette.length).toBeLessThanOrEqual(40);
    expect(Date.now() - t).toBeLessThan(10_000);
  });

  it('accepts 256×256 (F33): valid artwork, fast even when noisy, under the upload limit', () => {
    expect(MAX_SIZE).toBe(256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
    const png = makePng(256, 256, () => [rnd(), rnd(), rnd(), 255]);
    // Worst case for PNG compression (random pixels) still fits the 1 MB upload limit.
    expect(png.length).toBeLessThan(MAX_PNG_BYTES / 2);
    const t = Date.now();
    const grid = convertPng(png, 40);
    expect(Date.now() - t).toBeLessThan(15_000);
    expect(grid.w).toBe(256);
    expect(grid.h).toBe(256);
    expect(grid.rows).toHaveLength(256);
    const art = {
      v: 1, id: 'noisy', album: 'garden', title: { fr: 'B', en: 'B' },
      w: grid.w, h: grid.h, palette: grid.palette, rows: grid.rows, access: 'free', difficulty: 3,
    };
    expect(validateArtwork(art).map(formatIssue)).toEqual([]);
    // Preview of a 256×256 grid: integer scale, longest side ≤ 384 px.
    expect(readPngSize(renderPreview(grid))).toEqual({ width: 256, height: 256 });
  });

  it('renders an enlarged preview PNG', () => {
    const grid = convertPng(samplePng());
    const png = renderPreview(grid);
    expect(readPngSize(png)).toEqual({ width: 16 * 24, height: 16 * 24 });
  });
});
