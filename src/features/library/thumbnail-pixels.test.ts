import { toArtwork } from '@/lib/artwork/codec';
import { createBitset, setBit } from '@/lib/bitset';

import { buildThumbnailPixels } from './thumbnail-pixels';

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
