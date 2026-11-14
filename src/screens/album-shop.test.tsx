import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { listByAlbum } from '@/features/artwork/registry';
import type { ProgressSummary } from '@/features/progress/progress-schema';
import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { AlbumScreen } from './album';
import { ShopScreen } from './shop';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    Stack: { Screen: () => null },
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock('@/features/library/artwork-thumbnail', () => ({ ArtworkThumbnail: () => null }));

const entry = (artworkId: string, status: ProgressSummary['status']): ProgressSummary => ({
  artworkId,
  status,
  filledCount: 5,
  startedAt: 1,
  updatedAt: 2,
  activeMs: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  useProgressStore.setState({ index: {}, hydrated: true });
});

describe('AlbumScreen', () => {
  it('shows the album banner and a tile per artwork', async () => {
    useProgressStore.setState({ index: { 'potted-cactus': entry('potted-cactus', 'completed') } });
    await render(<AlbumScreen albumId="garden" />);
    expect(screen.getByLabelText('Album Garden, 1 of 8 finished')).toBeTruthy();
    expect(screen.getByLabelText(/Album picture/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open “Potted cactus”, finished' })).toBeTruthy();
    const mushroom = screen.getByRole('button', { name: 'Open “Happy mushroom”, not started' });
    await fireEvent.press(mushroom);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/color/[artworkId]', params: { artworkId: 'happy-mushroom' } });
  });

  it('reveals the complete album', async () => {
    const animals = listByAlbum('animals');
    useProgressStore.setState({ index: Object.fromEntries(animals.map((a) => [a.id, entry(a.id, 'completed')])) });
    await render(<AlbumScreen albumId="animals" />);
    expect(screen.getByLabelText(/Album Animals, complete!/)).toBeTruthy();
  });

  it.each([['../etc'], ['Garden'], [''], [undefined], [['unknown-album']]])('rejects the param %p', async (param) => {
    await render(<AlbumScreen albumId={param} />);
    expect(screen.getByRole('header', { name: 'Album not found' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to the library' }));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('ShopScreen (placeholder)', () => {
  it('is an honest "coming soon" with the lock reason and a way back', async () => {
    await render(<ShopScreen reason="pro" />);
    expect(screen.getByRole('header', { name: 'Coming soon' })).toBeTruthy();
    expect(screen.getByText('This artwork will be included with Pro.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close the shop' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('ignores an invalid reason', async () => {
    await render(<ShopScreen reason="<script>" />);
    expect(screen.queryByText(/included with Pro|illustration pack/)).toBeNull();
  });
});
