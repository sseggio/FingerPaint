/**
 * One catalog synchronization, with every side effect injected (tests mock fetch and files):
 * manifest (ETag) → strict validation → plan → downloads (3 at a time, 256 KB max, SHA-256
 * checked, validateArtwork) → next index. Any failure keeps the local cache untouched.
 */
import type { ArtworkSource } from '@/lib/artwork/types';
import { validateArtwork } from '@/lib/artwork/validate';
import { applySync, catalogFileName, planSync, type CatalogIndex, type SyncPlan } from '@/lib/catalog/catalog-index';
import { MANIFEST_PATH, MAX_ARTWORK_BYTES, MAX_MANIFEST_BYTES, validateManifest, type ManifestArtwork } from '@/lib/catalog/manifest';
import { sha256Hex } from '@/lib/sha256';
import { decodeUtf8 } from '@/lib/utf8';

import type { CatalogConfig } from './catalog-config';
import type { CatalogFiles } from './catalog-files';
import { httpGet, mapLimit, type HttpFetch } from './catalog-http';

export const DOWNLOAD_CONCURRENCY = 3;

export interface SyncDeps {
  config: CatalogConfig;
  fetch: HttpFetch;
  files: CatalogFiles;
  index: CatalogIndex;
  embeddedIds: ReadonlySet<string>;
  embeddedAlbumIds: ReadonlySet<string>;
  hasProgress: (id: string) => boolean;
  now: () => number;
  timeoutMs?: number;
}

export type SyncOutcome =
  /** Network or validation failure: nothing changed (only the attempt time is recorded). */
  | { status: 'failed'; reason: string; index: CatalogIndex }
  /** 304: the local cache is current. */
  | { status: 'not-modified'; index: CatalogIndex }
  | {
      status: 'updated';
      index: CatalogIndex;
      plan: SyncPlan;
      /** Verified sources written to disk during this sync. */
      downloaded: Map<string, ArtworkSource>;
      /** Files that are no longer referenced (delete once the new index is persisted). */
      obsoleteFiles: string[];
    };

/** Verifies and parses one downloaded file. Throws on any mismatch. */
export function verifyArtworkFile(bytes: Uint8Array, art: ManifestArtwork, albumIds: ReadonlySet<string>): { source: ArtworkSource; text: string } {
  if (sha256Hex(bytes) !== art.sha256) throw new Error(`${art.id}: sha256 mismatch`);
  const text = decodeUtf8(bytes);
  const raw: unknown = JSON.parse(text);
  const issues = validateArtwork(raw, { albumIds });
  if (issues.length > 0) throw new Error(`${art.id}: invalid artwork`);
  const source = raw as ArtworkSource;
  if (source.id !== art.id || source.album !== art.album) throw new Error(`${art.id}: id/album mismatch`);
  return { source, text };
}

export async function syncCatalog(deps: SyncDeps): Promise<SyncOutcome> {
  const { config, index } = deps;
  const attempted: CatalogIndex = { ...index, lastAttemptAt: deps.now() };
  let manifestRes;
  try {
    manifestRes = await httpGet(deps.fetch, `${config.base}${MANIFEST_PATH}`, {
      maxBytes: MAX_MANIFEST_BYTES,
      etag: index.etag,
      timeoutMs: deps.timeoutMs,
    });
  } catch (e) {
    return { status: 'failed', reason: String(e), index: attempted };
  }
  if (manifestRes.status === 304) {
    return { status: 'not-modified', index: { ...attempted, etag: manifestRes.etag ?? index.etag } };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(decodeUtf8(manifestRes.bytes));
  } catch {
    return { status: 'failed', reason: 'manifest: not JSON', index: attempted };
  }
  const result = validateManifest(raw, config.host);
  if (!result.ok) return { status: 'failed', reason: `manifest: ${result.error}`, index: attempted };
  const manifest = result.manifest;

  const plan = planSync(manifest, index, { embeddedIds: deps.embeddedIds, hasProgress: deps.hasProgress });
  const albumIds = new Set([...deps.embeddedAlbumIds, ...manifest.albums.map((a) => a.id)]);
  const downloaded = new Map<string, ArtworkSource>();
  const okEntries: ManifestArtwork[] = [];
  const results = await mapLimit(plan.download, DOWNLOAD_CONCURRENCY, async (art) => {
    const res = await httpGet(deps.fetch, art.url, { maxBytes: MAX_ARTWORK_BYTES, timeoutMs: deps.timeoutMs });
    if (res.status !== 200) throw new Error(`${art.id}: unexpected 304`);
    const { source, text } = verifyArtworkFile(res.bytes, art, albumIds);
    await deps.files.write(catalogFileName(art.id, art.rev), text);
    return { art, source };
  });
  for (const r of results) {
    if (!r) continue;
    downloaded.set(r.art.id, r.source);
    okEntries.push(r.art);
  }

  const next = applySync(index, manifest, plan, { downloaded: okEntries, now: deps.now(), etag: manifestRes.etag });
  const keepFiles = new Set(Object.values(next.entries).map((e) => catalogFileName(e.id, e.rev)));
  const obsoleteFiles = Object.values(index.entries)
    .map((e) => catalogFileName(e.id, e.rev))
    .filter((name) => !keepFiles.has(name));
  return { status: 'updated', index: next, plan, downloaded, obsoleteFiles };
}
