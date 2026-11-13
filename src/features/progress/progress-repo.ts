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

export interface ProgressRepoOptions {
  backend?: StorageBackend;
  delayMs?: number;
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
  const now = options.now ?? Date.now;

  let index: Record<string, ProgressSummary> = {};
  let indexDirty = false;
  const pending = new Map<string, Uint8Array>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<void> = Promise.resolve();

  const cancelTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const writePending = async () => {
    if (!indexDirty && pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();
    indexDirty = false;
    const time = now();
    const pairs: [string, string][] = [
      [StorageKeys.progressIndex, serializeValue({ entries: index }, progressIndexSchema, time)],
    ];
    for (const [id, bits] of batch) {
      pairs.push([StorageKeys.progress(id), serializeValue({ filled: bitsetToBase64(bits) }, progressCellsSchema, time)]);
    }
    try {
      await backend.multiSet(pairs);
    } catch (e) {
      warn(`write failed, will retry on next save (${String(e)})`);
      indexDirty = true;
      for (const [id, bits] of batch) if (!pending.has(id)) pending.set(id, bits);
    }
  };

  const flush = () => {
    cancelTimer();
    queue = queue.then(writePending);
    return queue;
  };

  return {
    async loadIndex() {
      const { data } = await readValue(StorageKeys.progressIndex, progressIndexSchema, backend);
      // Keep entries saved before hydration finished.
      index = { ...sanitizeIndex(data).entries, ...index };
      return { ...index };
    },
    async loadFilled(artworkId, bitCount) {
      const live = pending.get(artworkId);
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
      cancelTimer();
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, delayMs);
    },
    flush,
    async remove(artworkId) {
      pending.delete(artworkId);
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
    hasPending: () => indexDirty || pending.size > 0,
  };
}
