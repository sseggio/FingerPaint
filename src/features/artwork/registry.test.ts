import { createRegistry, getArtwork, getRegistry, listAlbums, listByAlbum } from './registry';

describe('artwork registry (bundled content)', () => {
  it('lists albums in order', () => {
    expect(listAlbums().map((a) => a.id)).toEqual(['garden', 'ocean', 'kitchen', 'animals', 'space', 'deep-ocean']);
  });

  it('lists artworks by album', () => {
    expect(listByAlbum('garden').map((a) => a.id)).toEqual(['potted-cactus', 'happy-mushroom']);
    expect(listByAlbum('nowhere')).toEqual([]);
  });

  it('decodes every bundled artwork', () => {
    const sources = getRegistry().listArtworks();
    expect(sources).toHaveLength(6);
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
});
