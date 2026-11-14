import { create } from 'zustand';

import { recordActivity, toDayKey, type DailyState, type DayKey } from '@/lib/daily';
import { defaultBackend, readValue, StorageKeys, writeValue, type StorageBackend } from '@/lib/storage';

import { dailySchema } from './daily-schema';

export interface DailyStoreState {
  daily: DailyState;
  hydrated: boolean;
  /** Loads `fp:daily` (defaults on missing/corrupt data). Never rejects. */
  hydrate(): Promise<void>;
  /**
   * Marks today as colored (idempotent within a day; writes only when something changes).
   * Activity recorded before hydration is replayed on top of the stored state.
   */
  recordActivity(): Promise<void>;
  /** Replaces the whole state (backup import) and persists it. */
  replace(daily: DailyState): Promise<void>;
  /** Erases the streak (settings "reset progress"). */
  reset(): Promise<void>;
}

export interface DailyStoreOptions {
  backend?: StorageBackend;
  /** Injectable clock (tests). */
  now?: () => Date;
}

function warn(message: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') console.warn(`[daily] ${message}`);
}

export function createDailyStore(options: DailyStoreOptions = {}) {
  const backend = options.backend ?? defaultBackend;
  const now = options.now ?? (() => new Date());

  let writes: Promise<void> = Promise.resolve();
  const persist = (daily: DailyState) => {
    writes = writes.then(async () => {
      try {
        await writeValue(StorageKeys.daily, daily, dailySchema, backend);
      } catch (e) {
        warn(`write failed: ${String(e)}`);
      }
    });
    return writes;
  };

  /** Days recorded before the stored state was read (replayed by `hydrate`). */
  const early: DayKey[] = [];
  let canWrite = false;
  let replaced = false;

  return create<DailyStoreState>()((set, get) => ({
    daily: dailySchema.defaults(),
    hydrated: false,
    async hydrate() {
      const { data } = await readValue(StorageKeys.daily, dailySchema, backend);
      // Replaced (import / reset) while reading: the stored value is stale.
      if (replaced) {
        set({ hydrated: true });
        return;
      }
      canWrite = true;
      const merged = early.reduce(recordActivity, data);
      const changed = early.length > 0;
      early.length = 0;
      set({ daily: merged, hydrated: true });
      if (changed) await persist(merged);
    },
    async recordActivity() {
      const today = toDayKey(now());
      const current = get().daily;
      const next = recordActivity(current, today);
      if (next === current) return;
      if (!canWrite) early.push(today);
      set({ daily: next });
      if (canWrite) await persist(next);
    },
    async replace(daily) {
      // An explicit overwrite: earlier unsaved activity is superseded, and a late hydration
      // must not bring the old stored state back.
      early.length = 0;
      canWrite = true;
      replaced = true;
      set({ daily, hydrated: true });
      await persist(daily);
    },
    async reset() {
      await get().replace(dailySchema.defaults());
    },
  }));
}

export const useDailyStore = createDailyStore();
