import { toArtwork } from '@/lib/artwork/codec';
import type { ArtworkSource } from '@/lib/artwork/types';

/**
 * 8×8 test artwork: color 0 (A) = 20 cells, color 1 (B) = 32, color 2 (C) = 4, last row empty.
 */
export const tinySource: ArtworkSource = {
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

export const tinyArtwork = () => toArtwork(tinySource);

/** Row-major indices of the cells of a palette color (0-based). */
export function cellsOf(artwork: ReturnType<typeof tinyArtwork>, colorIndex: number): number[] {
  const out: number[] = [];
  artwork.cells.forEach((v, i) => {
    if (v === colorIndex + 1) out.push(i);
  });
  return out;
}
