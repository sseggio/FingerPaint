import { bitsetFromBase64, bitsetToBase64 } from '@/lib/bitset';
import {
  defaultBackend,
  readValue,
  removeValue,
  serializeValue,
  StorageKeys,
  type StorageBackend,
} from '@/lib/storage';

import {
  progressCellsSchema,
  progressIndexSchema,
  sanitizeIndex,
  type ProgressSummary,
} from './progress-schema';

export const PROGRESS_SAVE_DELAY_MS = 400;
/** First retry delay after a failed write; doubles on each consecutive failure. */
export const PROGRESS_RETRY_DELAY_MS = 2000;
export const PROGRESS_RETRY_MAX_DELAY_MS = 30_000;
/** Max rounds `loadIndex` waits for operations queued while it was waiting. */
export const LOAD_INDEX_MAX_WAITS = 8;

export interface ProgressRepoOptions {
  backend?: StorageBackend;
  delayMs?: number;
  retryDelayMs?: number;
  now?: () => number;
}

export interface ProgressRepo {
  /** Loads the lightweight index (invalid entries dropped). Never rejects. */
  loadIndex(): Promise<Record<string, ProgressSummary>>;
  /**
   * Loads the bitset of one artwork on demand. Resolves undefined when missing, corrupt or
   * not matching `bitCount` (the caller then starts from an empty bitset).
   */
  loadFilled(artworkId: string, bitCount: number): Promise<Uint8Array | undefined>;
  /**
   * Queues a save; all saves within `delayMs` of each other are coalesced into one storage
   * write. `bits` is read at flush time (pass the live session buffer, it is not copied).
   */
  save(summary: ProgressSummary, bits: Uint8Array): void;
  /** Writes pending saves now (app going to background, leaving the screen). */
  flush(): Promise<void>;
  remove(artworkId: string): Promise<void>;
  /**
   * Erases every artwork's progress, including entries only present in storage (works before
   * hydration). The empty index is written once, then all bitsets are removed in one batch.
   */
  removeAll(): Promise<void>;
  hasPending(): boolean;
}

function warn(message: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    console.warn(`[progress] ${message}`);
  }
}

export function createProgressRepo(options: ProgressRepoOptions = {}): ProgressRepo {
  const backend = options.backend ?? defaultBackend;
  const delayMs = options.delayMs ?? PROGRESS_SAVE_DELAY_MS;
  const retryDelayMs = options.retryDelayMs ?? PROGRESS_RETRY_DELAY_MS;
  const now = options.now ?? Date.now;

  let index: Record<string, ProgressSummary> = {};
  let indexDirty = false;
  const pending = new Map<string, Uint8Array>();
  /** Batch handed to `multiSet` and not yet acknowledged (readable by `loadFilled`). */
  let inFlight = new Map<string, Uint8Array>();
  /** Artworks removed before the index was loaded (must not come back from storage). */
  const removed = new Set<string>();
  let failures = 0;
  /** False until the stored index has been merged into `index` (writes wait for it). */
  let indexLoaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<void> = Promise.resolve();
  /** Bumped by `removeAll`: a stored index read that started before it is stale. */
  let generation = 0;

  const cancelTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = (ms: number) => {
    cancelTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, ms);
  };

  /** Merges the stored index under in-memory entries (saved/removed before loading). */
  const mergeStoredIndex = async () => {
    const startedAt = generation;
    const { data } = await readValue(StorageKeys.progressIndex, progressIndexSchema, backend);
    // Everything stored before a `removeAll` is gone, even if this read returned it.
    const stored = startedAt === generation ? sanitizeIndex(data).entries : {};
    for (const id of removed) delete stored[id];
    index = { ...stored, ...index };
    indexLoaded = true;
  };

  const writePending = async () => {
    if (!indexDirty && pending.size === 0) return;
    // Writing before the index is loaded (save after the hydration timeout) would replace the
    // stored index with only the in-memory entries and lose every other artwork's progress.
    if (!indexLoaded) await mergeStoredIndex();
    const batch = new Map(pending);
    // Ids already dropped from the index being written: once it is stored they cannot come back.
    const removedInBatch = [...removed];
    pending.clear();
    indexDirty = false;
    const time = now();
    const pairs: [string, string][] = [
      [StorageKeys.progressIndex, serializeValue({ entries: index }, progressIndexSchema, time)],
    ];
    for (const [id, bits] of batch) {
      pairs.push([StorageKeys.progress(id), serializeValue({ filled: bitsetToBase64(bits) }, progressCellsSchema, time)]);
    }
    inFlight = batch;
    try {
      await backend.multiSet(pairs);
      failures = 0;
      for (const id of removedInBatch) removed.delete(id);
    } catch (e) {
      failures += 1;
      const retryIn = Math.min(retryDelayMs * 2 ** (failures - 1), PROGRESS_RETRY_MAX_DELAY_MS);
      warn(`write failed, retrying in ${retryIn} ms (${String(e)})`);
      indexDirty = true;
      // Skip artworks removed while the write was in flight.
      for (const [id, bits] of batch) if (!pending.has(id) && inFlight.has(id)) pending.set(id, bits);
      // Do not rely on a future save or app backgrounding to retry.
      if (timer === undefined) schedule(retryIn);
    } finally {
      inFlight = new Map();
    }
  };

  const flush = () => {
    cancelTimer();
    queue = queue.then(writePending);
    return queue;
  };

  const removeKeys = async (keys: string[]) => {
    if (keys.length === 0) return;
    if (backend.multiRemove) await backend.multiRemove(keys);
    else for (const key of keys) await backend.removeItem(key);
  };

  const eraseAll = async () => {
    // Ids only known to storage (not hydrated yet) must be erased too.
    if (!indexLoaded) await mergeStoredIndex();
    generation += 1;
    const ids = new Set([...Object.keys(index), ...pending.keys()]);
    for (const id of ids) removed.add(id);
    index = {};
    pending.clear();
    indexDirty = false;
    try {
      await backend.multiSet([[StorageKeys.progressIndex, serializeValue({ entries: {} }, progressIndexSchema, now())]]);
      failures = 0;
    } catch (e) {
      failures += 1;
      const retryIn = Math.min(retryDelayMs * 2 ** (failures - 1), PROGRESS_RETRY_MAX_DELAY_MS);
      warn(`reset failed, retrying in ${retryIn} ms (${String(e)})`);
      indexDirty = true;
      if (timer === undefined) schedule(retryIn);
    }
    try {
      await removeKeys([...ids].map((id) => StorageKeys.progress(id)));
    } catch (e) {
      warn(`remove all failed (${String(e)})`);
    }
  };

  return {
    async loadIndex() {
      // Keep entries saved (or removed) before hydration finished.
      await mergeStoredIndex();
      // A `removeAll` queued while the stored index was being read must win: wait for every
      // queued operation (the generation it bumps drops the stale read) so the snapshot never
      // brings erased entries back into the store.
      // Bounded: a steady stream of saves (each extending the queue) cannot keep hydration
      // waiting forever; after the last round the snapshot is still consistent with the
      // in-memory index, which every queued operation updates synchronously.
      let pendingQueue = queue;
      for (let round = 0; round < LOAD_INDEX_MAX_WAITS; round++) {
        await pendingQueue;
        if (pendingQueue === queue) break;
        pendingQueue = queue;
      }
      return { ...index };
    },
    async loadFilled(artworkId, bitCount) {
      const live = pending.get(artworkId) ?? inFlight.get(artworkId);
      if (live) return live;
      const { data, status } = await readValue(StorageKeys.progress(artworkId), progressCellsSchema, backend);
      if (status !== 'ok' && status !== 'migrated') return undefined;
      try {
        return bitsetFromBase64(data.filled, bitCount);
      } catch (e) {
        warn(`${artworkId}: ${String(e)}`);
        return undefined;
      }
    },
    save(summary, bits) {
      index = { ...index, [summary.artworkId]: summary };
      indexDirty = true;
      pending.set(summary.artworkId, bits);
      removed.delete(summary.artworkId);
      schedule(delayMs);
    },
    flush,
    async remove(artworkId) {
      pending.delete(artworkId);
      inFlight.delete(artworkId);
      removed.add(artworkId);
      const { [artworkId]: _removed, ...rest } = index;
      index = rest;
      indexDirty = true;
      await flush();
      try {
        await removeValue(StorageKeys.progress(artworkId), backend);
      } catch (e) {
        warn(`${artworkId}: remove failed (${String(e)})`);
      }
    },
    removeAll() {
      cancelTimer();
      // Queued behind in-flight writes so none of them can bring an entry back.
      queue = queue.then(eraseAll);
      return queue;
    },
    hasPending: () => indexDirty || pending.size > 0,
  };
}
