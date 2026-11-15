import { useSyncExternalStore } from 'react';

import { getRegistry, subscribeRegistry, type ArtworkRegistry } from './registry';

/**
 * Current registry (bundled content + downloaded catalog). A new instance is returned when
 * catalog artworks arrive or leave, so `useMemo(() => registry.listArtworks(), [registry])`
 * stays correct.
 */
export function useRegistry(): ArtworkRegistry {
  return useSyncExternalStore(subscribeRegistry, getRegistry, getRegistry);
}
