import AsyncStorage from '@react-native-async-storage/async-storage';

import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { createSettingsStore, useSettingsStore } from '@/features/settings/settings-store';
import { createEnvelope, StorageKeys } from '@/lib/storage';

import { hydrateStores } from './hydrate';

afterEach(() => {
  jest.useRealTimers();
});

describe('hydrateStores', () => {
  it('hydrates the settings and progress stores from storage', async () => {
    await AsyncStorage.multiSet([
      [StorageKeys.settings, JSON.stringify(createEnvelope({ ...DEFAULT_SETTINGS, theme: 'dark' }, 1))],
      [
        StorageKeys.progressIndex,
        JSON.stringify(
          createEnvelope(
            {
              entries: {
                cat: { artworkId: 'cat', filledCount: 3, status: 'in_progress', startedAt: 1, updatedAt: 2, activeMs: 0 },
              },
            },
            1,
          ),
        ),
      ],
    ]);
    await expect(hydrateStores()).resolves.toBe('done');
    expect(useSettingsStore.getState()).toMatchObject({ hydrated: true, settings: { theme: 'dark' } });
    expect(useProgressStore.getState().hydrated).toBe(true);
    expect(useProgressStore.getState().index.cat.filledCount).toBe(3);
  });

  it('still resolves when a hydrator fails', async () => {
    await expect(hydrateStores([() => Promise.reject(new Error('boom')), async () => undefined])).resolves.toBe('done');
  });

  it('gives up after the safety timeout so the splash never hangs', async () => {
    jest.useFakeTimers();
    const pending = hydrateStores([() => new Promise<void>(() => undefined)], 3000);
    jest.advanceTimersByTime(3000);
    await expect(pending).resolves.toBe('timeout');
  });

  it('a hydration finishing after the timeout does not overwrite settings changed meanwhile', async () => {
    jest.useFakeTimers();
    let release!: (raw: string | null) => void;
    const store = createSettingsStore({
      getItem: () =>
        new Promise<string | null>((r) => {
          release = r;
        }),
      multiSet: (pairs) => AsyncStorage.multiSet(pairs),
      removeItem: () => Promise.resolve(),
    });
    const late = store.getState().hydrate();
    const pending = hydrateStores([() => late], 3000);
    jest.advanceTimersByTime(3000);
    await expect(pending).resolves.toBe('timeout');

    // The app is now rendered with defaults; the user picks English.
    await store.getState().update({ locale: 'en' });
    release(JSON.stringify(createEnvelope({ ...DEFAULT_SETTINGS, locale: 'fr', theme: 'dark' }, 1)));
    await late;
    expect(store.getState().settings).toMatchObject({ locale: 'en', theme: 'dark' });
  });
});
