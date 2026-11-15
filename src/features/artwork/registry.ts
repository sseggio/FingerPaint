import { albumsData, artworkData } from '@/content';
import { toArtwork } from '@/lib/artwork/codec';
import type { AlbumSource, Artwork, ArtworkSource } from '@/lib/artwork/types';
import { formatIssue, validateAlbums, validateArtwork } from '@/lib/artwork/validate';
import type { ManifestAlbum } from '@/lib/catalog/manifest';

export interface ArtworkRegistry {
  listAlbums(): readonly AlbumSource[];
  getAlbum(id: string): AlbumSource | undefined;
  /** Library catalog: bundled artworks, then downloaded ones (manifest order). */
  listArtworks(): readonly ArtworkSource[];
  /**
   * Library catalog plus downloaded artworks withdrawn from the online catalog that the user
   * has progress on ("My artworks" keeps them reachable).
   */
  listArtworksWithRetired(): readonly ArtworkSource[];
  /** Bundled artworks only (deterministic: the daily pick is drawn from them). */
  listEmbeddedArtworks(): readonly ArtworkSource[];
  /** Lightweight sources of an album (not decoded), in manifest order. */
  listByAlbum(albumId: string): readonly ArtworkSource[];
  getArtworkSource(id: string): ArtworkSource | undefined;
  /** Decoded artwork, cached after the first call. */
  getArtwork(id: string): Artwork | undefined;
  /** True for artworks that came from the online catalog. */
  isRemote(id: string): boolean;
  clearCache(): void;
}

/** Downloaded catalog content (already checked against its SHA-256; revalidated here). */
export interface RemoteContent {
  albums: readonly ManifestAlbum[];
  /** Listed artworks, in manifest order. */
  artworks: readonly unknown[];
  /** Withdrawn artworks kept for the user's progress (not listed in the library). */
  retired: readonly unknown[];
}

function warn(message: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') console.warn(`[artwork] ${message}`);
}

function warnAlways(message: string) {
  if (process.env.NODE_ENV !== 'production') console.warn(`[artwork] ${message}`);
}

export interface RegistryOptions {
  /** Throw on an invalid albums manifest instead of degrading to an empty library. */
  strict?: boolean;
  /** Online catalog content merged over the bundled one (bundled ids always win). */
  remote?: RemoteContent;
}

function toAlbumSource(album: ManifestAlbum): AlbumSource {
  const source: AlbumSource = { id: album.id, title: { fr: album.title.fr, en: album.title.en }, order: album.order };
  if (typeof album.access === 'object') source.pack = album.access.pack;
  return source;
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
  albumIssues.forEach((i) => warnAlways(formatIssue(i)));
  const embeddedAlbums: AlbumSource[] = albumIssues.length === 0 ? [...(rawAlbums as { albums: AlbumSource[] }).albums] : [];
  const albumIds = new Set(embeddedAlbums.map((a) => a.id));

  // Remote albums are added; a bundled album keeps its own title/order (it may get new artworks).
  const remote = options.remote;
  const remoteAlbums = (remote?.albums ?? []).filter((a) => !albumIds.has(a.id)).map(toAlbumSource);
  remoteAlbums.forEach((a) => albumIds.add(a.id));
  const albums = [...embeddedAlbums, ...remoteAlbums].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const sources = new Map<string, ArtworkSource>();
  rawArtworks.forEach((raw, index) => {
    const issues = validateArtwork(raw, { albumIds }, index);
    if (issues.length > 0) {
      issues.forEach((i) => warnAlways(formatIssue(i)));
      return;
    }
    const source = raw as ArtworkSource;
    if (sources.has(source.id)) {
      warnAlways(`[${source.id}] id: duplicate artwork id, skipped`);
      return;
    }
    sources.set(source.id, source);
  });
  const embedded = [...sources.values()];

  const remoteIds = new Set<string>();
  const listed: ArtworkSource[] = [];
  const retired: ArtworkSource[] = [];
  const addRemote = (raw: unknown, list: ArtworkSource[], requireAlbum: boolean) => {
    const issues = validateArtwork(raw, requireAlbum ? { albumIds } : {});
    if (issues.length > 0) {
      issues.forEach((i) => warn(`catalog ${formatIssue(i)}`));
      return;
    }
    const source = raw as ArtworkSource;
    // Collision with bundled content (or a duplicate): the bundled artwork wins.
    if (sources.has(source.id)) {
      warn(`[${source.id}] catalog artwork collides with an existing id, skipped`);
      return;
    }
    sources.set(source.id, source);
    remoteIds.add(source.id);
    list.push(source);
  };
  remote?.artworks.forEach((raw) => addRemote(raw, listed, true));
  remote?.retired.forEach((raw) => addRemote(raw, retired, false));

  const all = [...embedded, ...listed];
  const withRetired = retired.length > 0 ? [...all, ...retired] : all;
  const cache = new Map<string, Artwork>();

  return {
    listAlbums: () => albums,
    getAlbum: (id) => albums.find((a) => a.id === id),
    listArtworks: () => all,
    listArtworksWithRetired: () => withRetired,
    listEmbeddedArtworks: () => embedded,
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
    isRemote: (id) => remoteIds.has(id),
    clearCache: () => cache.clear(),
  };
}

let defaultRegistry: ArtworkRegistry | undefined;
let remoteContent: RemoteContent | undefined;
let registryVersion = 0;
const listeners = new Set<() => void>();

/**
 * App-wide registry over the bundled content plus the downloaded catalog (created lazily,
 * rebuilt when the catalog changes). In development an invalid albums.json fails loudly (it
 * would otherwise silently hide the whole library).
 */
export function getRegistry(): ArtworkRegistry {
  defaultRegistry ??= createRegistry(albumsData, artworkData, {
    strict: process.env.NODE_ENV !== 'production',
    remote: remoteContent,
  });
  return defaultRegistry;
}

/** Replaces the downloaded catalog content (undefined = bundled content only). */
export function setRemoteContent(content: RemoteContent | undefined): void {
  remoteContent = content;
  defaultRegistry = undefined;
  registryVersion++;
  listeners.forEach((listener) => listener());
}

/** Increments every time the registry content changes (for memoized screens). */
export function getRegistryVersion(): number {
  return registryVersion;
}

export function subscribeRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const listAlbums = () => getRegistry().listAlbums();
export const listByAlbum = (albumId: string) => getRegistry().listByAlbum(albumId);
export const getArtwork = (id: string) => getRegistry().getArtwork(id);
export const listArtworks = () => getRegistry().listArtworks();
export const listArtworksWithRetired = () => getRegistry().listArtworksWithRetired();
export const listEmbeddedArtworks = () => getRegistry().listEmbeddedArtworks();
