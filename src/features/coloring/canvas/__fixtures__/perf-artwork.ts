import { encode } from '@/lib/artwork/codec';
import type { ArtworkSource, HexColor } from '@/lib/artwork/types';

import { PERF_ARTWORK_ID } from '../../perf-artwork-id';

export { PERF_ARTWORK_ID };

/**
 * Generated 128×128 artwork for performance checks (worst case: largest grid, many colors,
 * numbers everywhere). Not part of the public content; loaded through a `__DEV__`-guarded
 * require (see resolve-artwork.ts) so release bundles do not embed it.
 */

const PERF_PALETTE: HexColor[] = [
  '#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231', '#911EB4', '#46F0F0', '#F032E6',
  '#BCF60C', '#FABEBE', '#008080', '#9A6324', '#800000', '#000075', '#808080', '#FFFFFF',
];

export function createPerfArtworkSource(size = 128): ArtworkSource {
  const n = PERF_PALETTE.length;
  const cells = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Corners stay empty to exercise transparent cells.
      if (Math.min(x, size - 1 - x) + Math.min(y, size - 1 - y) < 6) continue;
      const ring = Math.floor(Math.hypot(x - c, y - c) / 5);
      const tile = (Math.floor(x / 8) + Math.floor(y / 8)) % 3;
      cells[y * size + x] = ((ring + tile) % n) + 1;
    }
  }
  return {
    v: 1,
    id: PERF_ARTWORK_ID,
    album: 'dev',
    title: { fr: 'Test de performance 128×128', en: 'Performance test 128×128' },
    w: size,
    h: size,
    palette: PERF_PALETTE,
    rows: encode({ width: size, height: size, cells }),
    access: 'free',
    difficulty: 3,
  };
}
