import { albumsData, artworkData } from '@/content';
import { toArtwork } from '@/lib/artwork/codec';
import type { AlbumSource, Artwork, ArtworkSource } from '@/lib/artwork/types';
import { formatIssue, validateAlbums, validateArtwork } from '@/lib/artwork/validate';

export interface ArtworkRegistry {
  listAlbums(): readonly AlbumSource[];
  getAlbum(id: string): AlbumSource | undefined;
  listArtworks(): readonly ArtworkSource[];
  /** Lightweight sources of an album (not decoded), in manifest order. */
  listByAlbum(albumId: string): readonly ArtworkSource[];
  getArtworkSource(id: string): ArtworkSource | undefined;
  /** Decoded artwork, cached after the first call. */
  getArtwork(id: string): Artwork | undefined;
  clearCache(): void;
}

function warn(message: string) {
  if (process.env.NODE_ENV !== 'production') console.warn(`[artwork] ${message}`);
}

export interface RegistryOptions {
  /** Throw on an invalid albums manifest instead of degrading to an empty library. */
  strict?: boolean;
}

/** Builds a registry from raw content. Invalid albums/artworks are skipped (with a dev warning). */
export function createRegistry(
  rawAlbums: unknown,
  rawArtworks: readonly unknown[],
  options: RegistryOptions = {},
): ArtworkRegistry {
  const albumIssues = validateAlbums(rawAlbums);
  if (albumIssues.length > 0 && options.strict) {
    throw new Error(`albums.json is invalid:\n${albumIssues.map(formatIssue).join('\n')}`);
  }
  albumIssues.forEach((i) => warn(formatIssue(i)));
  const albums: AlbumSource[] =
    albumIssues.length === 0
      ? [...(rawAlbums as { albums: AlbumSource[] }).albums].sort((a, b) => a.order - b.order)
      : [];
  const albumIds = new Set(albums.map((a) => a.id));

  const sources = new Map<string, ArtworkSource>();
  rawArtworks.forEach((raw, index) => {
    const issues = validateArtwork(raw, { albumIds }, index);
    if (issues.length > 0) {
      issues.forEach((i) => warn(formatIssue(i)));
      return;
    }
    const source = raw as ArtworkSource;
    if (sources.has(source.id)) {
      warn(`[${source.id}] id: duplicate artwork id, skipped`);
      return;
    }
    sources.set(source.id, source);
  });

  const all = [...sources.values()];
  const cache = new Map<string, Artwork>();

  return {
    listAlbums: () => albums,
    getAlbum: (id) => albums.find((a) => a.id === id),
    listArtworks: () => all,
    listByAlbum: (albumId) => all.filter((s) => s.album === albumId),
    getArtworkSource: (id) => sources.get(id),
    getArtwork(id) {
      const cached = cache.get(id);
      if (cached) return cached;
      const source = sources.get(id);
      if (!source) return undefined;
      const artwork = toArtwork(source);
      cache.set(id, artwork);
      return artwork;
    },
    clearCache: () => cache.clear(),
  };
}

let defaultRegistry: ArtworkRegistry | undefined;

/**
 * App-wide registry over the bundled content (created lazily). In development an invalid
 * albums.json fails loudly (it would otherwise silently hide the whole library).
 */
export function getRegistry(): ArtworkRegistry {
  defaultRegistry ??= createRegistry(albumsData, artworkData, {
    strict: process.env.NODE_ENV !== 'production',
  });
  return defaultRegistry;
}

export const listAlbums = () => getRegistry().listAlbums();
export const listByAlbum = (albumId: string) => getRegistry().listByAlbum(albumId);
export const getArtwork = (id: string) => getRegistry().getArtwork(id);
