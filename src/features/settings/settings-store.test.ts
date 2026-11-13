import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEnvelope, StorageKeys } from '@/lib/storage';

import { DEFAULT_SETTINGS, isSettings, migrateSettingsV0toV1 } from './settings-schema';
import { createSettingsStore } from './settings-store';

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

  it('resets to defaults', async () => {
    const store = createSettingsStore();
    await store.getState().update({ haptics: false });
    await store.getState().reset();
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});
