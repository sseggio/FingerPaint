import { backgroundGray } from '@/lib/artwork/color';
import { toArtwork } from '@/lib/artwork/codec';
import type { ArtworkSource } from '@/lib/artwork/types';
import { validateArtwork } from '@/lib/artwork/validate';
import { createBitset, setBit } from '@/lib/bitset';
import { contrastRatio } from '@/lib/color';

import { createPerfArtworkSource, PERF_ARTWORK_ID } from './__fixtures__/perf-artwork';
import { glyphAtlasSize, glyphSpriteIndex, glyphSpriteRect } from './glyph-layout';
import {
  AA_CONTRAST,
  buildBackgroundPixels,
  buildColorPixels,
  buildHighlightPixels,
  BYTES_PER_PIXEL,
  createColorPixels,
  highlightedGrayHex,
  HIGHLIGHT_ALPHA,
  NUMBER_INK_DARK,
  NUMBER_INK_LIGHT,
  numberInkIsLight,
  numberInks,
  paintCells,
} from './layers';

const source: ArtworkSource = {
  v: 1,
  id: 'tiny',
  album: 'garden',
  title: { fr: 'Mini', en: 'Tiny' },
  w: 8,
  h: 8,
  palette: ['#1B1A2E', '#FF3D7F', '#FFC93C'],
  rows: ['8A', 'A6BA', 'A6BA', 'A2B2C2BA', 'A2B2C2BA', 'A6BA', 'A6BA', '8.'],
  access: 'free',
  difficulty: 1,
};
const artwork = toArtwork(source);

const pixel = (pixels: Uint8Array, col: number, row: number) => {
  const o = (row * artwork.width + col) * BYTES_PER_PIXEL;
  return Array.from(pixels.subarray(o, o + BYTES_PER_PIXEL));
};

describe('background layer', () => {
  const pixels = buildBackgroundPixels(artwork);

  it('has one opaque gray pixel per cell, from the target color luminance', () => {
    expect(pixels).toHaveLength(8 * 8 * 4);
    const dark = backgroundGray('#1B1A2E');
    const yellow = backgroundGray('#FFC93C');
    expect(pixel(pixels, 0, 0)).toEqual([dark, dark, dark, 255]);
    expect(pixel(pixels, 3, 3)).toEqual([yellow, yellow, yellow, 255]);
    // A lighter target color gives a lighter gray.
    expect(yellow).toBeGreaterThan(dark);
  });

  it('leaves empty cells transparent', () => {
    expect(pixel(pixels, 3, 7)).toEqual([0, 0, 0, 0]);
  });
});

describe('color layer', () => {
  it('starts transparent', () => {
    expect(createColorPixels(8, 8).every((b) => b === 0)).toBe(true);
  });

  it('paints cells with their target color and skips empty cells', () => {
    const pixels = createColorPixels(8, 8);
    const pink = 1 * 8 + 6; // row 1, col 6 = B
    const empty = 7 * 8 + 2;
    expect(paintCells(pixels, artwork, [pink, empty])).toBe(1);
    expect(pixel(pixels, 6, 1)).toEqual([0xff, 0x3d, 0x7f, 255]);
    expect(pixel(pixels, 2, 7)).toEqual([0, 0, 0, 0]);
  });

  it('restores filled cells from a progress bitset', () => {
    const bits = createBitset(64);
    setBit(bits, 0);
    setBit(bits, 3 * 8 + 4);
    const pixels = buildColorPixels(artwork, bits);
    expect(pixel(pixels, 0, 0)).toEqual([0x1b, 0x1a, 0x2e, 255]);
    expect(pixel(pixels, 4, 3)).toEqual([0xff, 0xc9, 0x3c, 255]);
    expect(pixel(pixels, 1, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('highlight mask', () => {
  it('tints only the cells of the chosen color', () => {
    const mask = buildHighlightPixels(artwork, 2); // C
    const alpha = Math.round(HIGHLIGHT_ALPHA * 255);
    expect(pixel(mask, 3, 3)[3]).toBe(alpha);
    expect(pixel(mask, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(mask, 3, 7)).toEqual([0, 0, 0, 0]);
    const tinted = Array.from({ length: 64 }, (_, i) => mask[i * 4 + 3]).filter((a) => a > 0);
    expect(tinted).toHaveLength(artwork.colorCounts[2]);
  });
});

describe('number contrast', () => {
  const hex = (g: number) => `#${g.toString(16).padStart(2, '0').repeat(3)}`;
  const inkFor = (g: number) => (numberInkIsLight(g) ? NUMBER_INK_LIGHT : NUMBER_INK_DARK);

  it('meets AA on every background gray the layer can produce, highlighted or not', () => {
    for (const color of ['#000000', '#1B1A2E', '#7B5CFF', '#FF3D7F', '#2ED3A0', '#FFC93C', '#FFFFFF']) {
      const g = backgroundGray(color);
      const ink = inkFor(g);
      expect(contrastRatio(ink, hex(g))).toBeGreaterThanOrEqual(AA_CONTRAST);
      expect(contrastRatio(ink, highlightedGrayHex(g))).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
    for (let g = 150; g <= 245; g++) {
      expect(contrastRatio(inkFor(g), hex(g))).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });

  it('switches to the light ink on dark grays', () => {
    expect(numberInkIsLight(245)).toBe(false);
    expect(numberInkIsLight(30)).toBe(true);
    expect(contrastRatio(inkFor(30), hex(30))).toBeGreaterThanOrEqual(AA_CONTRAST);
    expect(numberInks(artwork)).toEqual([0, 0, 0]);
  });

  it('stores both inks in the atlas', () => {
    expect(glyphSpriteIndex(1, 12, false)).toBe(0);
    expect(glyphSpriteIndex(12, 12, false)).toBe(11);
    expect(glyphSpriteIndex(1, 12, true)).toBe(12);
  });
});

describe('glyph atlas layout', () => {
  it('lays sprites out in rows of columns', () => {
    expect(glyphSpriteRect(0, 10, 4)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(glyphSpriteRect(5, 10, 4)).toEqual({ x: 10, y: 10, width: 10, height: 10 });
    expect(glyphAtlasSize(40, 10, 8)).toEqual({ width: 80, height: 50 });
    expect(glyphAtlasSize(3, 10, 8)).toEqual({ width: 30, height: 10 });
  });
});

describe('128×128 perf fixture', () => {
  const perf = createPerfArtworkSource();

  it('is a valid artwork that uses every color', () => {
    expect(validateArtwork(perf, { albumIds: new Set(['dev']) })).toEqual([]);
    const decoded = toArtwork(perf);
    expect(decoded.id).toBe(PERF_ARTWORK_ID);
    expect(decoded.width * decoded.height).toBe(128 * 128);
    expect(buildBackgroundPixels(decoded)).toHaveLength(128 * 128 * 4);
  });
});
