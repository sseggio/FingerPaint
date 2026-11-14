import { backgroundGray } from '@/lib/artwork/color';
import type { Artwork } from '@/lib/artwork/types';
import { getBit } from '@/lib/bitset';

/**
 * Pure RGBA buffers behind the two canvas layers. Each buffer is w×h pixels (one pixel per
 * cell, row-major, 4 bytes RGBA, unpremultiplied) and becomes an SkImage drawn scaled up with
 * nearest-neighbor sampling: one draw call per layer whatever the grid size.
 */

export const BYTES_PER_PIXEL = 4;

export type LayerSource = Pick<Artwork, 'width' | 'height' | 'cells' | 'palette'>;

/** Background layer: luminance of each target color as a light gray; empty cells transparent. */
export function buildBackgroundPixels(artwork: LayerSource): Uint8Array {
  const { width, height, cells, palette } = artwork;
  const grays = palette.colors.map((c) => backgroundGray(c.hex));
  const pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let i = 0; i < cells.length; i++) {
    const value = cells[i];
    if (value === 0) continue;
    const gray = grays[value - 1];
    const o = i * BYTES_PER_PIXEL;
    pixels[o] = gray;
    pixels[o + 1] = gray;
    pixels[o + 2] = gray;
    pixels[o + 3] = 255;
  }
  return pixels;
}

/** Color layer for a fresh artwork: fully transparent. */
export function createColorPixels(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * BYTES_PER_PIXEL);
}

/**
 * Paints cells (row-major indices) with their target color in place. Empty or out-of-range
 * cells are ignored. Returns the number of pixels written.
 */
export function paintCells(pixels: Uint8Array, artwork: LayerSource, indices: ArrayLike<number>): number {
  const { cells, palette } = artwork;
  let written = 0;
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    const value = cells[i];
    if (!value) continue;
    const [r, g, b] = palette.colors[value - 1].rgb;
    const o = i * BYTES_PER_PIXEL;
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = b;
    pixels[o + 3] = 255;
    written++;
  }
  return written;
}

/** Color layer restored from a progress bitset (bit i set = cell i correctly filled). */
export function buildColorPixels(artwork: LayerSource, filled: Uint8Array): Uint8Array {
  const pixels = createColorPixels(artwork.width, artwork.height);
  const indices: number[] = [];
  for (let i = 0; i < artwork.cells.length; i++) if (getBit(filled, i)) indices.push(i);
  paintCells(pixels, artwork, indices);
  return pixels;
}
