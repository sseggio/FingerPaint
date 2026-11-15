import { fetch as expoFetch } from 'expo/fetch';
import { create } from 'zustand';

import { listAlbums, listEmbeddedArtworks, setRemoteContent, type RemoteContent } from '@/features/artwork/registry';
import { useProgressStore } from '@/features/progress/progress-store';
import type { ArtworkSource } from '@/lib/artwork/types';
import { validateArtwork } from '@/lib/artwork/validate';
import { catalogFileName, emptyCatalogIndex, isNewEntry, isSyncDue, newAlbumIds, type CatalogIndex } from '@/lib/catalog/catalog-index';
import { defaultBackend, readValue, StorageKeys, writeValue, type StorageBackend } from '@/lib/storage';

import { readCatalogConfig, type CatalogConfig } from './catalog-config';
import { deviceCatalogFiles, type CatalogFiles } from './catalog-files';
import type { HttpFetch } from './catalog-http';
import { catalogSchema } from './catalog-schema';
import { syncCatalog } from './catalog-sync';

/** Foreground returns sync again only when the last attempt is older than this. */
export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Time away after which coming back counts as a new visit (resets the "New" badges). */
export const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;

export interface CatalogStoreState {
  /** False when no (valid) catalog URL is configured: the feature does nothing. */
  enabled: boolean;
  hydrated: boolean;
  syncing: boolean;
  index: CatalogIndex;
  /** Verified sources of the downloaded artworks (listed and retired). */
  sources: Readonly<Record<string, ArtworkSource>>;
  /** Artworks added after this time (epoch ms) show the "New" badge. */
  newSince: number;
  /** Loads the index and the downloaded files (local only, no network). Never rejects. */
  hydrate(): Promise<void>;
  /** Fetches the manifest and downloads what changed. Silent on failure. Never rejects. */
  sync(): Promise<void>;
  /** App back in the foreground: new visit after a long absence, sync when due. */
  onForeground(): Promise<void>;
  /** App leaving the foreground: remembers the visit end. */
  onBackground(): Promise<void>;
}

export interface CatalogStoreOptions {
  config?: CatalogConfig | null;
  fetch?: HttpFetch;
  files?: CatalogFiles;
  backend?: StorageBackend;
  now?: () => number;
  embeddedIds?: () => ReadonlySet<string>;
  embeddedAlbumIds?: () => ReadonlySet<string>;
  hasProgress?: (id: string) => boolean;
  /** Progress must be loaded before a sync may forget withdrawn artworks. */
  progressReady?: () => boolean;
  publish?: (content: RemoteContent | undefined) => void;
  timeoutMs?: number;
}

function warn(message: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') console.warn(`[catalog] ${message}`);
}

const defaultHasProgress = (id: string) => {
  const entry = useProgressStore.getState().index[id];
  return !!entry && (entry.status === 'completed' || entry.filledCount > 0);
};

/** Registry content of the current index (listed artworks in manifest order, retired apart). */
export function remoteContentOf(index: CatalogIndex, sources: Readonly<Record<string, ArtworkSource>>): RemoteContent {
  const entries = Object.values(index.entries).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
  return {
    albums: index.albums,
    artworks: entries.filter((e) => !e.retired && sources[e.id]).map((e) => sources[e.id]),
    retired: entries.filter((e) => e.retired && sources[e.id]).map((e) => sources[e.id]),
  };
}

export function createCatalogStore(options: CatalogStoreOptions = {}) {
  const config = options.config === undefined ? readCatalogConfig() : options.config;
  const files = options.files ?? deviceCatalogFiles;
  const backend = options.backend ?? defaultBackend;
  const now = options.now ?? Date.now;
  const fetchFn: HttpFetch = options.fetch ?? (expoFetch as unknown as HttpFetch);
  const embeddedIds = options.embeddedIds ?? (() => new Set(listEmbeddedArtworks().map((a) => a.id)));
  const embeddedAlbumIds = options.embeddedAlbumIds ?? (() => new Set(listAlbums().map((a) => a.id)));
  const hasProgress = options.hasProgress ?? defaultHasProgress;
  const progressReady = options.progressReady ?? (() => useProgressStore.getState().hydrated);
  const publish = options.publish ?? setRemoteContent;

  let writes: Promise<void> = Promise.resolve();
  const persist = (index: CatalogIndex) => {
    writes = writes.then(async () => {
      try {
        await writeValue(StorageKeys.catalog, index, catalogSchema, backend);
      } catch (e) {
        warn(`write failed: ${String(e)}`);
      }
    });
    return writes;
  };
  let leftAt: number | null = null;
  let running: Promise<void> | null = null;

  return create<CatalogStoreState>()((set, get) => ({
    enabled: config !== null,
    hydrated: false,
    syncing: false,
    index: emptyCatalogIndex(),
    sources: {},
    newSince: 0,

    async hydrate() {
      if (!config) {
        set({ hydrated: true });
        return;
      }
      try {
        const { data } = await readValue(StorageKeys.catalog, catalogSchema, backend);
        const index: CatalogIndex = { ...data, entries: { ...data.entries } };
        const sources: Record<string, ArtworkSource> = {};
        const embedded = embeddedIds();
        let lost = false;
        await Promise.all(
          Object.values(index.entries).map(async (entry) => {
            const text = await files.read(catalogFileName(entry.id, entry.rev));
            let raw: unknown = null;
            try {
              raw = text === null ? null : JSON.parse(text);
            } catch {
              raw = null;
            }
            const valid =
              raw !== null &&
              validateArtwork(raw).length === 0 &&
              (raw as ArtworkSource).id === entry.id &&
              !embedded.has(entry.id);
            if (valid) sources[entry.id] = raw as ArtworkSource;
            else {
              delete index.entries[entry.id];
              lost = true;
            }
          }),
        );
        // A missing or corrupt file: forget the ETag so the next sync downloads it again.
        if (lost) index.etag = null;
        // Orphan files (crash between a download and the index write) are cleaned up.
        const referenced = new Set(Object.values(index.entries).map((e) => catalogFileName(e.id, e.rev)));
        for (const name of files.list()) if (!referenced.has(name)) files.remove(name);
        set({ index, sources, newSince: index.lastVisitAt, hydrated: true });
        publish(remoteContentOf(index, sources));
        if (lost) await persist(index);
      } catch (e) {
        warn(`hydrate failed: ${String(e)}`);
        set({ hydrated: true });
      }
    },

    sync() {
      if (!config || !get().hydrated || !progressReady()) return Promise.resolve();
      if (running) return running;
      running = (async () => {
        set({ syncing: true });
        try {
          const outcome = await syncCatalog({
            config,
            fetch: fetchFn,
            files,
            index: get().index,
            embeddedIds: embeddedIds(),
            embeddedAlbumIds: embeddedAlbumIds(),
            hasProgress,
            now,
            timeoutMs: options.timeoutMs,
          });
          // Keep the visit time written meanwhile (the index object may be stale).
          const merged: CatalogIndex = { ...outcome.index, lastVisitAt: get().index.lastVisitAt };
          if (outcome.status !== 'updated') {
            if (outcome.status === 'failed') warn(outcome.reason);
            set({ index: merged });
            await persist(merged);
            return;
          }
          const sources: Record<string, ArtworkSource> = {};
          for (const id of Object.keys(merged.entries)) {
            const s = outcome.downloaded.get(id) ?? get().sources[id];
            if (s) sources[id] = s;
          }
          set({ index: merged, sources });
          publish(remoteContentOf(merged, sources));
          await persist(merged);
          // Old revisions and forgotten artworks are deleted only once the new index is saved.
          outcome.obsoleteFiles.forEach((name) => files.remove(name));
        } catch (e) {
          warn(`sync failed: ${String(e)}`);
        } finally {
          set({ syncing: false });
          running = null;
        }
      })();
      return running;
    },

    async onForeground() {
      if (!config) return;
      const t = now();
      if (leftAt !== null && t - leftAt >= NEW_VISIT_AFTER_MS) set({ newSince: leftAt });
      leftAt = null;
      if (isSyncDue(get().index.lastAttemptAt, t, SYNC_INTERVAL_MS)) await get().sync();
    },

    async onBackground() {
      if (!config || !get().hydrated) return;
      const t = now();
      leftAt = t;
      const index = { ...get().index, lastVisitAt: t };
      set({ index });
      await persist(index);
    },
  }));
}

export const useCatalogStore = createCatalogStore();

/** "New" badge of one artwork (arrived since the previous visit). */
export function useIsNewArtwork(id: string): boolean {
  return useCatalogStore((s) => isNewEntry(s.index.entries[id], s.newSince));
}

/** "New" badge of albums (holding at least one new artwork). */
export function newAlbumsOf(state: Pick<CatalogStoreState, 'index' | 'newSince'>): Set<string> {
  return newAlbumIds(state.index.entries, state.newSince);
}
