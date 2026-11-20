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
 * stands for a `step`×`step` block of cells, sampled as follows (no blending):
 * - a filled cell wins: the center cell when it is filled, else the first filled cell of the
 *   block, so the player's fine work (thin lines, small details) never disappears;
 * - otherwise the center cell (gray), or the first non-empty cell when the center is empty.
 * Cost: O(output pixels) when the center decides, O(cells) at worst.
 */
export function buildThumbnailPixels(artwork: LayerSource, fill: ThumbnailFill, maxSide: number = Infinity): Uint8Array {
  const { width, height, cells, palette } = artwork;
  const size = thumbnailSize(width, height, maxSide);
  const { step } = size;
  const grays = palette.colors.map((c) => backgroundGray(c.hex));
  const pixels = new Uint8Array(size.width * size.height * BYTES_PER_PIXEL);
  const center = step >> 1;
  const isFilled = (i: number) => cells[i] !== 0 && (fill === 'all' || (fill !== 'none' && getBit(fill, i)));
  for (let ty = 0; ty < size.height; ty++) {
    const y0 = ty * step;
    const y1 = Math.min(height, y0 + step);
    const cy = Math.min(height - 1, y0 + center);
    for (let tx = 0; tx < size.width; tx++) {
      const x0 = tx * step;
      const x1 = Math.min(width, x0 + step);
      let i = cy * width + Math.min(width - 1, x0 + center);
      let filled = isFilled(i);
      if (!filled && step > 1) {
        let firstNonEmpty = cells[i] !== 0 ? i : -1;
        let found = -1;
        for (let y = y0; y < y1 && found < 0; y++)
          for (let x = x0; x < x1; x++) {
            const j = y * width + x;
            if (cells[j] === 0) continue;
            if (firstNonEmpty < 0) firstNonEmpty = j;
            if (fill !== 'none' && isFilled(j)) {
              found = j;
              break;
            }
          }
        if (found >= 0) {
          i = found;
          filled = true;
        } else if (firstNonEmpty >= 0) i = firstNonEmpty;
      }
      const value = cells[i];
      if (value === 0) continue;
      const o = (ty * size.width + tx) * BYTES_PER_PIXEL;
      if (filled) {
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
