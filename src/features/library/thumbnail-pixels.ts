import { buildBackgroundPixels, paintCells, type LayerSource } from '@/features/coloring/canvas/layers';
import { getBit } from '@/lib/bitset';

/** Which cells a thumbnail shows in color: none, all, or the ones set in a progress bitset. */
export type ThumbnailFill = 'none' | 'all' | Uint8Array;

/**
 * RGBA buffer (one pixel per cell) of an artwork's current state: the gray coloring
 * background, with the filled cells in their target color. Empty cells stay transparent.
 */
export function buildThumbnailPixels(artwork: LayerSource, fill: ThumbnailFill): Uint8Array {
  const pixels = buildBackgroundPixels(artwork);
  if (fill === 'none') return pixels;
  const indices: number[] = [];
  for (let i = 0; i < artwork.cells.length; i++) {
    if (fill === 'all' || getBit(fill, i)) indices.push(i);
  }
  paintCells(pixels, artwork, indices);
  return pixels;
}
