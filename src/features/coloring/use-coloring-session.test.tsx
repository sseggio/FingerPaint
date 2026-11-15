import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { createProgressRepo } from '@/features/progress/progress-repo';
import { createProgressStore } from '@/features/progress/progress-store';
import { journalCells } from '@/lib/fill-order';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { cellsOf, tinyArtwork } from './__fixtures__/tiny-artwork';
import { useColoringSession } from './use-coloring-session';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

const artwork = tinyArtwork();
const A = cellsOf(artwork, 0);
const B = cellsOf(artwork, 1);
const C = cellsOf(artwork, 2);

/** A store over the (mocked) AsyncStorage, as after an app start. */
async function freshStore() {
  const store = createProgressStore(createProgressRepo());
  await store.getState().hydrate();
  return store;
}

async function open(store: Awaited<ReturnType<typeof freshStore>>) {
  const hook = await renderHook(() => useColoringSession(artwork, { store }));
  await act(async () => {
    await Promise.resolve();
  });
  return hook;
}

/** Lets the frame coalescer and pending promises run. */
async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
});

describe('useColoringSession', () => {
  it('starts on the first color and rejects a wrong color with a light haptic only', async () => {
    const store = await freshStore();
    const { result } = await open(store);
    expect(result.current.session).not.toBeNull();
    expect(result.current.activeColor).toBe(0);
    expect(result.current.completion).toBe('none');

    await act(async () => result.current.fill([B[0]], 'tap'));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(result.current.session?.filledCount).toBe(0);
    expect(store.getState().index.tiny).toBeUndefined();

    // A drag over other colors is not an error: no haptic.
    await act(async () => result.current.fill([B[1]], 'drag'));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('respects the haptics setting', async () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, haptics: false } });
    const { result } = await open(await freshStore());
    await act(async () => result.current.fill([B[0]], 'tap'));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('bumps the revision once per frame for several batches', async () => {
    const { result } = await open(await freshStore());
    const before = result.current.revision;
    await act(async () => {
      result.current.fill([A[0]], 'tap');
      result.current.fill([A[1]], 'tap');
      result.current.fill(A.slice(2, 6), 'drag');
    });
    await nextFrame();
    expect(result.current.revision).toBe(before + 1);
    expect(result.current.session?.filledCount).toBe(6);
  });

  it('moves to the next color when one is done and celebrates the end once', async () => {
    const { result } = await open(await freshStore());
    await act(async () => result.current.fill(A, 'drag'));
    expect(result.current.activeColor).toBe(1);
    // A light success haptic for each finished color (F23).
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    await act(async () => result.current.fill(B, 'drag'));
    expect(result.current.activeColor).toBe(2);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
    await act(async () => result.current.fill(C, 'drag'));
    expect(result.current.completion).toBe('celebrate');
    await act(async () => result.current.fill(C, 'drag'));
    // The artwork's success haptic belongs to the celebration, played by the screen after the replay.
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
  });

  describe('pause on a finished color before the next one (F23)', () => {
    async function openWithDelay() {
      const store = await freshStore();
      const hook = await renderHook(() => useColoringSession(artwork, { store, advanceDelayMs: 600 }));
      await act(async () => {
        await Promise.resolve();
      });
      jest.useFakeTimers();
      return hook;
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it('keeps the finished color active for the delay, then selects the next one', async () => {
      const { result } = await openWithDelay();
      await act(async () => result.current.fill(A, 'drag'));
      expect(result.current.session?.colorFilled[0]).toBe(A.length);
      expect(result.current.activeColor).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(599);
      });
      expect(result.current.activeColor).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.activeColor).toBe(1);
    });

    it('a fill during the pause moves on first and is meant for the next color', async () => {
      const { result } = await openWithDelay();
      await act(async () => result.current.fill(A, 'drag'));
      await act(async () => result.current.fill([B[0]], 'tap'));
      expect(result.current.activeColor).toBe(1);
      expect(result.current.session?.colorFilled[1]).toBe(1);
      // The scheduled move does not happen twice.
      await act(async () => result.current.selectColor(2));
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.activeColor).toBe(2);
    });

    it('a color chosen by the user during the pause wins', async () => {
      const { result } = await openWithDelay();
      await act(async () => result.current.fill(A, 'drag'));
      await act(async () => result.current.selectColor(2));
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.activeColor).toBe(2);
    });

    it('nothing fires after the screen is left', async () => {
      const { result, unmount } = await openWithDelay();
      const setTimer = jest.spyOn(globalThis, 'setTimeout');
      const clearTimer = jest.spyOn(globalThis, 'clearTimeout');
      await act(async () => result.current.fill(A, 'drag'));
      const index = setTimer.mock.calls.findIndex(([, ms]) => ms === 600);
      expect(index).toBeGreaterThanOrEqual(0);
      const timer = setTimer.mock.results[index].value as ReturnType<typeof setTimeout>;
      await act(async () => unmount());
      expect(clearTimer).toHaveBeenCalledWith(timer);
      setTimer.mockRestore();
      clearTimer.mockRestore();
    });
  });

  it('autosaves, flushes on unmount and restores the exact state when coming back', async () => {
    const store = await freshStore();
    const first = await open(store);
    await act(async () => first.result.current.fill(A.slice(0, 5), 'drag'));
    await act(async () => first.result.current.selectColor(2));
    await act(async () => first.result.current.fill(C, 'drag'));
    // Saved in the index right away, written to storage on unmount (no 400 ms wait).
    expect(store.getState().index.tiny?.filledCount).toBe(9);
    const filled = first.result.current.session!.filled.slice();
    await act(async () => first.unmount());
    await nextFrame();
    expect(AsyncStorage.multiSet).toHaveBeenCalled();

    // App restart: a new store reads storage back.
    const reopened = await open(await freshStore());
    const session = reopened.result.current.session!;
    expect(session.filled).toEqual(filled);
    expect(session.filledCount).toBe(9);
    expect(Array.from(session.colorFilled)).toEqual([5, 0, 4]);
    expect(reopened.result.current.activeColor).toBe(0);
    expect(reopened.result.current.completion).toBe('none');
  });

  it('reopens a finished artwork as done, without celebrating again', async () => {
    const store = await freshStore();
    const first = await open(store);
    // Each completed color hands over to the next one.
    for (const cells of [A, B, C]) await act(async () => first.result.current.fill(cells, 'drag'));
    expect(store.getState().index.tiny?.status).toBe('completed');
    await act(async () => first.unmount());
    await nextFrame();

    const again = await open(await freshStore());
    expect(again.result.current.completion).toBe('done');
    await act(async () => again.result.current.fill(A, 'tap'));
    expect(again.result.current.completion).toBe('done');
    expect(again.result.current.session?.order.length).toBe(56);
  });

  it('journals the fill order, saves it and restores it with the progress', async () => {
    const store = await freshStore();
    const first = await open(store);
    await act(async () => first.result.current.fill([A[3], A[1], A[1], B[0]], 'drag'));
    await act(async () => first.result.current.fill([A[0]], 'tap'));
    expect(Array.from(journalCells(first.result.current.session!.order))).toEqual([A[3], A[1], A[0]]);
    await act(async () => first.unmount());
    await nextFrame();

    const reopened = await open(await freshStore());
    expect(Array.from(journalCells(reopened.result.current.session!.order))).toEqual([A[3], A[1], A[0]]);
    await act(async () => reopened.result.current.fill([A[2]], 'tap'));
    expect(Array.from(journalCells(reopened.result.current.session!.order))).toEqual([A[3], A[1], A[0], A[2]]);
  });

  it('reports daily activity on the first fill of each local day only', async () => {
    const store = await freshStore();
    const onDailyActivity = jest.fn();
    let time = new Date(2026, 10, 9, 23, 58).getTime();
    const { result } = await renderHook(() =>
      useColoringSession(artwork, { store, now: () => time, onDailyActivity }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    // A wrong color changes nothing and does not count.
    await act(async () => result.current.fill([B[0]], 'tap'));
    expect(onDailyActivity).not.toHaveBeenCalled();
    await act(async () => result.current.fill([A[0]], 'tap'));
    await act(async () => result.current.fill([A[1]], 'tap'));
    expect(onDailyActivity).toHaveBeenCalledTimes(1);
    time = new Date(2026, 10, 10, 0, 1).getTime(); // past local midnight
    await act(async () => result.current.fill([A[2]], 'tap'));
    expect(onDailyActivity).toHaveBeenCalledTimes(2);
  });
});
