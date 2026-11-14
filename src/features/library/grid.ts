import { spacing } from '@/theme';

/** Target tile width: 3 columns on a phone, more on tablets. */
const MIN_TILE = 104;
export const GRID_GAP = spacing.md;
export const GRID_PADDING = spacing.lg;

/** Column count and tile width for a screen width (pure, so it is testable). */
export function gridLayout(screenWidth: number): { columns: number; tileWidth: number } {
  const usable = Math.max(0, screenWidth - GRID_PADDING * 2);
  const columns = Math.max(2, Math.floor((usable + GRID_GAP) / (MIN_TILE + GRID_GAP)));
  const tileWidth = Math.floor((usable - GRID_GAP * (columns - 1)) / columns);
  return { columns, tileWidth };
}
