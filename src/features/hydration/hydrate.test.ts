import AsyncStorage from '@react-native-async-storage/async-storage';

import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
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
});
