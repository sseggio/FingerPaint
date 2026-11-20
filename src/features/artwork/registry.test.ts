import { canAccess, DEFAULT_ENTITLEMENTS } from '@/features/entitlements/can-access';
import type { ArtworkSource } from '@/lib/artwork/types';

import {
  createRegistry,
  getArtwork,
  getRegistry,
  getRegistryVersion,
  listAlbums,
  listByAlbum,
  setRemoteContent,
  type RemoteContent,
} from './registry';

describe('artwork registry (bundled content)', () => {
  it('lists albums in order', () => {
    expect(listAlbums().map((a) => a.id)).toEqual(['garden', 'ocean', 'kitchen', 'animals', 'space', 'deep-ocean']);
  });

  it('lists artworks by album', () => {
    const garden = listByAlbum('garden').map((a) => a.id);
    expect(garden).toHaveLength(8);
    expect(garden).toEqual(expect.arrayContaining(['potted-cactus', 'happy-mushroom', 'flower-garden']));
    expect(listByAlbum('deep-ocean')).toHaveLength(8);
    expect(listByAlbum('nowhere')).toEqual([]);
  });

  it('decodes every bundled artwork', () => {
    const sources = getRegistry().listArtworks();
    expect(sources).toHaveLength(50);
    for (const source of sources) {
      const art = getArtwork(source.id);
      expect(art).toBeDefined();
      if (!art) continue;
      expect(art.cells).toHaveLength(source.w * source.h);
      expect(art.palette.colors).toHaveLength(source.palette.length);
      expect(art.totalCells).toBe(art.colorCounts.reduce((sum, n) => sum + n, 0));
      art.colorCounts.forEach((n) => expect(n).toBeGreaterThan(0));
    }
  });

  it('caches decoded artworks', () => {
    expect(getArtwork('strawberry')).toBe(getArtwork('strawberry'));
    expect(getArtwork('missing')).toBeUndefined();
  });

  it('skips invalid content with a warning instead of crashing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const registry = createRegistry(
      { v: 1, albums: [{ id: 'garden', title: { fr: 'Jardin', en: 'Garden' }, order: 0 }] },
      [{ id: 'broken' }, 'nope'],
    );
    expect(registry.listArtworks()).toEqual([]);
    expect(registry.getArtwork('broken')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[broken]'));
    warn.mockRestore();
  });

  it('throws an explicit error on an invalid albums.json in strict (dev) mode', () => {
    expect(() => createRegistry({ v: 2, albums: 'nope' }, [], { strict: true })).toThrow(/albums\.json is invalid/);
  });

  it('degrades to an empty library on an invalid albums.json when not strict', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(createRegistry({ v: 2 }, []).listAlbums()).toEqual([]);
    warn.mockRestore();
  });
});

describe('registry merged with the downloaded catalog', () => {
  const { albumsData, artworkData } = jest.requireActual<typeof import('@/content')>('@/content');
  const strawberry = (artworkData as ArtworkSource[]).find((a) => a.id === 'strawberry')!;
  const src = (id: string, album: string, access: ArtworkSource['access'] = 'free'): ArtworkSource => ({ ...strawberry, id, album, access });
  const pets = { id: 'pets', title: { fr: 'Animaux', en: 'Pets' }, access: { pack: 'pets' }, order: 2 } as const;
  const early = { id: 'early', title: { fr: 'Tôt', en: 'Early' }, access: 'free', order: 0 } as const;
  const gardenAgain = { id: 'garden', title: { fr: 'Autre', en: 'Other' }, access: 'pro', order: 99 } as const;

  function merged(remote: Partial<RemoteContent>) {
    return createRegistry(albumsData, artworkData, { remote: { albums: [], artworks: [], retired: [], ...remote } });
  }

  // Ties on `order` are broken by id (kitchen and pets are both 2).
  it('adds remote albums by order; a bundled album keeps its metadata and gets new artworks', () => {
    const r = merged({ albums: [pets, early, gardenAgain], artworks: [src('kitten', 'pets'), src('tulip', 'garden')] });
    expect(r.listAlbums().map((a) => a.id)).toEqual(['early', 'garden', 'ocean', 'kitchen', 'pets', 'animals', 'space', 'deep-ocean']);
    expect(r.getAlbum('pets')).toEqual({ id: 'pets', title: { fr: 'Animaux', en: 'Pets' }, order: 2, pack: 'pets' });
    expect(r.getAlbum('garden')?.title.en).toBe('Garden');
    expect(r.listByAlbum('garden').at(-1)?.id).toBe('tulip');
    expect(r.listByAlbum('pets').map((a) => a.id)).toEqual(['kitten']);
    expect(r.listArtworks()).toHaveLength(artworkData.length + 2);
    expect(r.listEmbeddedArtworks()).toHaveLength(artworkData.length);
    expect(r.isRemote('kitten')).toBe(true);
    expect(r.isRemote('strawberry')).toBe(false);
    expect(r.getArtwork('kitten')?.totalCells).toBe(r.getArtwork('strawberry')?.totalCells);
  });

  it('keeps gating unchanged: pack / pro catalog artworks stay locked without a purchase', () => {
    const r = merged({ albums: [pets], artworks: [src('kitten', 'pets', { pack: 'pets' }), src('puppy', 'pets', 'pro'), src('fish', 'pets')] });
    const access = (id: string) => r.getArtworkSource(id)!.access;
    expect(canAccess(access('kitten'), DEFAULT_ENTITLEMENTS)).toBe(false);
    expect(canAccess(access('puppy'), DEFAULT_ENTITLEMENTS)).toBe(false);
    expect(canAccess(access('fish'), DEFAULT_ENTITLEMENTS)).toBe(true);
    expect(canAccess(access('kitten'), { pro: true, packs: [], source: 'mock' })).toBe(false);
    expect(canAccess(access('kitten'), { pro: false, packs: ['pets'], source: 'mock' })).toBe(true);
  });

  it('refuses collisions with bundled ids, unknown albums and invalid files', () => {
    const fake = { ...src('strawberry', 'garden'), title: { fr: 'Pirate', en: 'Pirate' } };
    const r = merged({ albums: [pets], artworks: [fake, src('lost', 'nowhere'), { id: 'junk' }, src('kitten', 'pets'), src('kitten', 'pets')] });
    expect(r.getArtworkSource('strawberry')?.title.en).not.toBe('Pirate');
    expect(r.isRemote('strawberry')).toBe(false);
    expect(r.getArtwork('lost')).toBeUndefined();
    expect(r.listByAlbum('pets')).toHaveLength(1);
  });

  it('keeps withdrawn artworks reachable for "My artworks" without listing them', () => {
    const r = merged({ albums: [], retired: [src('old-cat', 'gone-album')] });
    expect(r.listArtworks().some((a) => a.id === 'old-cat')).toBe(false);
    expect(r.listArtworksWithRetired().at(-1)?.id).toBe('old-cat');
    expect(r.getArtwork('old-cat')).toBeDefined();
  });

  it('rebuilds the app registry when the catalog changes', () => {
    const before = getRegistry();
    const version = getRegistryVersion();
    setRemoteContent({ albums: [pets], artworks: [src('kitten', 'pets')], retired: [] });
    try {
      expect(getRegistryVersion()).toBe(version + 1);
      expect(getRegistry()).not.toBe(before);
      expect(getArtwork('kitten')).toBeDefined();
      expect(listAlbums().some((a) => a.id === 'pets')).toBe(true);
    } finally {
      setRemoteContent(undefined);
    }
    expect(getArtwork('kitten')).toBeUndefined();
  });
});
