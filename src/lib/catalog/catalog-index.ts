/**
 * Local index of the downloaded catalog (persisted under `fp:catalog`) and the pure sync
 * planning: which manifest artworks to download, keep, retire or forget.
 */
import { isContentId, isSupportedSize, type Manifest, type ManifestAlbum, type ManifestArtwork } from './manifest';

export interface CatalogEntry {
  id: string;
  album: string;
  rev: number;
  sha256: string;
  publishedAt: string;
  /**
   * Local time (epoch ms) the artwork first arrived on this device. 0 when it came with the
   * very first sync (a fresh install does not flag the whole catalog as "new").
   */
  addedAt: number;
  /** Gone from the manifest: kept (out of the library) only because the user has progress on it. */
  retired: boolean;
}

export interface CatalogIndex {
  /** ETag of the manifest the index matches; null forces a full manifest download next time. */
  etag: string | null;
  /** Last sync attempt (epoch ms, success or not): drives the 6 h foreground throttle. */
  lastAttemptAt: number;
  /** Last valid manifest received (epoch ms); 0 = never (the first sync flags nothing as new). */
  syncedAt: number;
  /** When the user last left the app (epoch ms): artworks added after it are "new". */
  lastVisitAt: number;
  /** Albums of the last valid manifest. */
  albums: ManifestAlbum[];
  entries: Record<string, CatalogEntry>;
}

export function emptyCatalogIndex(): CatalogIndex {
  return { etag: null, lastAttemptAt: 0, syncedAt: 0, lastVisitAt: 0, albums: [], entries: {} };
}

/** Local file name of one artwork revision. */
export function catalogFileName(id: string, rev: number): string {
  return `${id}.${rev}.json`;
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function isAlbum(v: unknown): v is ManifestAlbum {
  if (!isRecord(v) || !isContentId(v.id) || !isRecord(v.title)) return false;
  if (typeof v.title.fr !== 'string' || typeof v.title.en !== 'string') return false;
  if (typeof v.order !== 'number' || !Number.isInteger(v.order) || v.order < 0) return false;
  const a = v.access;
  return a === 'free' || a === 'pro' || (isRecord(a) && isContentId(a.pack));
}

function isEntry(id: string, v: unknown): v is CatalogEntry {
  return (
    isRecord(v) &&
    v.id === id &&
    isContentId(v.id) &&
    isContentId(v.album) &&
    typeof v.rev === 'number' &&
    Number.isInteger(v.rev) &&
    v.rev >= 1 &&
    typeof v.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(v.sha256) &&
    typeof v.publishedAt === 'string' &&
    isTime(v.addedAt) &&
    typeof v.retired === 'boolean'
  );
}

/** Type guard of the stored index (schema v1). */
export function isCatalogIndex(v: unknown): v is CatalogIndex {
  if (!isRecord(v)) return false;
  if (v.etag !== null && (typeof v.etag !== 'string' || v.etag.length > 256)) return false;
  if (!isTime(v.lastAttemptAt) || !isTime(v.syncedAt) || !isTime(v.lastVisitAt)) return false;
  if (!Array.isArray(v.albums) || !v.albums.every(isAlbum)) return false;
  if (!isRecord(v.entries)) return false;
  return Object.entries(v.entries).every(([id, e]) => isEntry(id, e));
}

export interface SyncPlan {
  /** New artworks, or a higher revision than the local one. */
  download: ManifestArtwork[];
  /** Still listed and up to date locally. */
  keep: ManifestArtwork[];
  /** Local artworks gone from the manifest that the user has progress on (kept, out of the library). */
  retire: string[];
  /** Local artworks gone from the manifest without progress: their files are deleted. */
  remove: string[];
  /** Manifest ids that collide with bundled artworks: ignored (bundled content wins). */
  collisions: string[];
  /**
   * Listed artworks declared larger than this app supports (manifest `w` / `h` above MAX_SIZE,
   * F33): never downloaded and not counted as failures (the ETag is kept). A local revision
   * that this app could open is kept as is.
   */
  unsupported: ManifestArtwork[];
}

export interface PlanContext {
  embeddedIds: ReadonlySet<string>;
  /** True when the user started (or finished) this artwork. */
  hasProgress: (id: string) => boolean;
}

/** Compares a validated manifest with the local index. Pure. */
export function planSync(manifest: Manifest, index: CatalogIndex, ctx: PlanContext): SyncPlan {
  const plan: SyncPlan = { download: [], keep: [], retire: [], remove: [], collisions: [], unsupported: [] };
  const listed = new Set<string>();
  for (const art of manifest.artworks) {
    if (ctx.embeddedIds.has(art.id)) {
      plan.collisions.push(art.id);
      continue;
    }
    listed.add(art.id);
    const local = index.entries[art.id];
    if (!isSupportedSize(art)) {
      plan.unsupported.push(art);
      continue;
    }
    // Revisions are immutable: only a strictly higher one is fetched (never a rollback).
    if (!local || art.rev > local.rev) plan.download.push(art);
    else plan.keep.push(art);
  }
  for (const id of Object.keys(index.entries)) {
    if (listed.has(id)) continue;
    if (ctx.hasProgress(id) && !ctx.embeddedIds.has(id)) plan.retire.push(id);
    else plan.remove.push(id);
  }
  return plan;
}

export interface ApplyContext {
  /** Entries actually downloaded and verified (subset of `plan.download`). */
  downloaded: readonly ManifestArtwork[];
  now: number;
  etag: string | null;
}

/**
 * Builds the next index after a sync. Failed downloads keep the previous local revision when
 * there is one; the ETag is only remembered when everything succeeded (otherwise the next sync
 * fetches the full manifest again and retries).
 */
export function applySync(index: CatalogIndex, manifest: Manifest, plan: SyncPlan, ctx: ApplyContext): CatalogIndex {
  const firstSync = index.syncedAt === 0;
  const entries: Record<string, CatalogEntry> = {};
  const done = new Set(ctx.downloaded.map((a) => a.id));
  const toEntry = (art: ManifestArtwork, addedAt: number): CatalogEntry => ({
    id: art.id,
    album: art.album,
    rev: art.rev,
    sha256: art.sha256,
    publishedAt: art.publishedAt,
    addedAt,
    retired: false,
  });
  for (const art of plan.keep) {
    const local = index.entries[art.id];
    if (local) entries[art.id] = { ...local, publishedAt: art.publishedAt, retired: false };
  }
  for (const art of plan.download) {
    const local = index.entries[art.id];
    if (done.has(art.id)) {
      // An update keeps its arrival date: only genuinely new artworks get the badge.
      entries[art.id] = toEntry(art, local ? local.addedAt : firstSync ? 0 : ctx.now);
    } else if (local) {
      entries[art.id] = { ...local, retired: false };
    }
  }
  for (const art of plan.unsupported) {
    // Still listed: an older revision this app could open stays available.
    const local = index.entries[art.id];
    if (local) entries[art.id] = { ...local, retired: false };
  }
  for (const id of plan.retire) {
    const local = index.entries[id];
    if (local) entries[id] = { ...local, retired: true };
  }
  const complete = done.size === plan.download.length;
  return {
    etag: complete ? ctx.etag : null,
    lastAttemptAt: ctx.now,
    syncedAt: ctx.now,
    lastVisitAt: index.lastVisitAt,
    albums: manifest.albums,
    entries,
  };
}

/** "New" badge: arrived on this device after the user's previous visit. */
export function isNewEntry(entry: Pick<CatalogEntry, 'addedAt' | 'retired'> | undefined, since: number): boolean {
  return !!entry && !entry.retired && entry.addedAt > 0 && entry.addedAt > since;
}

/** Albums holding at least one "new" artwork. */
export function newAlbumIds(entries: Readonly<Record<string, CatalogEntry>>, since: number): Set<string> {
  const ids = new Set<string>();
  for (const e of Object.values(entries)) if (isNewEntry(e, since)) ids.add(e.album);
  return ids;
}

/** True when a foreground return should trigger a sync (last attempt older than `minIntervalMs`). */
export function isSyncDue(lastAttemptAt: number, now: number, minIntervalMs: number): boolean {
  return now - lastAttemptAt >= minIntervalMs || now < lastAttemptAt;
}
