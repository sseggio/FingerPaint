import AsyncStorage from '@react-native-async-storage/async-storage';

import { getRegistry, setRemoteContent, type RemoteContent } from '@/features/artwork/registry';
import { isNewEntry } from '@/lib/catalog/catalog-index';
import { StorageKeys } from '@/lib/storage';

import { CONFIG, FakeCatalog, makeSource, memoryFiles, PETS } from './__fixtures__/fake-catalog';
import { readCatalogConfig } from './catalog-config';
import { createCatalogStore, NEW_VISIT_AFTER_MS, SYNC_INTERVAL_MS, type CatalogStoreOptions } from './catalog-store';

const H = 3600_000;
let server: FakeCatalog;
let files: ReturnType<typeof memoryFiles>;
let clock: number;
let published: (RemoteContent | undefined)[];

beforeEach(async () => {
  await AsyncStorage.clear();
  server = new FakeCatalog();
  files = memoryFiles();
  clock = 100 * H;
  published = [];
});

afterEach(() => setRemoteContent(undefined));

function store(overrides: Partial<CatalogStoreOptions> = {}) {
  return createCatalogStore({
    config: CONFIG,
    fetch: server.fetch,
    files,
    now: () => clock,
    hasProgress: () => false,
    progressReady: () => true,
    publish: (c) => published.push(c),
    ...overrides,
  });
}

const ids = (c: RemoteContent | undefined) => (c?.artworks ?? []).map((a) => (a as { id: string }).id);

describe('catalog store', () => {
  it('is disabled without a valid HTTPS URL: no network, no registry change', async () => {
    expect(readCatalogConfig('')).toBeNull();
    expect(readCatalogConfig(undefined)).toBeNull();
    expect(readCatalogConfig('http://catalog.test')).toBeNull();
    const s = store({ config: null });
    await s.getState().hydrate();
    await s.getState().sync();
    await s.getState().onForeground();
    await s.getState().onBackground();
    expect(s.getState()).toMatchObject({ enabled: false, hydrated: true });
    expect(server.requests).toEqual([]);
    expect(published).toEqual([]);
    expect(await AsyncStorage.getItem(StorageKeys.catalog)).toBeNull();
  });

  it('syncs, persists, and restores the downloaded catalog offline', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }]);
    const s = store();
    await s.getState().hydrate();
    await s.getState().sync();
    expect(ids(published.at(-1))).toEqual(['kitten']);
    expect(await AsyncStorage.getItem(StorageKeys.catalog)).toContain('"kitten"');

    // Next launch, offline: everything already downloaded is there.
    server.offline = true;
    published = [];
    const again = store();
    await again.getState().hydrate();
    expect(ids(published[0])).toEqual(['kitten']);
    expect(again.getState().sources.kitten?.id).toBe('kitten');
    await again.getState().sync();
    expect(again.getState().sources.kitten?.id).toBe('kitten');
    // A failed sync does not republish (nor clear) the content.
    expect(published).toHaveLength(1);
  });

  it('drops entries whose file is missing or corrupt and forgets the ETag', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }, { source: makeSource('puppy') }]);
    const s = store();
    await s.getState().hydrate();
    await s.getState().sync();
    files.data.set('puppy.1.json', '{"id":"puppy"');
    files.data.set('orphan.3.json', '{}');
    const again = store();
    await again.getState().hydrate();
    expect(Object.keys(again.getState().index.entries)).toEqual(['kitten']);
    expect(again.getState().index.etag).toBeNull();
    expect(files.data.has('orphan.3.json')).toBe(false);
    // The next sync downloads it again (no If-None-Match).
    server.requests = [];
    await again.getState().sync();
    expect(server.manifestRequests()[0].init.headers['If-None-Match']).toBeUndefined();
    expect(Object.keys(again.getState().index.entries).sort()).toEqual(['kitten', 'puppy']);
  });

  it('waits for the progress index before syncing (withdrawn artworks must not be lost)', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }]);
    const s = store({ progressReady: () => false });
    await s.getState().hydrate();
    await s.getState().sync();
    expect(server.requests).toEqual([]);
  });

  it('deletes withdrawn files after saving the index, keeps the ones with progress', async () => {
    server.publish([PETS], [{ source: makeSource('gone') }, { source: makeSource('started') }]);
    const s = store({ hasProgress: (id) => id === 'started' });
    await s.getState().hydrate();
    await s.getState().sync();
    server.publish([PETS], [], { etag: '"m2"' });
    await s.getState().sync();
    expect([...files.data.keys()]).toEqual(['started.1.json']);
    expect(published.at(-1)?.artworks).toEqual([]);
    expect((published.at(-1)?.retired ?? []).map((a) => (a as { id: string }).id)).toEqual(['started']);
  });

  it('syncs on foreground only when the last attempt is older than 6 h', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }]);
    const s = store();
    await s.getState().hydrate();
    await s.getState().sync();
    clock += 2 * H;
    await s.getState().onForeground();
    expect(server.manifestRequests()).toHaveLength(1);
    clock += SYNC_INTERVAL_MS;
    await s.getState().onForeground();
    expect(server.manifestRequests()).toHaveLength(2);
  });

  it('flags artworks arrived since the previous visit as "New"', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }]);
    const s = store();
    await s.getState().hydrate();
    await s.getState().sync();
    // First sync of a fresh install: nothing is new.
    expect(isNewEntry(s.getState().index.entries.kitten, s.getState().newSince)).toBe(false);

    server.publish([PETS], [{ source: makeSource('kitten') }, { source: makeSource('hamster') }], { etag: '"m2"' });
    clock += 7 * H;
    await s.getState().onForeground();
    const { index, newSince } = s.getState();
    expect(isNewEntry(index.entries.hamster, newSince)).toBe(true);
    expect(isNewEntry(index.entries.kitten, newSince)).toBe(false);

    // Still new while the visit lasts, and after a short trip to the background.
    await s.getState().onBackground();
    clock += 60_000;
    await s.getState().onForeground();
    expect(isNewEntry(s.getState().index.entries.hamster, s.getState().newSince)).toBe(true);

    // A later visit (long absence) clears the badge; the visit time is persisted.
    await s.getState().onBackground();
    clock += NEW_VISIT_AFTER_MS;
    await s.getState().onForeground();
    expect(isNewEntry(s.getState().index.entries.hamster, s.getState().newSince)).toBe(false);
    const again = store();
    await again.getState().hydrate();
    expect(isNewEntry(again.getState().index.entries.hamster, again.getState().newSince)).toBe(false);
  });

  it('feeds the app registry (default publisher)', async () => {
    server.publish([PETS], [{ source: makeSource('kitten', 'pets', { pack: 'pets' }, 'Kitten') }]);
    const s = store({ publish: undefined });
    await s.getState().hydrate();
    await s.getState().sync();
    expect(getRegistry().getAlbum('pets')).toMatchObject({ pack: 'pets', order: 7 });
    expect(getRegistry().getArtwork('kitten')?.title.en).toBe('Kitten');
  });
});
