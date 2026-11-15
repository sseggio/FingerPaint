import { emptyCatalogIndex, type CatalogIndex } from '@/lib/catalog/catalog-index';
import { sha256Hex } from '@/lib/sha256';
import { encodeUtf8 } from '@/lib/utf8';

import { BASE, CONFIG, FakeCatalog, GARDEN, makeSource, memoryFiles, PETS } from './__fixtures__/fake-catalog';
import { httpGet } from './catalog-http';
import { syncCatalog, type SyncDeps } from './catalog-sync';

let server: FakeCatalog;
let files: ReturnType<typeof memoryFiles>;
let clock = 1_000;

beforeEach(() => {
  server = new FakeCatalog();
  files = memoryFiles();
  clock = 1_000;
});

function deps(index: CatalogIndex = emptyCatalogIndex(), overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    config: CONFIG,
    fetch: server.fetch,
    files,
    index,
    embeddedIds: new Set(['strawberry', 'fox']),
    embeddedAlbumIds: new Set(['garden', 'ocean']),
    hasProgress: () => false,
    now: () => clock,
    ...overrides,
  };
}

describe('syncCatalog', () => {
  it('downloads, verifies and stores new artworks', async () => {
    server.publish([PETS, GARDEN], [{ source: makeSource('kitten') }, { source: makeSource('tulip', 'garden') }]);
    const out = await syncCatalog(deps());
    expect(out.status).toBe('updated');
    if (out.status !== 'updated') return;
    expect([...out.downloaded.keys()].sort()).toEqual(['kitten', 'tulip']);
    expect([...files.data.keys()].sort()).toEqual(['kitten.1.json', 'tulip.1.json']);
    expect(out.index).toMatchObject({ etag: '"m1"', albums: [PETS, GARDEN], lastAttemptAt: 1_000 });
    expect(Object.keys(out.index.entries).sort()).toEqual(['kitten', 'tulip']);
  });

  it('sends anonymous requests: no cookies, no redirects, no identifying header', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }]);
    await syncCatalog(deps());
    expect(server.requests.length).toBe(2);
    for (const { init } of server.requests) {
      expect(init.credentials).toBe('omit');
      expect(init.redirect).toBe('error');
      expect(Object.keys(init.headers).every((h) => h === 'Accept' || h === 'If-None-Match')).toBe(true);
    }
    expect(server.requests[0].url).toBe(`${BASE}/catalog/v1/manifest.json`);
  });

  it('uses the ETag: a 304 changes nothing and downloads nothing', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }]);
    const first = await syncCatalog(deps());
    clock = 2_000;
    const second = await syncCatalog(deps(first.index));
    expect(second.status).toBe('not-modified');
    expect(server.manifestRequests()[1].init.headers['If-None-Match']).toBe('"m1"');
    expect(server.artworkRequests()).toHaveLength(1);
    expect(second.index.entries).toEqual(first.index.entries);
    expect(second.index.lastAttemptAt).toBe(2_000);
  });

  it('downloads only new artworks and higher revisions, and lists withdrawn files', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }, { source: makeSource('puppy') }, { source: makeSource('gone') }]);
    const first = await syncCatalog(deps());
    server.requests = [];
    server.publish(
      [PETS],
      [{ source: makeSource('kitten') }, { source: makeSource('puppy', 'pets', 'pro', 'Puppy v2'), rev: 2 }, { source: makeSource('hamster') }],
      { etag: '"m2"' },
    );
    clock = 5_000;
    const out = await syncCatalog(deps(first.index));
    if (out.status !== 'updated') throw new Error(out.status);
    expect(server.artworkRequests().map((r) => r.url.split('/').pop())).toEqual(['puppy.2.json', 'hamster.1.json']);
    expect(out.plan.remove).toEqual(['gone']);
    expect(out.obsoleteFiles.sort()).toEqual(['gone.1.json', 'puppy.1.json']);
    expect(out.downloaded.get('puppy')?.access).toBe('pro');
    expect(out.index.entries.hamster.addedAt).toBe(5_000);
    expect(out.index.entries.kitten.addedAt).toBe(0);
  });

  it('keeps withdrawn artworks the user has progress on', async () => {
    server.publish([PETS], [{ source: makeSource('started') }]);
    const first = await syncCatalog(deps());
    server.publish([PETS], [], { etag: '"m2"' });
    const out = await syncCatalog(deps(first.index, { hasProgress: (id) => id === 'started' }));
    if (out.status !== 'updated') throw new Error(out.status);
    expect(out.index.entries.started.retired).toBe(true);
    expect(out.obsoleteFiles).toEqual([]);
  });

  it('keeps the cache untouched when the network fails', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }]);
    const first = await syncCatalog(deps());
    server.offline = true;
    clock = 9_000;
    const out = await syncCatalog(deps(first.index));
    expect(out.status).toBe('failed');
    expect(out.index).toEqual({ ...first.index, lastAttemptAt: 9_000 });
    expect(files.data.has('kitten.1.json')).toBe(true);
  });

  it('keeps the cache when the manifest is invalid (http URL, other host, not JSON, HTTP error)', async () => {
    server.publish([PETS], [{ source: makeSource('kitten') }]);
    const first = await syncCatalog(deps());
    const good = JSON.parse(JSON.stringify(server.publish([PETS], [{ source: makeSource('kitten') }])));
    for (const url of ['http://catalog.test/catalog/v1/artworks/kitten.1.json', 'https://evil.test/catalog/v1/artworks/kitten.1.json']) {
      server.setManifest({ ...good, artworks: [{ ...good.artworks[0], url }] }, '"bad"');
      const out = await syncCatalog(deps(first.index));
      expect(out.status).toBe('failed');
      expect(out.index.entries).toEqual(first.index.entries);
    }
    server.routes.set(`${BASE}/catalog/v1/manifest.json`, { status: 200, body: encodeUtf8('<html>') });
    expect((await syncCatalog(deps(first.index))).status).toBe('failed');
    server.routes.set(`${BASE}/catalog/v1/manifest.json`, { status: 500 });
    expect((await syncCatalog(deps(first.index))).status).toBe('failed');
    expect(server.requests.filter((r) => r.url.includes('evil'))).toEqual([]);
  });

  it('rejects files whose SHA-256, size or content is wrong (and retries next time)', async () => {
    const m = server.publish([PETS], [{ source: makeSource('tampered') }, { source: makeSource('huge') }, { source: makeSource('broken') }, { source: makeSource('fine') }]);
    server.routes.set(m.artworks[0].url, { status: 200, body: encodeUtf8(JSON.stringify(makeSource('tampered', 'pets', 'free', 'Evil'))) });
    server.routes.set(m.artworks[1].url, { status: 200, body: new Uint8Array(256 * 1024 + 1) });
    const broken = encodeUtf8(JSON.stringify({ ...makeSource('broken'), rows: ['x'] }));
    server.routes.set(m.artworks[2].url, { status: 200, body: broken });
    // Republish "broken" with the digest of its (invalid) bytes: the SHA matches, validateArtwork refuses it.
    server.setManifest({ ...m, artworks: m.artworks.map((a) => (a.id === 'broken' ? { ...a, sha256: sha256Hex(broken) } : a)) });
    const out = await syncCatalog(deps());
    if (out.status !== 'updated') throw new Error(out.status);
    expect(Object.keys(out.index.entries)).toEqual(['fine']);
    expect([...files.data.keys()]).toEqual(['fine.1.json']);
    expect(out.index.etag).toBeNull();
  });

  it('refuses catalog ids that collide with bundled artworks', async () => {
    server.publish([PETS], [{ source: makeSource('strawberry') }, { source: makeSource('kitten') }]);
    const out = await syncCatalog(deps());
    if (out.status !== 'updated') throw new Error(out.status);
    expect(out.plan.collisions).toEqual(['strawberry']);
    expect(Object.keys(out.index.entries)).toEqual(['kitten']);
    expect(server.artworkRequests().some((r) => r.url.includes('strawberry'))).toBe(false);
  });

  it('downloads at most 3 files at a time', async () => {
    server.publish(
      [PETS],
      Array.from({ length: 10 }, (_, i) => ({ source: makeSource(`art-${i}`) })),
    );
    const out = await syncCatalog(deps());
    expect(Object.keys(out.index.entries)).toHaveLength(10);
    expect(server.maxInFlight).toBe(3);
  });
});

describe('httpGet', () => {
  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    try {
      let aborted = false;
      const pending = httpGet(
        (_url, init) =>
          new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
        `${BASE}/x`,
        { maxBytes: 10 },
      );
      const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
      jest.advanceTimersByTime(10_000);
      await assertion;
      expect(aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses a body larger than announced limits', async () => {
    const fetchFn = async () => ({
      status: 200,
      headers: { get: (n: string) => (n === 'content-length' ? '999999' : null) },
      arrayBuffer: async () => new ArrayBuffer(1),
    });
    await expect(httpGet(fetchFn, `${BASE}/x`, { maxBytes: 10 })).rejects.toMatchObject({ kind: 'too-large' });
  });
});
