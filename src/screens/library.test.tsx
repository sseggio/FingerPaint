import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { LibraryScreen } from './library';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'fr', languageTag: 'fr-FR' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
});

describe('LibraryScreen (temporary list)', () => {
  it('lists bundled artworks with localized titles and opens one', async () => {
    await render(<LibraryScreen />);
    const row = screen.getByRole('button', { name: 'Ouvrir « Chat tigré »' });
    await fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/color/[artworkId]', params: { artworkId: 'tabby-cat' } });
  });
});
