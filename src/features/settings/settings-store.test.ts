import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEnvelope, StorageKeys } from '@/lib/storage';

import { DEFAULT_SETTINGS, isSettings, migrateSettingsV0toV1, migrateSettingsV1toV2 } from './settings-schema';
import { createSettingsStore } from './settings-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Backend whose first read stays pending until released (slow storage at startup). */
function slowBackend() {
  const read = deferred<string | null>();
  const backend = {
    getItem: jest.fn(() => read.promise),
    multiSet: jest.fn((pairs: [string, string][]) => AsyncStorage.multiSet(pairs)),
    removeItem: jest.fn(() => Promise.resolve()),
  };
  return { backend, release: read.resolve };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('settings schema', () => {
  it('accepts defaults and rejects invalid values', () => {
    expect(isSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isSettings({ ...DEFAULT_SETTINGS, theme: 'neon' })).toBe(false);
    expect(isSettings({ ...DEFAULT_SETTINGS, sessionTimerMin: 15 })).toBe(false);
    expect(isSettings({ ...DEFAULT_SETTINGS, haptics: 'yes' })).toBe(false);
  });

  it('migrates v0 → v1', () => {
    expect(migrateSettingsV0toV1({ language: 'en', darkMode: true, colorblind: true, haptics: false })).toEqual({
      ...DEFAULT_SETTINGS,
      locale: 'en',
      theme: 'dark',
      colorblindSymbols: true,
      haptics: false,
    });
    expect(() => migrateSettingsV0toV1(null)).toThrow();
  });

  it('migrates only known v0 keys (unknown or renamed ones are dropped)', () => {
    const migrated = migrateSettingsV0toV1({
      language: 'fr',
      leftHanded: true,
      legacyFlag: true,
      colorblindSymbols: true,
      locale: 'en',
      theme: 'dark',
    });
    expect(migrated).toEqual({ ...DEFAULT_SETTINGS, locale: 'fr', leftHanded: true });
    expect(Object.keys(migrated as object).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    expect(isSettings(migrated)).toBe(true);
  });
});

describe('useSettingsStore', () => {
  it('hydrates defaults when nothing is stored', async () => {
    const store = createSettingsStore();
    expect(store.getState().hydrated).toBe(false);
    await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ hydrated: true, settings: DEFAULT_SETTINGS });
  });

  it('persists updates and hydrates them in a fresh store', async () => {
    const a = createSettingsStore();
    await a.getState().hydrate();
    await a.getState().update({ theme: 'dark', largeNumbers: true });
    const b = createSettingsStore();
    await b.getState().hydrate();
    expect(b.getState().settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', largeNumbers: true });
  });

  it('rejects invalid patches without changing state', async () => {
    const store = createSettingsStore();
    await expect(store.getState().update({ theme: 'neon' as never })).rejects.toThrow(TypeError);
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('hydrates a v0 record through the migration', async () => {
    await AsyncStorage.setItem(StorageKeys.settings, JSON.stringify({ language: 'fr', darkMode: false }));
    const store = createSettingsStore();
    await store.getState().hydrate();
    expect(store.getState().settings).toEqual({ ...DEFAULT_SETTINGS, locale: 'fr', theme: 'light' });
  });

  it.each([
    ['corrupt JSON', '{oops'],
    ['unknown version', JSON.stringify(createEnvelope({ ...DEFAULT_SETTINGS, theme: 'dark' }, 42))],
    ['invalid data', JSON.stringify(createEnvelope({ theme: 'dark' }, 1))],
  ])('falls back to defaults on %s', async (_name, raw) => {
    await AsyncStorage.setItem(StorageKeys.settings, raw);
    const store = createSettingsStore();
    await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ hydrated: true, settings: DEFAULT_SETTINGS });
  });

  it('migrates v1 settings to v2 (cosmetic toggles on by default, the rest kept)', async () => {
    const { neonTheme: _n, goldConfetti: _g, ...v1 } = { ...DEFAULT_SETTINGS, haptics: false, theme: 'dark' as const };
    await AsyncStorage.setItem(StorageKeys.settings, JSON.stringify(createEnvelope(v1, 1)));
    const store = createSettingsStore();
    await store.getState().hydrate();
    expect(store.getState().settings).toEqual({ ...DEFAULT_SETTINGS, haptics: false, theme: 'dark', neonTheme: true, goldConfetti: true });
    expect(migrateSettingsV1toV2({ ...v1, neonTheme: false })).toMatchObject({ neonTheme: false, goldConfetti: true });
    expect(migrateSettingsV1toV2('nope')).toBe('nope');
  });

  it('resets to defaults', async () => {
    const store = createSettingsStore();
    await store.getState().update({ haptics: false });
    await store.getState().reset();
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  describe('late hydration (after the splash timeout)', () => {
    const stored = { ...DEFAULT_SETTINGS, theme: 'dark' as const, haptics: false, locale: 'fr' as const };

    it('keeps settings changed while hydrating and merges the rest', async () => {
      const { backend, release } = slowBackend();
      const store = createSettingsStore(backend);
      const hydrating = store.getState().hydrate();
      await store.getState().update({ locale: 'en', largeNumbers: true });
      // The write is deferred: persisting defaults + patch now would clobber stored values.
      expect(backend.multiSet).not.toHaveBeenCalled();

      release(JSON.stringify(createEnvelope(stored, 1)));
      await hydrating;
      const expected = { ...stored, locale: 'en', largeNumbers: true };
      expect(store.getState()).toMatchObject({ hydrated: true, settings: expected });
      expect(backend.multiSet).toHaveBeenCalledTimes(1);

      const fresh = createSettingsStore();
      await fresh.getState().hydrate();
      expect(fresh.getState().settings).toEqual(expected);
    });

    it('applies the stored values untouched when nothing changed meanwhile', async () => {
      const { backend, release } = slowBackend();
      const store = createSettingsStore(backend);
      const hydrating = store.getState().hydrate();
      release(JSON.stringify(createEnvelope(stored, 1)));
      await hydrating;
      expect(store.getState().settings).toEqual(stored);
      expect(backend.multiSet).not.toHaveBeenCalled();
    });

    it('a reset while hydrating wins over the late result', async () => {
      const { backend, release } = slowBackend();
      const store = createSettingsStore(backend);
      const hydrating = store.getState().hydrate();
      await store.getState().reset();
      release(JSON.stringify(createEnvelope(stored, 1)));
      await hydrating;
      expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
    });

    it('defers an update made before hydration even started', async () => {
      await AsyncStorage.setItem(StorageKeys.settings, JSON.stringify(createEnvelope(stored, 1)));
      const store = createSettingsStore();
      await store.getState().update({ largeNumbers: true });
      // Nothing written yet: the stored settings must survive until they have been read.
      expect(JSON.parse((await AsyncStorage.getItem(StorageKeys.settings)) ?? '{}').data).toEqual(stored);
      await store.getState().hydrate();
      const expected = { ...stored, largeNumbers: true };
      expect(store.getState().settings).toEqual(expected);
      expect(JSON.parse((await AsyncStorage.getItem(StorageKeys.settings)) ?? '{}').data).toEqual(expected);
    });

    it('serializes writes so the last update always wins in storage', async () => {
      const releases: (() => void)[] = [];
      const backend = {
        getItem: jest.fn(() => Promise.resolve(null)),
        multiSet: jest.fn(
          (pairs: [string, string][]) =>
            new Promise<void>((resolve) => {
              releases.push(() => AsyncStorage.multiSet(pairs).then(resolve));
            }),
        ),
        removeItem: jest.fn(() => Promise.resolve()),
      };
      const store = createSettingsStore(backend);
      await store.getState().hydrate();
      const first = store.getState().update({ haptics: false });
      const second = store.getState().update({ theme: 'dark' });
      await Promise.resolve();
      // The second write waits for the first one to finish.
      expect(backend.multiSet).toHaveBeenCalledTimes(1);
      releases[0]();
      await first;
      expect(backend.multiSet).toHaveBeenCalledTimes(2);
      releases[1]();
      await second;
      const data = JSON.parse((await AsyncStorage.getItem(StorageKeys.settings)) ?? '{}').data;
      expect(data).toMatchObject({ haptics: false, theme: 'dark' });
    });

    it('writes immediately once hydrated', async () => {
      const store = createSettingsStore();
      await store.getState().hydrate();
      await store.getState().update({ haptics: false });
      expect(JSON.parse((await AsyncStorage.getItem(StorageKeys.settings)) ?? '{}').data.haptics).toBe(false);
    });
  });
});
