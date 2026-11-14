import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { DEFAULT_ENTITLEMENTS } from '@/features/entitlements/can-access';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import type { AlbumSource, ArtworkSource } from '@/lib/artwork/types';
import { palette } from '@/theme';

import { AlbumCard, albumCardPropsEqual, type AlbumCardProps } from './album-card';
import { ArtworkTile } from './artwork-tile';
import { gridLayout } from './grid';
import { artworkRoute, parseLockReason } from './open-artwork';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'fr', languageTag: 'fr-FR' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./artwork-thumbnail', () => ({ ArtworkThumbnail: () => null }));

const push = router.push as jest.Mock;

const source = (id: string, access: ArtworkSource['access'] = 'free'): ArtworkSource => ({
  v: 1,
  id,
  album: 'garden',
  title: { fr: `Titre ${id}`, en: `Title ${id}` },
  w: 8,
  h: 8,
  palette: ['#FF0000', '#0000FF'],
  rows: Array.from({ length: 8 }, () => '4A4B'),
  access,
  difficulty: 1,
});

const garden: AlbumSource = { id: 'garden', title: { fr: 'Jardin', en: 'Garden' }, order: 0 };

beforeEach(() => {
  push.mockClear();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  useEntitlementsStore.setState({ entitlements: DEFAULT_ENTITLEMENTS });
});

describe('AlbumCard', () => {
  it('renders the title, x/y progress and an accessible label', async () => {
    const onPress = jest.fn();
    await render(
      <AlbumCard
        album={garden}
        artworks={[source('a'), source('b'), source('c')]}
        progress={{ completed: 1, inProgress: 1, total: 3, complete: false }}
        accent={palette.mint}
        onPress={onPress}
      />,
    );
    const card = screen.getByRole('button', { name: 'Album Jardin, 1 sur 3 terminées' });
    expect(within(card).getByText('Jardin')).toBeTruthy();
    expect(within(card).getByText('1/3')).toBeTruthy();
    expect(screen.queryByText('Complet !')).toBeNull();
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledWith('garden');
  });

  it('celebrates a complete album and marks pack albums', async () => {
    await render(
      <AlbumCard
        album={{ ...garden, pack: 'ocean' }}
        artworks={[source('a')]}
        progress={{ completed: 1, inProgress: 0, total: 1, complete: true }}
        accent={palette.violet}
        onPress={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /Album Jardin, complet/ })).toBeTruthy();
    expect(screen.getByText('Complet !')).toBeTruthy();
    expect(screen.getByText('Pack')).toBeTruthy();
  });
});

describe('AlbumCard memoization', () => {
  it('only re-renders when its own album progress changes', () => {
    const artworks = [source('a'), source('b')];
    const base: AlbumCardProps = {
      album: garden,
      artworks,
      progress: { completed: 1, inProgress: 0, total: 2, complete: false },
      accent: palette.mint,
      onPress: () => undefined,
    };
    // Another album changed: a new but equal progress object for this one.
    expect(albumCardPropsEqual(base, { ...base, progress: { ...base.progress } })).toBe(true);
    expect(albumCardPropsEqual(base, { ...base, progress: { ...base.progress, inProgress: 1 } })).toBe(false);
    expect(albumCardPropsEqual(base, { ...base, artworks: [...artworks] })).toBe(false);
  });
});

describe('navigation guard on locked artworks', () => {
  it('routes accessible artworks to coloring and locked ones to the shop', () => {
    expect(artworkRoute(source('a'), DEFAULT_ENTITLEMENTS)).toEqual({
      pathname: '/color/[artworkId]',
      params: { artworkId: 'a' },
    });
    expect(artworkRoute(source('p', 'pro'), DEFAULT_ENTITLEMENTS)).toEqual({ pathname: '/shop', params: { reason: 'pro' } });
    expect(artworkRoute(source('k', { pack: 'ocean' }), DEFAULT_ENTITLEMENTS)).toEqual({
      pathname: '/shop',
      params: { reason: 'pack' },
    });
    expect(artworkRoute(source('p', 'pro'), { pro: true, packs: [], source: 'mock' }).pathname).toBe('/color/[artworkId]');
  });

  it('a locked tile shows a discreet badge and opens the shop, never the coloring screen', async () => {
    await render(<ArtworkTile artwork={source('p', 'pro')} width={120} accent={palette.pink} />);
    const tile = screen.getByRole('button', { name: '« Titre p », inclus dans Pro. Voir la boutique' });
    expect(within(tile).getByText('Pro')).toBeTruthy();
    await fireEvent.press(tile);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ pathname: '/shop', params: { reason: 'pro' } });
  });

  it('a pack tile opens the shop until the pack is owned', async () => {
    const pack = source('k', { pack: 'ocean' });
    const { rerender } = await render(<ArtworkTile artwork={pack} width={120} accent={palette.pink} />);
    await fireEvent.press(screen.getByRole('button', { name: /fait partie d’un pack/ }));
    expect(push).toHaveBeenLastCalledWith({ pathname: '/shop', params: { reason: 'pack' } });

    useEntitlementsStore.setState({ entitlements: { pro: false, packs: ['ocean'], source: 'mock' } });
    await rerender(<ArtworkTile artwork={pack} width={120} accent={palette.pink} />);
    expect(screen.queryByText('Pack')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir « Titre k », pas encore commencé' }));
    expect(push).toHaveBeenLastCalledWith({ pathname: '/color/[artworkId]', params: { artworkId: 'k' } });
  });

  it('shows the progress state of an accessible tile', async () => {
    await render(
      <ArtworkTile
        artwork={source('a')}
        progress={{ status: 'completed', filledCount: 64, updatedAt: 1 }}
        width={120}
        accent={palette.pink}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ouvrir « Titre a », terminé' })).toBeTruthy();
  });

  it('validates the shop reason param', () => {
    expect(parseLockReason('pro')).toBe('pro');
    expect(parseLockReason(['pack'])).toBe('pack');
    expect(parseLockReason('free')).toBeNull();
    expect(parseLockReason(undefined)).toBeNull();
  });
});

describe('gridLayout', () => {
  it('fits 3 columns on a phone and more on a tablet', () => {
    expect(gridLayout(390)).toEqual({ columns: 3, tileWidth: 111 });
    expect(gridLayout(1024).columns).toBeGreaterThanOrEqual(6);
    expect(gridLayout(200).columns).toBe(2);
  });
});
