import { create } from 'zustand';

import type { FillOrderView } from '@/lib/fill-order';

import { createProgressRepo, type ProgressRepo, type StoredCells } from './progress-repo';
import type { ProgressSummary } from './progress-schema';

export interface ProgressState {
  /** Lightweight index (no bitsets), keyed by artwork id. */
  index: Record<string, ProgressSummary>;
  hydrated: boolean;
  hydrate(): Promise<void>;
  /** Loads one artwork's bitset on demand (kept out of the store state). */
  loadFilled(artworkId: string, bitCount: number): Promise<Uint8Array | undefined>;
  /** Bitset and fill order journal of one artwork (journal null when absent or invalid). */
  loadCells(artworkId: string, bitCount: number): Promise<StoredCells | undefined>;
  /** Updates the index entry and schedules a debounced write (400 ms). */
  save(summary: ProgressSummary, bits: Uint8Array, order?: FillOrderView): void;
  flush(): Promise<void>;
  remove(artworkId: string): Promise<void>;
  /** Erases the progress of every artwork (index and bitsets). */
  removeAll(): Promise<void>;
  /** Writes restored entries (backup import) and flushes them right away. */
  importEntries(
    entries: readonly { summary: ProgressSummary; bits: Uint8Array; order?: Uint16Array }[],
  ): Promise<void>;
}

export function createProgressStore(repo: ProgressRepo = createProgressRepo()) {
  return create<ProgressState>()((set, get) => ({
    index: {},
    hydrated: false,
    async hydrate() {
      const index = await repo.loadIndex();
      set({ index: { ...index, ...get().index }, hydrated: true });
    },
    loadFilled: (artworkId, bitCount) => repo.loadFilled(artworkId, bitCount),
    loadCells: (artworkId, bitCount) => repo.loadCells(artworkId, bitCount),
    save(summary, bits, order) {
      set((s) => ({ index: { ...s.index, [summary.artworkId]: summary } }));
      repo.save(summary, bits, order);
    },
    flush: () => repo.flush(),
    async remove(artworkId) {
      set((s) => {
        const { [artworkId]: _removed, ...rest } = s.index;
        return { index: rest };
      });
      await repo.remove(artworkId);
    },
    async removeAll() {
      set({ index: {} });
      await repo.removeAll();
    },
    async importEntries(entries) {
      if (entries.length === 0) return;
      set((s) => {
        const index = { ...s.index };
        for (const { summary } of entries) index[summary.artworkId] = summary;
        return { index };
      });
      for (const { summary, bits, order } of entries) {
        repo.save(summary, bits, order ? { cells: order, length: order.length } : undefined);
      }
      await repo.flush();
    },
  }));
}

export const useProgressStore = createProgressStore();
