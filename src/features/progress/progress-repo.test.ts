import AsyncStorage from '@react-native-async-storage/async-storage';

import { bitsetToBase64, createBitset, setBit } from '@/lib/bitset';
import { createEnvelope, StorageKeys } from '@/lib/storage';

import { createProgressRepo, PROGRESS_RETRY_DELAY_MS, PROGRESS_SAVE_DELAY_MS } from './progress-repo';
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

  it('loadFilled sees the batch being written until multiSet resolves', async () => {
    let ack!: () => void;
    const backend = {
      getItem: jest.fn().mockResolvedValue(null),
      multiSet: jest.fn(
        () =>
          new Promise<void>((r) => {
            ack = r;
          }),
      ),
      removeItem: jest.fn().mockResolvedValue(undefined),
    };
    const repo = createProgressRepo({ backend });
    await repo.loadIndex();
    backend.getItem.mockClear();
    const bits = createBitset(BITS);
    setBit(bits, 9);
    repo.save(summary('cat', 1), bits);
    const flushing = repo.flush();
    for (let i = 0; i < 10 && backend.multiSet.mock.calls.length === 0; i++) await Promise.resolve();
    expect(backend.multiSet).toHaveBeenCalledTimes(1);
    expect(repo.hasPending()).toBe(false);
    // Storage has nothing yet (getItem → null), but the in-flight batch is returned.
    await expect(repo.loadFilled('cat', BITS)).resolves.toBe(bits);
    expect(backend.getItem).not.toHaveBeenCalled();
    ack();
    await flushing;
    await expect(repo.loadFilled('cat', BITS)).resolves.toBeUndefined();
    expect(backend.getItem).toHaveBeenCalledWith(StorageKeys.progress('cat'));
  });

  it('re-arms a retry timer after a failed write (with backoff)', async () => {
    jest.useFakeTimers();
    const backend = {
      getItem: jest.fn().mockResolvedValue(null),
      multiSet: jest
        .fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockRejectedValueOnce(new Error('disk full'))
        .mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
    };
    const repo = createProgressRepo({ backend });
    repo.save(summary('cat', 1), createBitset(BITS));
    await repo.flush();
    expect(backend.multiSet).toHaveBeenCalledTimes(1);
    expect(repo.hasPending()).toBe(true);

    // No new save and no explicit flush: the retry timer alone writes again.
    await jest.advanceTimersByTimeAsync(PROGRESS_RETRY_DELAY_MS);
    expect(backend.multiSet).toHaveBeenCalledTimes(2);
    expect(repo.hasPending()).toBe(true);

    // Second failure doubles the delay.
    await jest.advanceTimersByTimeAsync(PROGRESS_RETRY_DELAY_MS);
    expect(backend.multiSet).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(PROGRESS_RETRY_DELAY_MS);
    expect(backend.multiSet).toHaveBeenCalledTimes(3);
    expect(repo.hasPending()).toBe(false);

    // Success: no further timer.
    await jest.advanceTimersByTimeAsync(PROGRESS_RETRY_DELAY_MS * 20);
    expect(backend.multiSet).toHaveBeenCalledTimes(3);
  });

  it('does not resurrect an artwork removed before the index finished loading', async () => {
    const seed = createProgressRepo();
    seed.save(summary('cat', 1), createBitset(BITS));
    seed.save(summary('fish', 1), createBitset(BITS));
    await seed.flush();

    const repo = createProgressRepo();
    await repo.remove('cat');
    expect(Object.keys(await repo.loadIndex())).toEqual(['fish']);
    await expect(createProgressRepo().loadIndex()).resolves.toEqual({ fish: summary('fish', 1) });
  });

  it('forgets removed ids once the index without them has been written', async () => {
    const seed = createProgressRepo();
    seed.save(summary('cat', 1), createBitset(BITS));
    await seed.flush();

    const repo = createProgressRepo();
    await repo.remove('cat');
    // The artwork is colored again later and stored by another writer (e.g. a backup restore).
    const other = createProgressRepo();
    other.save(summary('cat', 2), createBitset(BITS));
    await other.flush();
    // The stale tombstone must not hide the new entry.
    expect((await repo.loadIndex()).cat?.filledCount).toBe(2);
  });

  it('a save before the index is loaded keeps the other stored entries', async () => {
    const seed = createProgressRepo();
    seed.save(summary('fish', 4), createBitset(BITS));
    await seed.flush();

    const repo = createProgressRepo();
    repo.save(summary('cat', 1), createBitset(BITS));
    await repo.flush();
    const index = await createProgressRepo().loadIndex();
    expect(Object.keys(index).sort()).toEqual(['cat', 'fish']);
    expect(index.fish.filledCount).toBe(4);
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

describe('progress store removeAll', () => {
  it('erases every artwork (index and bitsets), in memory and in storage', async () => {
    const store = createProgressStore(createProgressRepo());
    await store.getState().hydrate();
    const bits = createBitset(BITS);
    setBit(bits, 1);
    store.getState().save(summary('cat', 1), bits);
    store.getState().save(summary('fish', 1), bits);
    await store.getState().flush();

    await store.getState().removeAll();
    expect(store.getState().index).toEqual({});
    expect(await AsyncStorage.getItem(StorageKeys.progress('cat'))).toBeNull();
    expect(await AsyncStorage.getItem(StorageKeys.progress('fish'))).toBeNull();

    const fresh = createProgressStore(createProgressRepo());
    await fresh.getState().hydrate();
    expect(fresh.getState().index).toEqual({});
  });

  it('erases entries only known to storage when called before hydration, in one index write', async () => {
    const seed = createProgressStore(createProgressRepo());
    await seed.getState().hydrate();
    const bits = createBitset(BITS);
    setBit(bits, 3);
    seed.getState().save(summary('cat', 1), bits);
    seed.getState().save(summary('fish', 1), bits);
    await seed.getState().flush();
    multiSet.mockClear();
    // The AsyncStorage mock is already a jest.fn: a spyOn + mockRestore would strip its implementation.
    const multiRemove = AsyncStorage.multiRemove as jest.Mock;
    multiRemove.mockClear();

    // A cold store that never hydrated: its in-memory index is empty.
    const cold = createProgressStore(createProgressRepo());
    await cold.getState().removeAll();
    expect(multiSet).toHaveBeenCalledTimes(1);
    expect(multiSet.mock.calls[0][0].map(([key]: [string, string]) => key)).toEqual([StorageKeys.progressIndex]);
    expect(multiRemove).toHaveBeenCalledTimes(1);
    expect(multiRemove.mock.calls[0][0]).toEqual(
      expect.arrayContaining([StorageKeys.progress('cat'), StorageKeys.progress('fish')]),
    );
    expect(await AsyncStorage.getItem(StorageKeys.progress('cat'))).toBeNull();

    const fresh = createProgressStore(createProgressRepo());
    await fresh.getState().hydrate();
    expect(fresh.getState().index).toEqual({});
  });

  it('a reset during hydration wins: the stale stored index is not brought back', async () => {
    const seed = createProgressRepo();
    const bits = createBitset(BITS);
    seed.save(summary('cat', 1), bits);
    seed.save(summary('fish', 1), bits);
    await seed.flush();

    const store = createProgressStore(createProgressRepo());
    const hydrating = store.getState().hydrate();
    const resetting = store.getState().removeAll();
    await Promise.all([hydrating, resetting]);
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().index).toEqual({});
    expect(await AsyncStorage.getItem(StorageKeys.progress('cat'))).toBeNull();

    const fresh = createProgressStore(createProgressRepo());
    await fresh.getState().hydrate();
    expect(fresh.getState().index).toEqual({});
  });

  it('drops pending saves so they cannot be written after the reset', async () => {
    jest.useFakeTimers();
    const repo = createProgressRepo();
    await repo.loadIndex();
    const bits = createBitset(BITS);
    repo.save(summary('cat', 1), bits);
    await repo.removeAll();
    jest.advanceTimersByTime(PROGRESS_SAVE_DELAY_MS * 2);
    await repo.flush();
    expect(repo.hasPending()).toBe(false);
    expect(await AsyncStorage.getItem(StorageKeys.progress('cat'))).toBeNull();
    const fresh = createProgressRepo();
    expect(await fresh.loadIndex()).toEqual({});
  });
});
