import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SettingsScreen } from '@/screens/settings';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { useT } from './use-t';

const mockLocales = jest.fn(() => [{ languageCode: 'de', languageTag: 'de-DE' }]);

jest.mock('expo-localization', () => ({ useLocales: () => mockLocales() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

function Title() {
  const t = useT();
  return <Text>{t('tabs.settings')}</Text>;
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
});

describe('useT', () => {
  it('falls back to English for an unsupported system language', async () => {
    await render(<Title />);
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('follows a supported system language', async () => {
    mockLocales.mockReturnValueOnce([{ languageCode: 'fr', languageTag: 'fr-FR' }]);
    await render(<Title />);
    expect(screen.getByText('Réglages')).toBeTruthy();
  });

  it('switches language immediately when the setting changes', async () => {
    await render(<Title />);
    await act(async () => {
      await useSettingsStore.getState().update({ locale: 'fr' });
    });
    expect(screen.getByText('Réglages')).toBeTruthy();
  });
});

describe('SettingsScreen language picker', () => {
  it('persists the choice and re-renders the screen in the new language', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText('Language')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Français' }));
    expect(useSettingsStore.getState().settings.locale).toBe('fr');
    expect(screen.getByText('Langue')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Français' })).toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'Système' }));
    expect(useSettingsStore.getState().settings.locale).toBe('system');
    expect(screen.getByText('Follows your device language (English).')).toBeTruthy();
  });
});
