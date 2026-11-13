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

  return create<SettingsState>()((set, get) => ({
    settings: { ...DEFAULT_SETTINGS },
    hydrated: false,
    async hydrate() {
      const { data } = await readValue(StorageKeys.settings, settingsSchema, backend);
      set({ settings: data, hydrated: true });
    },
    async update(patch) {
      const next = { ...get().settings, ...patch };
      if (!isSettings(next)) throw new TypeError('invalid settings patch');
      set({ settings: next });
      await persist(next);
    },
    async reset() {
      const next = { ...DEFAULT_SETTINGS };
      set({ settings: next });
      await persist(next);
    },
  }));
}

export const useSettingsStore = createSettingsStore();
