import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { getArtwork } from '@/features/artwork/registry';
import { exportArtworkPng } from '@/features/gallery/export-artwork';
import type { ProgressSummary } from '@/features/progress/progress-schema';
import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { colors } from '@/theme';

import { GalleryScreen } from './gallery';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn(), navigate: jest.fn() },
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/features/library/artwork-thumbnail', () => ({ ArtworkThumbnail: () => null }));
jest.mock('@/features/gallery/export-artwork', () => ({ exportArtworkPng: jest.fn(async () => 'shared') }));

const exportPng = exportArtworkPng as jest.Mock;
const push = router.push as jest.Mock;
const navigate = router.navigate as jest.Mock;

function entry(artworkId: string, status: ProgressSummary['status'], updatedAt: number, filledCount = 10): ProgressSummary {
  const total = getArtwork(artworkId)?.totalCells ?? 0;
  const s: ProgressSummary = {
    artworkId,
    status,
    filledCount: status === 'completed' ? total : filledCount,
    startedAt: 1,
    updatedAt,
    activeMs: 0,
  };
  if (status === 'completed') s.completedAt = updatedAt;
  return s;
}

const DAY = 86_400_000;
const base = Date.UTC(2026, 10, 1);

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  useProgressStore.setState({ index: {}, hydrated: true });
});

describe('GalleryScreen', () => {
  it('shows an engaging empty state that leads to the Library', async () => {
    await render(<GalleryScreen />);
    expect(screen.getByRole('header', { name: 'My artworks' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Finished (0)' })).toBeSelected();
    expect(screen.getByText('Your wall is waiting')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to the Library' }));
    expect(navigate).toHaveBeenCalledWith('/');

    await fireEvent.press(screen.getByRole('radio', { name: 'In progress (0)' }));
    expect(screen.getByText('Nothing on the easel')).toBeTruthy();
  });

  it('lists finished and in-progress artworks, newest first', async () => {
    useProgressStore.setState({
      index: {
        frog: entry('frog', 'completed', base + DAY),
        owl: entry('owl', 'completed', base + 3 * DAY),
        'tabby-cat': entry('tabby-cat', 'in_progress', base + 2 * DAY),
        fox: entry('fox', 'in_progress', base + 5 * DAY),
        panda: entry('panda', 'new', base, 0),
      },
    });
    await render(<GalleryScreen />);
    expect(screen.getByRole('radio', { name: 'Finished (2)' })).toBeTruthy();
    const done = screen.getAllByLabelText(/finished on/).map((n) => n.props.accessibilityLabel as string);
    expect(done).toHaveLength(2);
    expect(done[0]).toMatch(/^“Owl/);
    expect(done[1]).toMatch(/^“Frog/);

    await fireEvent.press(screen.getByRole('radio', { name: 'In progress (2)' }));
    const open = screen.getAllByLabelText(/colored, last colored on/).map((n) => n.props.accessibilityLabel as string);
    expect(open).toHaveLength(2);
    expect(open[0]).toMatch(/fox/i);
  });

  it('opens the action sheet: continue, export (with background) and share', async () => {
    const progress = entry('tabby-cat', 'in_progress', base);
    useProgressStore.setState({ index: { 'tabby-cat': progress } });
    await render(<GalleryScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'In progress (1)' }));
    await fireEvent.press(screen.getByLabelText(/Tabby/));
    expect(screen.getByText('Unfinished: the current state is exported.')).toBeTruthy();
    expect(screen.getByText(/× .* px · no watermark/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Export .* as a PNG image/ }));
    });
    expect(exportPng).toHaveBeenCalledWith('tabby-cat', progress, colors.dark.background, 'export', 'Export the artwork');
    expect(await screen.findByText('Image ready!')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(/Tabby/));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Share / }));
    });
    // The background choice is remembered while the screen is open.
    expect(exportPng).toHaveBeenLastCalledWith('tabby-cat', progress, colors.dark.background, 'share', 'Share the artwork');

    await fireEvent.press(screen.getByLabelText(/Tabby/));
    await fireEvent.press(screen.getByRole('button', { name: /^Continue coloring/ }));
    expect(push).toHaveBeenCalledWith({ pathname: '/color/[artworkId]', params: { artworkId: 'tabby-cat' } });
  });

  it('reports a failed export', async () => {
    exportPng.mockRejectedValueOnce(new Error('boom'));
    useProgressStore.setState({ index: { frog: entry('frog', 'completed', base) } });
    await render(<GalleryScreen />);
    await fireEvent.press(screen.getByLabelText(/finished on/));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: /^Share / }));
    });
    expect(await screen.findByText('The image could not be created. Please try again.')).toBeTruthy();
  });
});
