/**
 * PNG export sizing. Every cell becomes an exact `scale`×`scale` square (integer factor, drawn
 * with nearest-neighbor sampling), so the export stays perfectly crisp.
 *
 * Rule: the largest integer factor in [EXPORT_MIN_SCALE, EXPORT_MAX_SCALE] whose longest side
 * fits in EXPORT_MAX_SIDE. Examples: 16×16 → ×32 (512 px), 64×64 → ×32 (2048 px),
 * 100×80 → ×20 (2000×1600), 128×128 → ×16 (2048 px). Grids too large for ×8 within the cap
 * (never the case for bundled content, max 128) fall back to the largest factor that fits (≥ 1).
 */
export const EXPORT_MIN_SCALE = 8;
export const EXPORT_MAX_SCALE = 32;
export const EXPORT_MAX_SIDE = 2048;

export interface ExportSize {
  scale: number;
  width: number;
  height: number;
}

export function exportScale(width: number, height: number): number {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`invalid grid size ${width}×${height}`);
  }
  const fit = Math.floor(EXPORT_MAX_SIDE / Math.max(width, height));
  if (fit < EXPORT_MIN_SCALE) return Math.max(1, fit);
  return Math.min(EXPORT_MAX_SCALE, fit);
}

export function exportSize(width: number, height: number): ExportSize {
  const scale = exportScale(width, height);
  return { scale, width: width * scale, height: height * scale };
}
