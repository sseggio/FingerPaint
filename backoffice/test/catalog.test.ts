import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Manifest } from '../src/catalog';
import { authed, createArtwork, login, setup, type Session, type TestEnv } from './helpers';

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
