/** Small helpers shared by the drawing generators. */
import type { HexColor } from '../artwork-lib';
import { Raster } from './raster';
import type { DrawContext } from './types';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const TAU = Math.PI * 2;

/** Outline width (cells) suited to the canvas size: none on tiny grids, thicker on big ones. */
export function lineWidth(ctx: Pick<DrawContext, 'w' | 'h'>, tinyBelow = 28): number {
  const s = Math.min(ctx.w, ctx.h);
  if (s < tinyBelow) return 0;
  if (s < 180) return 1;
  return 2;
}

/**
 * Boundary cells between regions of an id raster: a cell is marked when a cell of a *lower*
 * id lies within `width` (Chebyshev distance). One-sided, so lines are `width` cells thick and,
 * thanks to the 8-neighborhood, always 4-connected.
 */
export function boundaries(ids: Raster, width: number): Raster {
  const out = new Raster(ids.w, ids.h);
  if (width <= 0) return out;
  const { w, h, data } = ids;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      if (v === 0) continue;
      let mark = false;
      for (let dy = -width; dy <= width && !mark; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -width; dx <= width; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (data[ny * w + nx] < v) {
            mark = true;
            break;
          }
        }
      }
      if (mark) out.data[y * w + x] = 1;
    }
  return out;
}

/** Picks `n` colors cycling through `pool` (no immediate repeats when the pool allows). */
export function cycle(pool: readonly HexColor[], n: number, offset = 0): HexColor[] {
  return Array.from({ length: n }, (_, i) => pool[(i + offset) % pool.length]);
}
