/**
 * Online catalog manifest (`GET <CATALOG_URL>/catalog/v1/manifest.json`, published by the
 * back-office, see backoffice/README.md). Everything coming from the network is untrusted:
 * the manifest is validated strictly and rejected as a whole on the first problem.
 */
import { MAX_SIZE, type ArtworkAccess, type LocalizedText } from '@/lib/artwork/types';

export const MANIFEST_PATH = '/catalog/v1/manifest.json';
export const MAX_MANIFEST_ARTWORKS = 500;
export const MAX_MANIFEST_ALBUMS = 100;
export const MAX_MANIFEST_BYTES = 512 * 1024;
/**
 * Largest artwork file accepted. Unchanged by F33 (256×256): an RLE row takes at most one
 * character per cell (a run of 2 is "2A", longer runs are shorter per cell), so the worst
 * 256×256 file is 256 rows × (256 + ~8 chars of JSON) + palette + titles ≈ 70 KB, well under
 * 256 KB (checked by manifest.test.ts). Keeping the same value also keeps build ≤ 7 clients and
 * the back-office aligned.
 */
export const MAX_ARTWORK_BYTES = 256 * 1024;
/**
 * Plausible bound for the optional `w` / `h` of a manifest entry. Deliberately far above this
 * app's MAX_SIZE: entries for bigger grids (future versions) are valid, just filtered out.
 */
const MAX_DECLARED_SIZE = 4096;
const MAX_ID_LENGTH = 64;
const MAX_TITLE_LENGTH = 80;
const MAX_URL_LENGTH = 512;
const MAX_REV = 999_999;

export interface ManifestAlbum {
  id: string;
  title: LocalizedText;
  access: ArtworkAccess;
  order: number;
}

export interface ManifestArtwork {
  id: string;
  album: string;
  rev: number;
  url: string;
  sha256: string;
  publishedAt: string;
  /**
   * Grid size, optional (F33, written by the back-office since then). Lets a client skip an
   * artwork larger than it supports BEFORE downloading it (`isSupportedSize`). Older clients
   * drop the unknown fields and rely on the file validation instead.
   */
  w?: number;
  h?: number;
}

export interface Manifest {
  v: 1;
  updatedAt: string;
  albums: ManifestAlbum[];
  artworks: ManifestArtwork[];
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
/** `https://host[:port]` + path. No userinfo, query or fragment; conservative path charset. */
const HTTPS_URL_RE = /^https:\/\/([a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?)(\/[A-Za-z0-9._~\-/]*)?$/;

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isContentId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_ID_LENGTH && ID_RE.test(v);
}

export interface HttpsUrl {
  /** Lowercase `host[:port]`. */
  host: string;
  /** Path without trailing slash ('' for the root). */
  path: string;
}

/** Parses a strict `https://` URL; null for anything else (http, userinfo, query, `..`…). */
export function parseHttpsUrl(value: unknown): HttpsUrl | null {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null;
  const m = HTTPS_URL_RE.exec(value);
  if (!m) return null;
  const path = (m[2] ?? '').replace(/\/+$/, '');
  if (path.split('/').some((segment) => segment === '.' || segment === '..') || path.includes('//')) return null;
  return { host: m[1], path };
}

/**
 * Catalog base URL from configuration (`EXPO_PUBLIC_CATALOG_URL`). Empty, missing or not
 * HTTPS: null, i.e. the online catalog is disabled and the app only shows bundled content.
 */
export function parseCatalogUrl(value: string | undefined): { base: string; host: string } | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  // Scheme and host are case-insensitive: normalize them, keep the path as is.
  const parsed = parseHttpsUrl(trimmed.replace(/^[a-z]+:\/\/[^/]*/i, (origin) => origin.toLowerCase()));
  if (!parsed) return null;
  return { base: `https://${parsed.host}${parsed.path}`, host: parsed.host };
}

function isIso(v: unknown): v is string {
  return typeof v === 'string' && ISO_RE.test(v) && Number.isFinite(Date.parse(v));
}

function isTitle(v: unknown): v is LocalizedText {
  if (!isRecord(v)) return false;
  return (['fr', 'en'] as const).every((lang) => {
    const s = v[lang];
    return typeof s === 'string' && s.trim().length > 0 && s.length <= MAX_TITLE_LENGTH;
  });
}

function isAccess(v: unknown): v is ArtworkAccess {
  if (v === 'free' || v === 'pro') return true;
  return isRecord(v) && Object.keys(v).length === 1 && isContentId(v.pack);
}

const isDeclaredSize = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_DECLARED_SIZE;

/**
 * Whether this app can open a manifest artwork, judging from its declared size (`w`, `h`).
 * Entries without a size (older back-office) are assumed supported: the downloaded file is
 * validated anyway.
 */
export function isSupportedSize(art: Pick<ManifestArtwork, 'w' | 'h'>, maxSize: number = MAX_SIZE): boolean {
  return (art.w === undefined || art.w <= maxSize) && (art.h === undefined || art.h <= maxSize);
}

export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; error: string };

/**
 * Validates a parsed manifest. `host` is the catalog host: every artwork URL must be HTTPS on
 * that same host (a compromised or mistaken manifest cannot point the app elsewhere).
 * Returns a clean copy (unknown fields dropped).
 */
export function validateManifest(raw: unknown, host: string): ManifestResult {
  const fail = (error: string): ManifestResult => ({ ok: false, error });
  if (!isRecord(raw) || raw.v !== 1) return fail('root: expected { v: 1 }');
  if (!isIso(raw.updatedAt)) return fail('updatedAt: expected an ISO date');
  if (!Array.isArray(raw.albums) || !Array.isArray(raw.artworks)) return fail('root: albums and artworks must be arrays');
  if (raw.albums.length > MAX_MANIFEST_ALBUMS) return fail(`albums: more than ${MAX_MANIFEST_ALBUMS}`);
  if (raw.artworks.length > MAX_MANIFEST_ARTWORKS) return fail(`artworks: more than ${MAX_MANIFEST_ARTWORKS}`);

  const albums: ManifestAlbum[] = [];
  const albumIds = new Set<string>();
  for (const [i, a] of (raw.albums as unknown[]).entries()) {
    if (!isRecord(a)) return fail(`albums[${i}]: not an object`);
    if (!isContentId(a.id)) return fail(`albums[${i}].id: must be kebab-case`);
    if (albumIds.has(a.id)) return fail(`albums[${i}].id: duplicate "${a.id}"`);
    if (!isTitle(a.title)) return fail(`albums[${i}].title: expected { fr, en }`);
    if (!isAccess(a.access)) return fail(`albums[${i}].access: invalid`);
    if (typeof a.order !== 'number' || !Number.isInteger(a.order) || a.order < 0 || a.order > 10_000) {
      return fail(`albums[${i}].order: must be an integer in 0..10000`);
    }
    albumIds.add(a.id);
    const access: ArtworkAccess = typeof a.access === 'object' ? { pack: a.access.pack } : a.access;
    albums.push({ id: a.id, title: { fr: a.title.fr, en: a.title.en }, access, order: a.order });
  }

  const artworks: ManifestArtwork[] = [];
  const artworkIds = new Set<string>();
  for (const [i, a] of (raw.artworks as unknown[]).entries()) {
    if (!isRecord(a)) return fail(`artworks[${i}]: not an object`);
    if (!isContentId(a.id)) return fail(`artworks[${i}].id: must be kebab-case`);
    if (artworkIds.has(a.id)) return fail(`artworks[${i}].id: duplicate "${a.id}"`);
    if (!isContentId(a.album) || !albumIds.has(a.album)) return fail(`artworks[${i}].album: unknown album`);
    if (typeof a.rev !== 'number' || !Number.isInteger(a.rev) || a.rev < 1 || a.rev > MAX_REV) {
      return fail(`artworks[${i}].rev: must be an integer >= 1`);
    }
    const url = parseHttpsUrl(a.url);
    if (!url) return fail(`artworks[${i}].url: must be an https URL`);
    if (url.host !== host) return fail(`artworks[${i}].url: must be on ${host}`);
    if (typeof a.sha256 !== 'string' || !SHA_RE.test(a.sha256)) return fail(`artworks[${i}].sha256: expected 64 hex chars`);
    if (!isIso(a.publishedAt)) return fail(`artworks[${i}].publishedAt: expected an ISO date`);
    if (a.w !== undefined && !isDeclaredSize(a.w)) return fail(`artworks[${i}].w: expected an integer in 1..${MAX_DECLARED_SIZE}`);
    if (a.h !== undefined && !isDeclaredSize(a.h)) return fail(`artworks[${i}].h: expected an integer in 1..${MAX_DECLARED_SIZE}`);
    artworkIds.add(a.id);
    const entry: ManifestArtwork = { id: a.id, album: a.album, rev: a.rev, url: a.url as string, sha256: a.sha256, publishedAt: a.publishedAt };
    if (a.w !== undefined) entry.w = a.w;
    if (a.h !== undefined) entry.h = a.h;
    artworks.push(entry);
  }
  return { ok: true, manifest: { v: 1, updatedAt: raw.updatedAt, albums, artworks } };
}
