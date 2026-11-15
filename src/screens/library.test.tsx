import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { listArtworks, listByAlbum, setRemoteContent } from '@/features/artwork/registry';
import { useCatalogStore } from '@/features/catalog/catalog-store';
import type { ProgressSummary } from '@/features/progress/progress-schema';
import { useDailyStore } from '@/features/daily/daily-store';
import { dailyArtwork, dailyPool } from '@/features/daily/daily-artwork';
import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { LibraryScreen } from './library';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn() },
    // The screen is always focused in these tests.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
// Skia thumbnails are covered by artwork-thumbnail.test.tsx.
jest.mock('@/features/library/artwork-thumbnail', () => ({ ArtworkThumbnail: () => null }));

const push = router.push as jest.Mock;

function entry(artworkId: string, status: ProgressSummary['status'], updatedAt: number, filledCount = 10): ProgressSummary {
  return { artworkId, status, filledCount, startedAt: 1, updatedAt, activeMs: 0 };
}

beforeEach(() => {
  push.mockClear();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  useProgressStore.setState({ index: {}, hydrated: true });
  useDailyStore.setState({
    daily: { lastActiveDay: null, streak: 0, best: 0, jokerDays: [], activeDays: [] },
    hydrated: true,
  });
});

describe('LibraryScreen', () => {
  it('shows album cards with their progress and opens an album', async () => {
    useProgressStore.setState({ index: { 'potted-cactus': entry('potted-cactus', 'completed', 5) } });
    await render(<LibraryScreen />);
    expect(screen.getByRole('header', { name: 'Library' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Albums' })).toBeTruthy();
    // No "Continue" section without artworks in progress.
    expect(screen.queryByRole('header', { name: 'Continue' })).toBeNull();
    // The pack album has content: listed, with its "Pack" badge.
    const deep = screen.getByRole('button', { name: 'Album Deep ocean, 0 of 8 finished' });
    expect(within(deep).getByText('Pack')).toBeTruthy();

    const garden = screen.getByRole('button', { name: 'Album Garden, 1 of 8 finished' });
    expect(within(garden).getByText('1/8')).toBeTruthy();
    await fireEvent.press(garden);
    expect(push).toHaveBeenCalledWith({ pathname: '/album/[albumId]', params: { albumId: 'garden' } });
  });

  it('lists artworks in progress, most recent first, and resumes one', async () => {
    useProgressStore.setState({
      index: {
        'tabby-cat': entry('tabby-cat', 'in_progress', 10),
        strawberry: entry('strawberry', 'in_progress', 20),
        'little-rocket': entry('little-rocket', 'completed', 30),
      },
    });
    await render(<LibraryScreen />);
    expect(screen.getByRole('header', { name: 'Continue' })).toBeTruthy();
    const cards = screen.getAllByRole('button', { name: /^Resume/ });
    expect(cards.map((c) => c.props.accessibilityLabel)).toEqual([
      expect.stringContaining('Strawberry'),
      expect.stringContaining('Tabby cat'),
    ]);
    await fireEvent.press(cards[0]);
    expect(push).toHaveBeenCalledWith({ pathname: '/color/[artworkId]', params: { artworkId: 'strawberry' } });
  });

  it('updates the progress when it changes (back from coloring)', async () => {
    await render(<LibraryScreen />);
    expect(screen.getByRole('button', { name: 'Album Animals, 0 of 8 finished' })).toBeTruthy();
    await act(async () => {
      useProgressStore.setState({ index: { 'tabby-cat': entry('tabby-cat', 'completed', 40) } });
    });
    expect(screen.getByRole('button', { name: 'Album Animals, 1 of 8 finished' })).toBeTruthy();
    expect(screen.getByText('1 finished · 0 in progress')).toBeTruthy();
    const animals = listByAlbum('animals');
    await act(async () => {
      useProgressStore.setState({ index: Object.fromEntries(animals.map((a, i) => [a.id, entry(a.id, 'completed', 50 + i)])) });
    });
    expect(screen.getByRole('button', { name: 'Album Animals, complete! All 8 artworks finished' })).toBeTruthy();
  });

  it('filters artworks by difficulty and status', async () => {
    useProgressStore.setState({ index: { strawberry: entry('strawberry', 'completed', 5) } });
    await render(<LibraryScreen />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Hard' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Finished' }));
    expect(screen.getByText('Nothing here yet. Try another filter!')).toBeTruthy();

    const [, allStatuses] = screen.getAllByRole('radio', { name: 'All' });
    await fireEvent.press(allStatuses);
    await fireEvent.press(screen.getByRole('radio', { name: 'Medium' }));
    const medium = listArtworks().filter((a) => a.difficulty === 2).length;
    expect(screen.getByRole('header', { name: `${medium} artworks` })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open “Little rocket”, not started' })).toBeTruthy();

    const [allDifficulties] = screen.getAllByRole('radio', { name: 'All' });
    await fireEvent.press(allDifficulties);
    await fireEvent.press(screen.getByRole('radio', { name: 'Finished' }));
    expect(screen.getByRole('button', { name: 'Open “Strawberry”, finished' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Little rocket/ })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('header', { name: 'Albums' })).toBeTruthy();
  });

  describe('downloaded catalog', () => {
    const strawberry = listArtworks().find((a) => a.id === 'strawberry')!;
    const kitten = { ...strawberry, id: 'kitten', album: 'pets', title: { fr: 'Chaton', en: 'Kitten' } };
    const puppy = { ...strawberry, id: 'puppy', album: 'pets', access: 'pro' as const, title: { fr: 'Chiot', en: 'Puppy' } };
    const tulip = { ...strawberry, id: 'tulip', album: 'garden', title: { fr: 'Tulipe', en: 'Tulip' } };
    const catalogEntry = (id: string, album: string, addedAt: number) => ({
      id,
      album,
      rev: 1,
      sha256: 'a'.repeat(64),
      publishedAt: '2026-11-15T10:00:00.000Z',
      addedAt,
      retired: false,
    });

    beforeEach(() => {
      setRemoteContent({
        albums: [{ id: 'pets', title: { fr: 'Animaux de compagnie', en: 'Pets' }, access: 'free', order: 1 }],
        artworks: [kitten, puppy, tulip],
        retired: [],
      });
      useCatalogStore.setState({
        newSince: 1_000,
        index: {
          ...useCatalogStore.getState().index,
          entries: {
            kitten: catalogEntry('kitten', 'pets', 5_000),
            puppy: catalogEntry('puppy', 'pets', 0),
            tulip: catalogEntry('tulip', 'garden', 500),
          },
        },
      });
    });

    afterEach(async () => {
      await act(async () => {
        setRemoteContent(undefined);
        useCatalogStore.setState({ newSince: 0, index: { ...useCatalogStore.getState().index, entries: {} } });
      });
    });

    it('adds remote albums and artworks, with a discreet "New" badge', async () => {
      await render(<LibraryScreen />);
      const pets = screen.getByRole('button', { name: 'Album Pets, 0 of 2 finished, new since your last visit' });
      expect(within(pets).getByText('New')).toBeTruthy();
      // The bundled album got a new artwork, added before the last visit: no badge.
      expect(screen.getByRole('button', { name: 'Album Garden, 0 of 9 finished' })).toBeTruthy();

      await fireEvent.press(screen.getByRole('radio', { name: 'Easy' }));
      const tile = screen.getByRole('button', { name: 'Open “Kitten”, not started, new since your last visit' });
      expect(within(tile).getByText('New')).toBeTruthy();
      expect(within(tile).getByText('Just arrived')).toBeTruthy();
      // Pro catalog artworks stay locked without a purchase.
      expect(screen.getByRole('button', { name: '“Puppy”, included with Pro. See the shop' })).toBeTruthy();
    });

    it('updates the library when the catalog changes, and keeps the daily pick on bundled artworks', async () => {
      const today = dailyArtwork('2026-11-14');
      await render(<LibraryScreen now={() => new Date(2026, 10, 14, 9, 0)} />);
      expect(screen.getByRole('button', { name: /^Album Pets/ })).toBeTruthy();
      await act(async () => setRemoteContent(undefined));
      expect(screen.queryByRole('button', { name: /^Album Pets/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'Album Garden, 0 of 8 finished' })).toBeTruthy();
      expect(['kitten', 'puppy', 'tulip']).not.toContain(today?.id);
      expect(screen.getByRole('button', { name: /^Artwork of the day/ }).props.accessibilityLabel).toContain(today?.title.en);
    });
  });

  describe('artwork of the day', () => {
    const now = () => new Date(2026, 10, 14, 9, 0);

    it('shows a free artwork, the streak and the jokers, and opens the coloring screen', async () => {
      const today = dailyArtwork('2026-11-14');
      expect(today).toBeDefined();
      expect(dailyPool(listArtworks()).map((a) => a.access)).toEqual(expect.arrayContaining(['free']));
      expect(today?.access).toBe('free');
      useDailyStore.setState({
        daily: { lastActiveDay: '2026-11-13', streak: 4, best: 4, jokerDays: ['2026-11-11'], activeDays: ['2026-11-13'] },
      });
      await render(<LibraryScreen now={now} />);
      const card = screen.getByRole('button', { name: /^Artwork of the day/ });
      expect(card.props.accessibilityLabel).toContain('4 days in a row');
      expect(card.props.accessibilityLabel).toContain('1 joker left this week');
      expect(within(card).getByText('Artwork of the day')).toBeTruthy();
      expect(within(card).getByText('New today')).toBeTruthy();
      await fireEvent.press(card);
      expect(push).toHaveBeenCalledWith({ pathname: '/color/[artworkId]', params: { artworkId: today?.id } });
    });

    it('invites to start (or restart, gently) without any guilt', async () => {
      await render(<LibraryScreen now={now} />);
      expect(screen.getByText('Color one cell to start a streak')).toBeTruthy();
      await act(async () => {
        useDailyStore.setState({
          daily: { lastActiveDay: '2026-11-02', streak: 9, best: 9, jokerDays: [], activeDays: ['2026-11-02'] },
        });
      });
      expect(screen.getByText('Here we go again!')).toBeTruthy();
      expect(screen.getByText('2 jokers left this week')).toBeTruthy();
    });
  });
});
