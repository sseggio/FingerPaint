import { listArtworks } from '@/features/artwork/registry';
import { canAccess, DEFAULT_ENTITLEMENTS } from '@/features/entitlements/can-access';
import type { ArtworkSource } from '@/lib/artwork/types';
import { dailyArtworkId, type DayKey } from '@/lib/daily';

/**
 * Artworks eligible for the daily pick: free ones only (accessible without any purchase), so
 * the daily ritual is never a teaser for paid content.
 */
export function dailyPool(artworks: readonly ArtworkSource[]): ArtworkSource[] {
  return artworks.filter((a) => canAccess(a.access, DEFAULT_ENTITLEMENTS));
}

export function dailyArtwork(today: DayKey, artworks: readonly ArtworkSource[] = listArtworks()): ArtworkSource | undefined {
  const pool = dailyPool(artworks);
  const id = dailyArtworkId(
    today,
    pool.map((a) => a.id),
  );
  return pool.find((a) => a.id === id);
}
