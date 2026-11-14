/**
 * @jest-environment ./jest/skia-environment.js
 */
import { PNG } from 'pngjs';

import { getArtwork } from '@/features/artwork/registry';
import { tinyArtwork } from '@/features/coloring/__fixtures__/tiny-artwork';
import { createBitset, setBit } from '@/lib/bitset';
import { exportSize } from '@/lib/export-scale';

import { renderArtworkPng } from './render-png';

jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);

function decode(bytes: Uint8Array) {
  return PNG.sync.read(Buffer.from(bytes));
}

function pixel(png: PNG, x: number, y: number): number[] {
  const o = (y * png.width + x) * 4;
  return [png.data[o], png.data[o + 1], png.data[o + 2], png.data[o + 3]];
}

describe('renderArtworkPng', () => {
  it('exports a finished artwork at the scaled size, crisp and transparent outside the drawing', () => {
    const artwork = tinyArtwork();
    const out = renderArtworkPng(artwork, 'all', null);
    const png = decode(out.bytes);
    const size = exportSize(artwork.width, artwork.height);
    expect([png.width, png.height]).toEqual([size.width, size.height]);
    expect(out.scale).toBe(size.scale);
    const s = size.scale;
    for (let i = 0; i < artwork.cells.length; i++) {
      const cx = i % artwork.width;
      const cy = Math.floor(i / artwork.width);
      const value = artwork.cells[i];
      const expected = value === 0 ? [0, 0, 0, 0] : [...artwork.palette.colors[value - 1].rgb, 255];
      // Corners and center of every cell block: nearest-neighbor, no blending at the edges.
      for (const [dx, dy] of [
        [0, 0],
        [s - 1, s - 1],
        [s >> 1, s >> 1],
      ]) {
        const got = pixel(png, cx * s + dx, cy * s + dy);
        if (value === 0) expect(got[3]).toBe(0);
        else expect(got).toEqual(expected);
      }
    }
  });

  it('fills empty cells with the chosen background', () => {
    const artwork = tinyArtwork();
    const empty = artwork.cells.indexOf(0);
    expect(empty).toBeGreaterThanOrEqual(0);
    const png = decode(renderArtworkPng(artwork, 'all', '#FFF8F0').bytes);
    const s = exportSize(artwork.width, artwork.height).scale;
    expect(pixel(png, (empty % artwork.width) * s, Math.floor(empty / artwork.width) * s)).toEqual([255, 248, 240, 255]);
  });

  it('exports the partial state of an artwork in progress', () => {
    const artwork = getArtwork('tabby-cat');
    if (!artwork) throw new Error('missing artwork');
    const bits = createBitset(artwork.totalCells);
    const first = artwork.cells.findIndex((v) => v !== 0);
    setBit(bits, first);
    const out = renderArtworkPng(artwork, bits, null);
    const png = decode(out.bytes);
    expect(Math.max(png.width, png.height)).toBeLessThanOrEqual(2048);
    const s = out.scale;
    const at = (i: number) => pixel(png, (i % artwork.width) * s + 1, Math.floor(i / artwork.width) * s + 1);
    expect(at(first)).toEqual([...artwork.palette.colors[artwork.cells[first] - 1].rgb, 255]);
    // Another colorable cell stays gray (r = g = b).
    const other = artwork.cells.findIndex((v, i) => v !== 0 && i !== first && v !== artwork.cells[first]);
    const [r, g, b, a] = at(other);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(a).toBe(255);
  });
});
