import { backgroundGray } from '@/lib/artwork/color';
import type { Artwork } from '@/lib/artwork/types';
import { getBit } from '@/lib/bitset';
import { contrastRatio, hexToRgb } from '@/lib/color';
import { colors, palette } from '@/theme/tokens';

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

/** Tint laid over the cells of the active color (accent violet, translucent). */
export const HIGHLIGHT_HEX = palette.violet;
export const HIGHLIGHT_ALPHA = 0.32;

/** The two inks numbers can be drawn with (dark ink and white). */
export const NUMBER_INK_DARK = colors.light.ink;
export const NUMBER_INK_LIGHT = palette.white;

/** WCAG AA for normal-size text. */
export const AA_CONTRAST = 4.5;

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Gray `gray` (0..255) under the active-color highlight (source-over blend). */
export function highlightedGrayHex(gray: number): string {
  const tint = hexToRgb(HIGHLIGHT_HEX);
  return toHex(tint.map((c) => gray + (c - gray) * HIGHLIGHT_ALPHA));
}

/**
 * Whether numbers on a background gray (0..255) are drawn in the light ink. Picks the ink whose
 * worst contrast, over the plain gray and the highlighted gray, is the highest.
 */
export function numberInkIsLight(gray: number): boolean {
  const backgrounds = [toHex([gray, gray, gray]), highlightedGrayHex(gray)];
  const worst = (ink: string) => Math.min(...backgrounds.map((bg) => contrastRatio(ink, bg)));
  return worst(NUMBER_INK_LIGHT) > worst(NUMBER_INK_DARK);
}

/** Per palette color: 1 when its numbers use the light ink, 0 for the dark ink. */
export function numberInks(artwork: Pick<Artwork, 'palette'>): number[] {
  return artwork.palette.colors.map((c) => (numberInkIsLight(backgroundGray(c.hex)) ? 1 : 0));
}

/**
 * Highlight mask of one palette color (0-based): the translucent tint on each of its cells,
 * transparent elsewhere. Drawn under the color layer, so filled cells hide it by themselves and
 * the mask never needs rebuilding while coloring (cached per color by the canvas).
 */
export function buildHighlightPixels(artwork: LayerSource, colorIndex: number): Uint8Array {
  const { width, height, cells } = artwork;
  const [r, g, b] = hexToRgb(HIGHLIGHT_HEX);
  const a = Math.round(HIGHLIGHT_ALPHA * 255);
  const value = colorIndex + 1;
  const pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== value) continue;
    const o = i * BYTES_PER_PIXEL;
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = b;
    pixels[o + 3] = a;
  }
  return pixels;
}
