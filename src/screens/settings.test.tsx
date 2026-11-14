import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

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
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

async function storedSettings() {
  return JSON.parse((await AsyncStorage.getItem(StorageKeys.settings)) ?? '{}').data;
}

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
});
