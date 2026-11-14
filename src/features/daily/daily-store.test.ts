import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEnvelope, StorageKeys } from '@/lib/storage';

import { createDailyStore } from './daily-store';

const multiSet = AsyncStorage.multiSet as jest.Mock;

/** Clock returning local dates (device time zone), advanced by the test. */
function clock(start: [number, number, number]) {
  let date = new Date(start[0], start[1] - 1, start[2], 12, 0);
  return {
    now: () => date,
    set: (y: number, m: number, d: number, h = 12) => {
      date = new Date(y, m - 1, d, h, 0);
    },
  };
}

async function stored() {
  return JSON.parse((await AsyncStorage.getItem(StorageKeys.daily)) ?? 'null');
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('useDailyStore', () => {
  it('records activity once a day in a versioned envelope', async () => {
    const c = clock([2026, 11, 9]);
    const store = createDailyStore({ now: c.now });
    await store.getState().hydrate();
    await store.getState().recordActivity();
    await store.getState().recordActivity(); // same day: no second write
    expect(multiSet).toHaveBeenCalledTimes(1);
    expect(await stored()).toMatchObject({
      schemaVersion: 1,
      data: { lastActiveDay: '2026-11-09', streak: 1, best: 1 },
    });
    c.set(2026, 11, 11, 23); // Tuesday missed: a joker covers it
    await store.getState().recordActivity();
    expect(store.getState().daily).toMatchObject({ streak: 2, jokerDays: ['2026-11-10'] });

    const reloaded = createDailyStore({ now: c.now });
    await reloaded.getState().hydrate();
    expect(reloaded.getState().daily).toEqual(store.getState().daily);
  });

  it.each([
    ['unparsable JSON', '{"schemaVersion":1,'],
    ['invalid state', JSON.stringify(createEnvelope({ lastActiveDay: 'nope', streak: 1 }, 1))],
    ['unknown version', JSON.stringify(createEnvelope({}, 9))],
  ])('falls back to an empty streak on %s', async (_name, raw) => {
    await AsyncStorage.setItem(StorageKeys.daily, raw);
    const store = createDailyStore({ now: clock([2026, 11, 9]).now });
    await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ hydrated: true, daily: { streak: 0, lastActiveDay: null } });
  });

  it('replays activity recorded before hydration on top of the stored streak', async () => {
    await AsyncStorage.setItem(
      StorageKeys.daily,
      JSON.stringify(
        createEnvelope({ lastActiveDay: '2026-11-08', streak: 5, best: 7, jokerDays: [], activeDays: ['2026-11-08'] }, 1),
      ),
    );
    multiSet.mockClear();
    const store = createDailyStore({ now: clock([2026, 11, 9]).now });
    await store.getState().recordActivity(); // before hydration: not written yet
    expect(multiSet).not.toHaveBeenCalled();
    await store.getState().hydrate();
    expect(store.getState().daily).toMatchObject({ streak: 6, best: 7, lastActiveDay: '2026-11-09' });
    expect((await stored()).data.streak).toBe(6);
  });
});
