import AsyncStorage from '@react-native-async-storage/async-storage';

import { bitsetToBase64, createBitset, setBit } from '@/lib/bitset';
import { createEnvelope, StorageKeys } from '@/lib/storage';

import { createProgressRepo, PROGRESS_SAVE_DELAY_MS } from './progress-repo';
import type { ProgressSummary } from './progress-schema';
import { createProgressStore } from './progress-store';

const BITS = 16 * 16;

function summary(artworkId: string, filledCount: number, updatedAt = 1000): ProgressSummary {
  return { artworkId, filledCount, status: 'in_progress', startedAt: 500, updatedAt, activeMs: 0 };
}

const multiSet = AsyncStorage.multiSet as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('progress repo', () => {
  it('coalesces N rapid saves into a single write (400 ms debounce)', async () => {
    jest.useFakeTimers();
    const repo = createProgressRepo();
    const bits = createBitset(BITS);
    for (let i = 0; i < 50; i++) {
      setBit(bits, i);
      repo.save(summary('cat', i + 1), bits);
      jest.advanceTimersByTime(100); // each save lands before the previous timer fires
    }
    expect(multiSet).not.toHaveBeenCalled();
    jest.advanceTimersByTime(PROGRESS_SAVE_DELAY_MS);
    await repo.flush();
    expect(multiSet).toHaveBeenCalledTimes(1);
    const pairs = multiSet.mock.calls[0][0] as [string, string][];
    expect(pairs.map(([k]) => k)).toEqual([StorageKeys.progressIndex, StorageKeys.progress('cat')]);
    expect(JSON.parse(pairs[0][1]).data.entries.cat.filledCount).toBe(50);
    expect(repo.hasPending()).toBe(false);
  });

  it('flush writes immediately and is a no-op when nothing is pending', async () => {
    jest.useFakeTimers();
    const repo = createProgressRepo();
    await repo.flush();
    expect(multiSet).not.toHaveBeenCalled();
    repo.save(summary('cat', 1), createBitset(BITS));
    await repo.flush();
    expect(multiSet).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(PROGRESS_SAVE_DELAY_MS * 2);
    await repo.flush();
    expect(multiSet).toHaveBeenCalledTimes(1);
  });

  it('round-trips the index and loads bitsets on demand', async () => {
    const writer = createProgressRepo();
    const bits = createBitset(BITS);
    setBit(bits, 3);
    setBit(bits, BITS - 1);
    writer.save(summary('cat', 2), bits);
    writer.save(summary('fish', 0), createBitset(BITS));
    await writer.flush();

    const reader = createProgressRepo();
    const getItem = AsyncStorage.getItem as jest.Mock;
    getItem.mockClear();
    const index = await reader.loadIndex();
    expect(Object.keys(index).sort()).toEqual(['cat', 'fish']);
    expect(index.cat).toEqual(summary('cat', 2));
    // Only the index is read during hydration, never the bitsets.
    expect(getItem.mock.calls.map(([k]) => k)).toEqual([StorageKeys.progressIndex]);

    await expect(reader.loadFilled('cat', BITS)).resolves.toEqual(bits);
    await expect(reader.loadFilled('missing', BITS)).resolves.toBeUndefined();
  });

  it('ignores corrupt bitsets, size mismatches and invalid index entries', async () => {
    await AsyncStorage.multiSet([
      [
        StorageKeys.progressIndex,
        JSON.stringify(
          createEnvelope(
            {
              entries: {
                cat: summary('cat', 1),
                bad: { artworkId: 'bad', filledCount: -1 },
                mismatched: summary('other', 1),
              },
            },
            1,
          ),
        ),
      ],
      [StorageKeys.progress('cat'), JSON.stringify(createEnvelope({ filled: '!!!!' }, 1))],
      [StorageKeys.progress('fish'), JSON.stringify(createEnvelope({ filled: bitsetToBase64(createBitset(8)) }, 1))],
      [StorageKeys.progress('frog'), '{broken'],
    ]);
    const repo = createProgressRepo();
    expect(Object.keys(await repo.loadIndex())).toEqual(['cat']);
    await expect(repo.loadFilled('cat', BITS)).resolves.toBeUndefined();
    await expect(repo.loadFilled('fish', BITS)).resolves.toBeUndefined();
    await expect(repo.loadFilled('frog', BITS)).resolves.toBeUndefined();
  });

  it('falls back to an empty index on a corrupt or unknown-version index', async () => {
    await AsyncStorage.setItem(StorageKeys.progressIndex, JSON.stringify(createEnvelope({ entries: {} }, 7)));
    await expect(createProgressRepo().loadIndex()).resolves.toEqual({});
    await AsyncStorage.setItem(StorageKeys.progressIndex, 'nope');
    await expect(createProgressRepo().loadIndex()).resolves.toEqual({});
  });

  it('retries a failed write on the next flush', async () => {
    const backend = {
      getItem: jest.fn().mockResolvedValue(null),
      multiSet: jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
    };
    const repo = createProgressRepo({ backend });
    repo.save(summary('cat', 1), createBitset(BITS));
    await repo.flush();
    expect(repo.hasPending()).toBe(true);
    await repo.flush();
    expect(backend.multiSet).toHaveBeenCalledTimes(2);
    expect(repo.hasPending()).toBe(false);
  });

  it('removes an artwork from the index and storage', async () => {
    const repo = createProgressRepo();
    repo.save(summary('cat', 1), createBitset(BITS));
    await repo.flush();
    await repo.remove('cat');
    expect(await AsyncStorage.getItem(StorageKeys.progress('cat'))).toBeNull();
    await expect(createProgressRepo().loadIndex()).resolves.toEqual({});
  });
});

describe('useProgressStore', () => {
  it('hydrates the index, saves with debounce and loads bitsets lazily', async () => {
    jest.useFakeTimers();
    const store = createProgressStore(createProgressRepo());
    await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ hydrated: true, index: {} });

    const bits = createBitset(BITS);
    setBit(bits, 7);
    store.getState().save(summary('cat', 1), bits);
    store.getState().save(summary('cat', 1, 2000), bits);
    expect(store.getState().index.cat.updatedAt).toBe(2000);
    jest.advanceTimersByTime(PROGRESS_SAVE_DELAY_MS);
    await store.getState().flush();
    expect(multiSet).toHaveBeenCalledTimes(1);

    const fresh = createProgressStore(createProgressRepo());
    await fresh.getState().hydrate();
    expect(fresh.getState().index.cat.updatedAt).toBe(2000);
    expect(fresh.getState()).not.toHaveProperty('filled');
    await expect(fresh.getState().loadFilled('cat', BITS)).resolves.toEqual(bits);

    await fresh.getState().remove('cat');
    expect(fresh.getState().index).toEqual({});
  });
});
