import { backgroundGray } from '@/lib/artwork/color';
import { BYTES_PER_PIXEL, type LayerSource } from '@/features/coloring/canvas/layers';
import { getBit } from '@/lib/bitset';

/** Which cells a thumbnail shows in color: none, all, or the ones set in a progress bitset. */
export type ThumbnailFill = 'none' | 'all' | Uint8Array;

/**
 * Longest side (px) of a library thumbnail image. Tiles are drawn ≤ ~170 pt wide, and a bigger
 * grid (F33: up to 256×256) is sampled down by an integer step, so a cached thumbnail never
 * exceeds 128×128 px = 64 KB.
 */
export const THUMBNAIL_MAX_SIDE = 128;

export interface ThumbnailSize {
  width: number;
  height: number;
  /** One output pixel per `step`×`step` block of cells (1 = full resolution). */
  step: number;
}

/** Size of the thumbnail image of a `width`×`height` grid, longest side ≤ `maxSide`. */
export function thumbnailSize(width: number, height: number, maxSide: number = Infinity): ThumbnailSize {
  const step = Number.isFinite(maxSide) && maxSide >= 1 ? Math.max(1, Math.ceil(Math.max(width, height) / maxSide)) : 1;
  return { width: Math.ceil(width / step), height: Math.ceil(height / step), step };
}

/**
 * RGBA buffer of an artwork's current state: the gray coloring background, with the filled
 * cells in their target color. Empty cells stay transparent. Full resolution (one pixel per
 * cell, used by the PNG export) unless `maxSide` asks for a smaller image: each output pixel then
 * takes the cell at the center of its block (nearest-neighbor, O(output pixels), no blending).
 */
export function buildThumbnailPixels(artwork: LayerSource, fill: ThumbnailFill, maxSide: number = Infinity): Uint8Array {
  const { width, cells, palette } = artwork;
  const size = thumbnailSize(width, artwork.height, maxSide);
  const { step } = size;
  const grays = palette.colors.map((c) => backgroundGray(c.hex));
  const pixels = new Uint8Array(size.width * size.height * BYTES_PER_PIXEL);
  const center = step >> 1;
  for (let ty = 0; ty < size.height; ty++) {
    const row = Math.min(artwork.height - 1, ty * step + center) * width;
    for (let tx = 0; tx < size.width; tx++) {
      const i = row + Math.min(width - 1, tx * step + center);
      const value = cells[i];
      if (value === 0) continue;
      const o = (ty * size.width + tx) * BYTES_PER_PIXEL;
      if (fill === 'all' || (fill !== 'none' && getBit(fill, i))) {
        const [r, g, b] = palette.colors[value - 1].rgb;
        pixels[o] = r;
        pixels[o + 1] = g;
        pixels[o + 2] = b;
      } else {
        const gray = grays[value - 1];
        pixels[o] = gray;
        pixels[o + 1] = gray;
        pixels[o + 2] = gray;
      }
      pixels[o + 3] = 255;
    }
  }
  return pixels;
}
