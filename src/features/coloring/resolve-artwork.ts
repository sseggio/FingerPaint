import { getArtwork } from '@/features/artwork/registry';
import { toArtwork } from '@/lib/artwork/codec';
import type { Artwork } from '@/lib/artwork/types';

import { createPerfArtworkSource, PERF_ARTWORK_ID } from './canvas/__fixtures__/perf-artwork';

/** Artwork ids are kebab-case (see validate.ts); anything else is rejected before any lookup. */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;

/** Normalizes a route param (string, string[] or missing) into a well-formed id, else null. */
export function parseArtworkIdParam(param: unknown): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) return null;
  return ID_PATTERN.test(value) ? value : null;
}

let perfArtwork: Artwork | undefined;

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
    perfArtwork ??= toArtwork(createPerfArtworkSource());
    return perfArtwork;
  }
  return lookup(id);
}
