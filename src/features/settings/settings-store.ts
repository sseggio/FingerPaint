import { create } from 'zustand';

import { readValue, StorageKeys, writeValue, type StorageBackend, defaultBackend } from '@/lib/storage';

import { DEFAULT_SETTINGS, isSettings, settingsSchema, type Settings } from './settings-schema';

export interface SettingsState {
  settings: Settings;
  hydrated: boolean;
  /** Loads persisted settings (defaults on missing/corrupt data). Never rejects. */
  hydrate(): Promise<void>;
  /** Applies a patch and persists it (settings change rarely, so writes are immediate). */
  update(patch: Partial<Settings>): Promise<void>;
  reset(): Promise<void>;
}

export function createSettingsStore(backend: StorageBackend = defaultBackend) {
  const write = async (settings: Settings) => {
    try {
      await writeValue(StorageKeys.settings, settings, settingsSchema, backend);
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[settings] write failed: ${String(e)}`);
    }
  };
  // Writes are chained so two quick updates can never land in storage out of order.
  let writes: Promise<void> = Promise.resolve();
  const persist = (settings: Settings) => {
    writes = writes.then(() => write(settings));
    return writes;
  };

  // Keys changed before hydration finished (e.g. after the splash safety timeout): a late
  // hydration result must not overwrite them.
  const touched = new Set<keyof Settings>();
  /**
   * Writes are allowed only once the stored value has been read: before (hydration not started
   * yet) or during the read, persisting defaults + patch would clobber the stored settings.
   * `hydrate()` persists the merged result of those deferred changes.
   */
  let canWrite = false;

  return create<SettingsState>()((set, get) => ({
    settings: { ...DEFAULT_SETTINGS },
    hydrated: false,
    async hydrate() {
      const { data } = await readValue(StorageKeys.settings, settingsSchema, backend);
      canWrite = true;
      const current = get().settings;
      const local = Object.fromEntries([...touched].map((key) => [key, current[key]])) as Partial<Settings>;
      const merged: Settings = { ...data, ...local };
      const hadLocalChanges = touched.size > 0;
      touched.clear();
      set({ settings: merged, hydrated: true });
      // Writes made while hydrating were deferred; persist the merged result once.
      if (hadLocalChanges) await persist(merged);
    },
    async update(patch) {
      const next = { ...get().settings, ...patch };
      if (!isSettings(next)) throw new TypeError('invalid settings patch');
      if (!get().hydrated) for (const key of Object.keys(patch) as (keyof Settings)[]) touched.add(key);
      set({ settings: next });
      if (canWrite) await persist(next);
    },
    async reset() {
      const next = { ...DEFAULT_SETTINGS };
      if (!get().hydrated) for (const key of Object.keys(next) as (keyof Settings)[]) touched.add(key);
      set({ settings: next });
      if (canWrite) await persist(next);
    },
  }));
}

export const useSettingsStore = createSettingsStore();
