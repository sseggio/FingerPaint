import { getArtwork } from '@/features/artwork/registry';
import { toArtwork } from '@/lib/artwork/codec';
import type { Artwork, ArtworkSource } from '@/lib/artwork/types';
import { parseContentIdParam } from '@/lib/content-id';

import { PERF_ARTWORK_ID } from './perf-artwork-id';

/** Normalizes a route param (string, string[] or missing) into a well-formed id, else null. */
export const parseArtworkIdParam = parseContentIdParam;

let perfArtwork: Artwork | undefined;

/**
 * Generates the perf fixture. The require sits behind `__DEV__`, which Metro inlines as
 * `false` in release builds: the branch is folded away before dependencies are collected, so
 * the generator never reaches a production bundle.
 */
function loadPerfArtworkSource(): ArtworkSource | undefined {
  // The require must sit inside the `if` block: constant folding drops the whole block.
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dev-only conditional import
    const fixture = require('./canvas/__fixtures__/perf-artwork') as typeof import('./canvas/__fixtures__/perf-artwork');
    return fixture.createPerfArtworkSource();
  }
  return undefined;
}

export interface ResolveOptions {
  /** Allows the generated perf fixture (development builds only). */
  allowDev?: boolean;
  lookup?: (id: string) => Artwork | undefined;
}

/** Artwork for the coloring route, or undefined for a malformed or unknown id. */
export function resolveColoringArtwork(param: unknown, options: ResolveOptions = {}): Artwork | undefined {
  const { allowDev = __DEV__, lookup = getArtwork } = options;
  const id = parseArtworkIdParam(param);
  if (!id) return undefined;
  if (id === PERF_ARTWORK_ID) {
    if (!allowDev) return undefined;
    if (!perfArtwork) {
      const source = loadPerfArtworkSource();
      if (!source) return undefined;
      perfArtwork = toArtwork(source);
    }
    return perfArtwork;
  }
  return lookup(id);
}
