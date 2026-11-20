import { toArtwork } from '@/lib/artwork/codec';
import { createBitset, setBit } from '@/lib/bitset';

import { buildThumbnailPixels, THUMBNAIL_MAX_SIDE, thumbnailSize } from './thumbnail-pixels';

// 2×2 + one empty cell: A B / . A
const artwork = toArtwork({
  v: 1,
  id: 'tiny',
  album: 'garden',
  title: { fr: 'Mini', en: 'Tiny' },
  w: 8,
  h: 8,
  palette: ['#FF0000', '#0000FF'],
  rows: ['AB6.', '.A6.', '8.', '8.', '8.', '8.', '8.', '8.'],
  access: 'free',
  difficulty: 1,
});

const px = (pixels: Uint8Array, i: number) => Array.from(pixels.slice(i * 4, i * 4 + 4));

describe('buildThumbnailPixels', () => {
  it('shows the gray background when nothing is filled, empty cells transparent', () => {
    const pixels = buildThumbnailPixels(artwork, 'none');
    const [r, g, b, a] = px(pixels, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(a).toBe(255);
    expect(px(pixels, 8)).toEqual([0, 0, 0, 0]);
  });

  it('colors only the filled cells of a partial state', () => {
    const bits = createBitset(64);
    setBit(bits, 1);
    const pixels = buildThumbnailPixels(artwork, bits);
    expect(px(pixels, 1)).toEqual([0, 0, 255, 255]);
    expect(px(pixels, 0)).not.toEqual([255, 0, 0, 255]);
  });

  it('colors every cell of a completed artwork', () => {
    const pixels = buildThumbnailPixels(artwork, 'all');
    expect(px(pixels, 0)).toEqual([255, 0, 0, 255]);
    expect(px(pixels, 9)).toEqual([255, 0, 0, 255]);
    expect(px(pixels, 8)).toEqual([0, 0, 0, 0]);
  });
});

describe('downscaled thumbnails (F33)', () => {
  // 256×256: color 1 everywhere except odd columns in color 2.
  const big = toArtwork({
    v: 1,
    id: 'big',
    album: 'garden',
    title: { fr: 'Grand', en: 'Big' },
    w: 256,
    h: 256,
    palette: ['#FF0000', '#0000FF'],
    rows: Array.from({ length: 256 }, () => 'AB'.repeat(128)),
    access: 'free',
    difficulty: 3,
  });

  it('sizes the image to at most 128 px with an integer step', () => {
    expect(thumbnailSize(256, 256, THUMBNAIL_MAX_SIDE)).toEqual({ width: 128, height: 128, step: 2 });
    expect(thumbnailSize(192, 96, THUMBNAIL_MAX_SIDE)).toEqual({ width: 96, height: 48, step: 2 });
    expect(thumbnailSize(128, 128, THUMBNAIL_MAX_SIDE)).toEqual({ width: 128, height: 128, step: 1 });
    expect(thumbnailSize(256, 256)).toEqual({ width: 256, height: 256, step: 1 });
  });

  it('samples the center cell of each block (nearest neighbor)', () => {
    const pixels = buildThumbnailPixels(big, 'all', THUMBNAIL_MAX_SIDE);
    expect(pixels).toHaveLength(128 * 128 * 4);
    // Block (0, 0) covers cells 0..1: center cell 1 is blue.
    expect(px(pixels, 0)).toEqual([0, 0, 255, 255]);
    expect(px(pixels, 128 * 128 - 1)).toEqual([0, 0, 255, 255]);
  });

  it('keeps full resolution without maxSide (PNG export) and matches progress bits', () => {
    expect(buildThumbnailPixels(big, 'none')).toHaveLength(256 * 256 * 4);
    const bits = createBitset(256 * 256);
    setBit(bits, 256 * 3 + 3); // row 3, col 3: center of block (1, 1)
    const pixels = buildThumbnailPixels(big, bits, THUMBNAIL_MAX_SIDE);
    expect(px(pixels, 128 + 1)).toEqual([0, 0, 255, 255]);
    expect(px(pixels, 0)).not.toEqual([0, 0, 255, 255]);
  });
});
