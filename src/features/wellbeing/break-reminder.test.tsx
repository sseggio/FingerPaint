import { act, renderHook } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { breakTimer, useBreakReminder } from './break-reminder';

const MIN = 60_000;

beforeEach(() => {
  jest.useFakeTimers();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, sessionTimerMin: 10 }, hydrated: true });
  breakTimer.pause();
  breakTimer.reset();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('useBreakReminder', () => {
  it('shows a dismissible reminder after the chosen active time', async () => {
    const { result } = await renderHook(() => useBreakReminder(true));
    expect(result.current.visible).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(10 * MIN);
    });
    expect(result.current).toMatchObject({ visible: true, minutes: 10 });
    await act(async () => {
      result.current.dismiss();
    });
    expect(result.current.visible).toBe(false);
  });

  it('does not count time while inactive', async () => {
    const { result } = await renderHook(() => useBreakReminder(false));
    await act(async () => {
      jest.advanceTimersByTime(60 * MIN);
    });
    expect(result.current.visible).toBe(false);
    expect(breakTimer.activeMs()).toBe(0);
  });

  it('is off with a 0-minute setting', async () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, sessionTimerMin: 0 } });
    const { result } = await renderHook(() => useBreakReminder(true));
    await act(async () => {
      jest.advanceTimersByTime(60 * MIN);
    });
    expect(result.current.visible).toBe(false);
  });
});
