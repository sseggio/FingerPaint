import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { exportBackup, pickBackup, usePendingImportStore } from '@/features/backup/backup-io';
import { useDailyStore } from '@/features/daily/daily-store';
import { DEFAULT_ENTITLEMENTS } from '@/features/entitlements/can-access';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { createSettingsStore, useSettingsStore } from '@/features/settings/settings-store';
import { StorageKeys } from '@/lib/storage';

import { SettingsScreen } from './settings';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/backup/backup-io', () => {
  const actual = jest.requireActual('@/features/backup/backup-io');
  return { ...actual, exportBackup: jest.fn(async () => 'shared'), pickBackup: jest.fn(async () => ({ status: 'cancelled' })) };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

async function storedSettings() {
  return JSON.parse((await AsyncStorage.getItem(StorageKeys.settings)) ?? '{}').data;
}

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
const mockedExport = exportBackup as jest.Mock;
const mockedPick = pickBackup as jest.Mock;

const originalRemoveAll = useProgressStore.getState().removeAll;

afterEach(() => {
  // One test stubs removeAll on the shared store: never leak it to the next tests.
  useProgressStore.setState({ removeAll: originalRemoveAll });
});

beforeEach(async () => {
  await AsyncStorage.clear();
  // Hydrating enables writes; then start every test from the defaults.
  await useSettingsStore.getState().hydrate();
  await useSettingsStore.getState().reset();
});

describe('SettingsScreen', () => {
  it('shows every section with an accessible control for each setting', async () => {
    await render(<SettingsScreen />);
    for (const header of ['Settings', 'Language', 'Coloring', 'Accessibility', 'Well-being', 'Data']) {
      expect(screen.getByRole('header', { name: header })).toBeTruthy();
    }
    for (const name of [
      'Drag to fill',
      'Haptics',
      'Colorblind mode',
      'Large numbers',
      'High contrast',
      'Left-handed mode',
    ]) {
      expect(screen.getByRole('switch', { name })).toBeTruthy();
    }
    expect(screen.getByLabelText('Break reminder')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '20 min' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset progress' })).toBeTruthy();
  });

  it('persists a toggle: a fresh store hydrates it back', async () => {
    await render(<SettingsScreen />);
    const toggle = screen.getByRole('switch', { name: 'Colorblind mode' });
    expect(toggle).not.toBeChecked();
    await fireEvent.press(toggle);
    expect(useSettingsStore.getState().settings.colorblindSymbols).toBe(true);
    expect(screen.getByRole('switch', { name: 'Colorblind mode' })).toBeChecked();
    expect(await storedSettings()).toEqual({ ...DEFAULT_SETTINGS, colorblindSymbols: true });

    const fresh = createSettingsStore();
    await fresh.getState().hydrate();
    expect(fresh.getState().settings.colorblindSymbols).toBe(true);
  });

  it('shows cosmetic toggles only for what is owned', async () => {
    useEntitlementsStore.setState({ entitlements: DEFAULT_ENTITLEMENTS });
    await render(<SettingsScreen />);
    expect(screen.queryByRole('header', { name: 'Looks' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Neon theme' })).toBeNull();

    await act(async () => {
      useEntitlementsStore.setState({ entitlements: { pro: false, packs: ['neon'], source: 'mock' } });
    });
    await render(<SettingsScreen />);
    expect(screen.getByRole('header', { name: 'Looks' })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Golden confetti' })).toBeNull();
    await fireEvent.press(screen.getByRole('switch', { name: 'Neon theme' }));
    expect(useSettingsStore.getState().settings.neonTheme).toBe(false);
    expect((await storedSettings()).neonTheme).toBe(false);
    await act(async () => {
      useEntitlementsStore.setState({ entitlements: DEFAULT_ENTITLEMENTS });
    });
  });

  it('opens the shop from Settings, without pressure', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open the shop' }));
    expect(router.push).toHaveBeenCalledWith('/shop');
    router.push.mockClear();
  });

  it('opens About from Settings', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByRole('header', { name: 'About' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'About FingerPaint' }));
    expect(router.push).toHaveBeenCalledWith('/about');
    router.push.mockClear();
  });

  it('sets the session timer', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: '20 min' }));
    expect(useSettingsStore.getState().settings.sessionTimerMin).toBe(20);
    expect(screen.getByRole('radio', { name: '20 min' })).toBeSelected();
    expect((await storedSettings()).sessionTimerMin).toBe(20);
  });

  it('resets the progress only after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const removeAll = jest.fn(() => Promise.resolve());
    useProgressStore.setState({ removeAll });
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Reset progress' }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(removeAll).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2] as AlertButton[];
    expect(buttons.map((b) => b.style)).toEqual(['cancel', 'destructive']);
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(removeAll).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Progress reset.')).toBeTruthy();
    alert.mockRestore();
  });

  it('reset also erases the streak (fp:daily) and says so', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await useDailyStore.getState().replace({
      lastActiveDay: '2026-11-14',
      streak: 3,
      best: 5,
      jokerDays: [],
      activeDays: ['2026-11-14'],
    });
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Reset progress' }));
    expect(alert.mock.calls[0][1]).toBe('Every colored cell and your streak will be erased. This cannot be undone.');
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(useDailyStore.getState().daily).toMatchObject({ streak: 0, best: 0, lastActiveDay: null });
    expect(JSON.parse((await AsyncStorage.getItem(StorageKeys.daily)) ?? 'null').data.streak).toBe(0);
    alert.mockRestore();
  });

  it('exports a backup from the Data section', async () => {
    await render(<SettingsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Export a backup file of your progress' }));
    });
    expect(mockedExport).toHaveBeenCalledWith('Save your FingerPaint backup');
    mockedExport.mockResolvedValueOnce('unavailable');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Export a backup file of your progress' }));
    });
    expect(screen.getByText('Sharing is not available on this device.')).toBeTruthy();
  });

  it('imports: errors are explained, a valid file opens the confirmation', async () => {
    await render(<SettingsScreen />);
    const importButton = () => screen.getByRole('button', { name: 'Import a backup file' });
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(router.push).not.toHaveBeenCalled();

    mockedPick.mockResolvedValueOnce({ status: 'error', error: 'checksum' });
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(screen.getByText('This backup is damaged or was modified: it was not imported.')).toBeTruthy();

    const plan = { writes: [], daily: useDailyStore.getState().daily, settings: DEFAULT_SETTINGS, summary: {} };
    const backup = { createdAt: 1, unknownCount: 0, progress: new Map(), daily: plan.daily, settings: DEFAULT_SETTINGS };
    mockedPick.mockResolvedValueOnce({ status: 'ready', backup, plan });
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(usePendingImportStore.getState().pending).toEqual({ backup, plan });
    expect(router.push).toHaveBeenCalledWith('/backup-import');
  });
});
