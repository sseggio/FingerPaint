import {
  applySync,
  emptyCatalogIndex,
  isCatalogIndex,
  isNewEntry,
  isSyncDue,
  newAlbumIds,
  planSync,
  type CatalogEntry,
  type CatalogIndex,
} from './catalog-index';
import type { Manifest, ManifestArtwork } from './manifest';

const SHA = 'b'.repeat(64);

function art(id: string, rev = 1, album = 'pets'): ManifestArtwork {
  return { id, album, rev, url: `https://c.test/catalog/v1/artworks/${id}.${rev}.json`, sha256: SHA, publishedAt: '2026-11-01T00:00:00.000Z' };
}

function manifest(artworks: ManifestArtwork[]): Manifest {
  return {
    v: 1,
    updatedAt: '2026-11-01T00:00:00.000Z',
    albums: [{ id: 'pets', title: { fr: 'Animaux', en: 'Pets' }, access: 'free', order: 6 }],
    artworks,
  };
}

function entry(id: string, rev = 1, addedAt = 100): CatalogEntry {
  return { id, album: 'pets', rev, sha256: SHA, publishedAt: '2026-10-01T00:00:00.000Z', addedAt, retired: false };
}

function index(entries: CatalogEntry[], extra: Partial<CatalogIndex> = {}): CatalogIndex {
  return { ...emptyCatalogIndex(), syncedAt: 50, entries: Object.fromEntries(entries.map((e) => [e.id, e])), ...extra };
}

const ctx = (progress: string[] = [], embedded: string[] = ['strawberry']) => ({
  embeddedIds: new Set(embedded),
  hasProgress: (id: string) => progress.includes(id),
});

describe('planSync', () => {
  it('downloads new artworks and higher revisions only', () => {
    const plan = planSync(
      manifest([art('kitten', 1), art('puppy', 3), art('parrot', 1), art('hamster', 1)]),
      index([entry('kitten', 1), entry('puppy', 2), entry('parrot', 2)]),
      ctx(),
    );
    expect(plan.download.map((a) => a.id)).toEqual(['puppy', 'hamster']);
    // Same revision: kept; lower revision (rollback): kept as is, never re-downloaded.
    expect(plan.keep.map((a) => a.id)).toEqual(['kitten', 'parrot']);
  });

  it('retires withdrawn artworks with progress and forgets the others', () => {
    const plan = planSync(manifest([art('kitten')]), index([entry('kitten'), entry('gone'), entry('started')]), ctx(['started']));
    expect(plan.retire).toEqual(['started']);
    expect(plan.remove).toEqual(['gone']);
  });

  it('ignores manifest artworks that collide with bundled ids', () => {
    const plan = planSync(manifest([art('strawberry'), art('kitten')]), index([]), ctx());
    expect(plan.collisions).toEqual(['strawberry']);
    expect(plan.download.map((a) => a.id)).toEqual(['kitten']);
  });

  it('brings a retired artwork back when it is listed again', () => {
    const plan = planSync(manifest([art('back')]), index([{ ...entry('back'), retired: true }]), ctx());
    expect(plan.keep.map((a) => a.id)).toEqual(['back']);
    const next = applySync(index([{ ...entry('back'), retired: true }]), manifest([art('back')]), plan, { downloaded: [], now: 900, etag: '"e"' });
    expect(next.entries.back.retired).toBe(false);
  });
});

describe('applySync', () => {
  it('records new artworks with their arrival time, keeps it on updates', () => {
    const before = index([entry('puppy', 2, 100)]);
    const m = manifest([art('puppy', 3), art('hamster')]);
    const plan = planSync(m, before, ctx());
    const next = applySync(before, m, plan, { downloaded: plan.download, now: 900, etag: '"v2"' });
    expect(next.entries.puppy).toMatchObject({ rev: 3, addedAt: 100 });
    expect(next.entries.hamster).toMatchObject({ rev: 1, addedAt: 900, retired: false });
    expect(next).toMatchObject({ etag: '"v2"', lastAttemptAt: 900, syncedAt: 900, albums: m.albums });
  });

  it('flags nothing as new on the very first sync', () => {
    const m = manifest([art('kitten')]);
    const plan = planSync(m, emptyCatalogIndex(), ctx());
    const next = applySync(emptyCatalogIndex(), m, plan, { downloaded: plan.download, now: 900, etag: null });
    expect(next.entries.kitten.addedAt).toBe(0);
    expect(isNewEntry(next.entries.kitten, 0)).toBe(false);
  });

  it('keeps the previous revision and forgets the ETag when a download failed', () => {
    const before = index([entry('puppy', 2)], { etag: '"old"' });
    const m = manifest([art('puppy', 3), art('hamster')]);
    const plan = planSync(m, before, ctx());
    const next = applySync(before, m, plan, { downloaded: [], now: 900, etag: '"new"' });
    expect(next.entries.puppy.rev).toBe(2);
    expect(next.entries.hamster).toBeUndefined();
    expect(next.etag).toBeNull();
  });

  it('drops removed artworks and marks retired ones', () => {
    const before = index([entry('gone'), entry('started')]);
    const m = manifest([]);
    const plan = planSync(m, before, ctx(['started']));
    const next = applySync(before, m, plan, { downloaded: [], now: 900, etag: '"e"' });
    expect(Object.keys(next.entries)).toEqual(['started']);
    expect(next.entries.started.retired).toBe(true);
  });
});

describe('"New" badge', () => {
  it('is shown for artworks added after the previous visit', () => {
    expect(isNewEntry(entry('a', 1, 500), 400)).toBe(true);
    expect(isNewEntry(entry('a', 1, 300), 400)).toBe(false);
    expect(isNewEntry(entry('a', 1, 0), 0)).toBe(false);
    expect(isNewEntry({ ...entry('a', 1, 500), retired: true }, 0)).toBe(false);
    expect(isNewEntry(undefined, 0)).toBe(false);
  });

  it('marks the albums holding new artworks', () => {
    const entries = { a: entry('a', 1, 500), b: { ...entry('b', 1, 100), album: 'garden' } };
    expect([...newAlbumIds(entries, 400)]).toEqual(['pets']);
  });
});

describe('index guard and throttle', () => {
  it('validates the stored index', () => {
    expect(isCatalogIndex(emptyCatalogIndex())).toBe(true);
    expect(isCatalogIndex(index([entry('kitten')], { albums: manifest([]).albums, etag: '"x"' }))).toBe(true);
    expect(isCatalogIndex(null)).toBe(false);
    expect(isCatalogIndex({ ...emptyCatalogIndex(), entries: { kitten: entry('other') } })).toBe(false);
    expect(isCatalogIndex({ ...emptyCatalogIndex(), entries: { kitten: { ...entry('kitten'), rev: 0 } } })).toBe(false);
    expect(isCatalogIndex({ ...emptyCatalogIndex(), lastAttemptAt: -1 })).toBe(false);
  });

  it('syncs again after 6 h (or when the clock went backwards)', () => {
    const H = 3600_000;
    expect(isSyncDue(0, 7 * H, 6 * H)).toBe(true);
    expect(isSyncDue(2 * H, 7 * H, 6 * H)).toBe(false);
    expect(isSyncDue(10 * H, 7 * H, 6 * H)).toBe(true);
  });
});
