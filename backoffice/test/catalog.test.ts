import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Manifest } from '../src/catalog';
import { authed, convert, createArtwork, login, makePng, setup, type Converted, type Session, type TestEnv } from './helpers';

let env: TestEnv;
let s: Session;
beforeEach(async () => {
  env = await setup();
  s = await login(env);
});
afterEach(() => env.cleanup());

async function manifest(): Promise<Manifest> {
  const res = await env.app.request('/catalog/v1/manifest.json');
  expect(res.status).toBe(200);
  return (await res.json()) as Manifest;
}

describe('GET /catalog/v1/manifest.json', () => {
  it('is empty at first, public and cacheable', async () => {
    const res = await env.app.request('/catalog/v1/manifest.json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('etag')).toMatch(/^".+"$/);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await res.json()).toMatchObject({ v: 1, albums: [], artworks: [] });
  });

  it('lists only published artworks whose date has passed', async () => {
    await createArtwork(env, s, { id: 'now-art' });
    await createArtwork(env, s, { id: 'draft-art', publish: { mode: 'draft' } });
    await createArtwork(env, s, { id: 'later-art', publish: { mode: 'schedule', at: '2026-06-02T08:00:00Z' } });
    let m = await manifest();
    expect(m.artworks.map((a) => a.id)).toEqual(['now-art']);
    expect(m.albums).toEqual([{ id: 'garden', title: { fr: 'Jardin', en: 'Garden' }, access: 'free', order: 0 }]);
    const [art] = m.artworks;
    expect(art).toEqual({
      id: 'now-art',
      album: 'garden',
      rev: 1,
      url: 'https://catalog.test/catalog/v1/artworks/now-art.1.json',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      publishedAt: '2026-06-01T12:00:00.000Z',
      w: 16,
      h: 16,
    });
    // Scheduled publication appears once its date passes.
    env.setNow(new Date('2026-06-02T08:00:00Z'));
    m = await manifest();
    expect(m.artworks.map((a) => a.id)).toEqual(['now-art', 'later-art']);
    expect(m.updatedAt).toBe('2026-06-02T08:00:00.000Z');
  });

  it('drops unpublished artworks and lists new albums with their access', async () => {
    await createArtwork(env, s, { id: 'a1', album: undefined, newAlbum: { id: 'pets', titleFr: 'Animaux', titleEn: 'Pets', access: 'pack:pets' } });
    let m = await manifest();
    expect(m.albums).toEqual([{ id: 'pets', title: { fr: 'Animaux', en: 'Pets' }, access: { pack: 'pets' }, order: 6 }]);
    await env.app.request('/admin/api/artworks/a1/unpublish', authed(s, { method: 'POST' }));
    m = await manifest();
    expect(m.artworks).toEqual([]);
    expect(m.albums).toEqual([]);
    expect((await env.app.request('/catalog/v1/artworks/a1.1.json')).status).toBe(404);
  });

  it('supports conditional requests and gzip', async () => {
    for (let i = 0; i < 6; i++) await createArtwork(env, s, { id: `art-${i}` });
    const first = await env.app.request('/catalog/v1/manifest.json');
    const etag = first.headers.get('etag')!;
    const again = await env.app.request('/catalog/v1/manifest.json', { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    const gz = await env.app.request('/catalog/v1/manifest.json', { headers: { 'Accept-Encoding': 'gzip, br' } });
    expect(gz.headers.get('content-encoding')).toBe('gzip');
    expect(gz.headers.get('vary')).toBe('Accept-Encoding');
    const body = JSON.parse(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString('utf8')) as Manifest;
    expect(body.artworks).toHaveLength(6);
  });
});

describe('GET /catalog/v1/artworks/<id>.<rev>.json', () => {
  it('serves the immutable ArtworkSource matching the manifest sha256', async () => {
    await createArtwork(env, s);
    const [entry] = (await manifest()).artworks;
    const res = await env.app.request('/catalog/v1/artworks/red-blue.1.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    expect(JSON.parse(bytes.toString('utf8'))).toMatchObject({ v: 1, id: 'red-blue', album: 'garden', w: 16, h: 16, access: 'free', difficulty: 1 });
    // F33: the grid size is declared in the manifest (apps filter before downloading).
    expect(entry).toMatchObject({ w: 16, h: 16 });
  });

  it('publishes a 256×256 artwork end to end, size declared in the manifest (F33)', async () => {
    const png = makePng(256, 256, (x, y) => (((x >> 4) + (y >> 4)) % 2 ? [230, 40, 90, 255] : [40, 60, 200, 255]));
    const res = await convert(env, s, png);
    expect(res.status).toBe(200);
    const grid = (await res.json()) as Converted;
    expect([grid.w, grid.h]).toEqual([256, 256]);
    const created = await env.app.request(
      '/admin/api/artworks',
      authed(s, { method: 'POST' }, {
        id: 'big-checker', titleFr: 'Damier', titleEn: 'Checker', album: 'garden', difficulty: 3, access: 'pro',
        publish: { mode: 'now' }, w: grid.w, h: grid.h, palette: grid.palette, rows: grid.rows,
      }),
    );
    expect(created.status).toBeLessThan(300);
    const entry = (await manifest()).artworks.find((a) => a.id === 'big-checker');
    expect(entry).toMatchObject({ w: 256, h: 256 });
    const file = await env.app.request('/catalog/v1/artworks/big-checker.1.json');
    expect(JSON.parse(Buffer.from(await file.arrayBuffer()).toString('utf8'))).toMatchObject({ w: 256, h: 256 });
  });

  it('hides drafts, scheduled artworks, unknown revisions and malformed names', async () => {
    await createArtwork(env, s, { id: 'secret', publish: { mode: 'draft' } });
    await createArtwork(env, s, { id: 'soon', publish: { mode: 'schedule', at: '2027-01-01T00:00:00Z' } });
    await createArtwork(env, s, { id: 'live' });
    for (const path of ['secret.1.json', 'soon.1.json', 'live.2.json', 'live.0.json', '..%2Fcatalog.sqlite', 'live.1.json.bak']) {
      expect((await env.app.request(`/catalog/v1/artworks/${path}`)).status).toBe(404);
    }
  });
});

it('answers the health check', async () => {
  const res = await env.app.request('/healthz');
  expect(await res.text()).toBe('ok');
});
