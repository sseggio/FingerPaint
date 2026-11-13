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
  const persist = async (settings: Settings) => {
    try {
      await writeValue(StorageKeys.settings, settings, settingsSchema, backend);
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[settings] write failed: ${String(e)}`);
    }
  };

  // Keys changed before hydration finished (e.g. after the splash safety timeout): a late
  // hydration result must not overwrite them.
  const touched = new Set<keyof Settings>();
  let hydrating = false;

  return create<SettingsState>()((set, get) => ({
    settings: { ...DEFAULT_SETTINGS },
    hydrated: false,
    async hydrate() {
      hydrating = true;
      const { data } = await readValue(StorageKeys.settings, settingsSchema, backend);
      hydrating = false;
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
      // While a read is in flight, writing defaults + patch would clobber the stored values.
      if (!hydrating) await persist(next);
    },
    async reset() {
      const next = { ...DEFAULT_SETTINGS };
      if (!get().hydrated) for (const key of Object.keys(next) as (keyof Settings)[]) touched.add(key);
      set({ settings: next });
      if (!hydrating) await persist(next);
    },
  }));
}

export const useSettingsStore = createSettingsStore();
