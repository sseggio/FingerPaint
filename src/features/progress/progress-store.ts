import { create } from 'zustand';

import { createProgressRepo, type ProgressRepo } from './progress-repo';
import type { ProgressSummary } from './progress-schema';

export interface ProgressState {
  /** Lightweight index (no bitsets), keyed by artwork id. */
  index: Record<string, ProgressSummary>;
  hydrated: boolean;
  hydrate(): Promise<void>;
  /** Loads one artwork's bitset on demand (kept out of the store state). */
  loadFilled(artworkId: string, bitCount: number): Promise<Uint8Array | undefined>;
  /** Updates the index entry and schedules a debounced write (400 ms). */
  save(summary: ProgressSummary, bits: Uint8Array): void;
  flush(): Promise<void>;
  remove(artworkId: string): Promise<void>;
  /** Erases the progress of every artwork (index and bitsets). */
  removeAll(): Promise<void>;
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
    save(summary, bits) {
      set((s) => ({ index: { ...s.index, [summary.artworkId]: summary } }));
      repo.save(summary, bits);
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
  }));
}

export const useProgressStore = createProgressStore();
