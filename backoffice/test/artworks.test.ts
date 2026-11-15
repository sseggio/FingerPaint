import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authed, convert, createArtwork, login, makePng, samplePng, setup, type Converted, type Session, type TestEnv } from './helpers';

let env: TestEnv;
let s: Session;
beforeEach(async () => {
  env = await setup();
  s = await login(env);
});
afterEach(() => env.cleanup());

type Errors = { errors: { field: string; message: string }[] };

describe('convert endpoint', () => {
  it('returns palette, rows, cell count and an enlarged PNG preview', async () => {
    const res = await convert(env, s, samplePng(), 24);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Converted;
    expect(body.palette).toEqual(['#0000FF', '#FF0000']);
    expect(body.cells).toBe(225);
    expect(body.preview).toMatch(/^data:image\/png;base64,/);
  });

  it('refuses invalid files and files over 1 MB', async () => {
    expect((await convert(env, s, Buffer.from('hello'))).status).toBe(422);
    expect((await convert(env, s, Buffer.alloc(1024 * 1024 + 10))).status).toBe(413);
  });

  it('needs a session and a CSRF token', async () => {
    expect((await convert(env, { ...s, csrf: 'nope' }, samplePng())).status).toBe(403);
    expect((await convert(env, { cookie: '', csrf: s.csrf }, samplePng())).status).toBe(401);
  });
});

describe('create artwork', () => {
  it('creates and stores a validated artwork', async () => {
    const res = await createArtwork(env, s);
    expect(res.status).toBe(201);
    const { artwork } = (await res.json()) as { artwork: { rev: number; state: string; cells: number; colors: number } };
    expect(artwork).toMatchObject({ rev: 1, state: 'published', cells: 225, colors: 2 });
  });

  it('refuses ids already used by embedded content or by the catalog', async () => {
    const embedded = await createArtwork(env, s, { id: 'strawberry' });
    expect(embedded.status).toBe(409);
    expect(((await embedded.json()) as Errors).errors[0].field).toBe('id');
    expect((await createArtwork(env, s)).status).toBe(201);
    expect((await createArtwork(env, s)).status).toBe(409);
  });

  it('refuses malformed metadata with field errors', async () => {
    const res = await createArtwork(env, s, { id: 'Bad Id', titleFr: '', access: 'vip', difficulty: 7, publish: { mode: 'later' } });
    expect(res.status).toBe(422);
    const fields = ((await res.json()) as Errors).errors.map((e) => e.field).sort();
    expect(fields).toEqual(['access', 'difficulty', 'id', 'publish', 'titleFr']);
  });

  it('runs validateArtwork and returns its issues', async () => {
    const res = await createArtwork(env, s, { palette: ['#FF0000', '#FE0000'], rows: Array(16).fill('16A') });
    expect(res.status).toBe(422);
    const messages = ((await res.json()) as Errors).errors.map((e) => e.message);
    expect(messages.some((m) => m.startsWith('[red-blue] palette[1]: duplicate') || m.includes('too close'))).toBe(true);
    const badRows = await createArtwork(env, s, { rows: ['3A'] });
    expect(badRows.status).toBe(422);
  });

  it('refuses unknown albums and creates new ones on the fly', async () => {
    expect((await createArtwork(env, s, { album: 'nowhere' })).status).toBe(409);
    const res = await createArtwork(env, s, {
      album: undefined,
      newAlbum: { id: 'pixel-pets', titleFr: 'Animaux pixel', titleEn: 'Pixel pets', access: 'pack:pets' },
    });
    expect(res.status).toBe(201);
    const album = env.db.getAlbum('pixel-pets');
    expect(album).toMatchObject({ titleFr: 'Animaux pixel', access: 'pack:pets', builtin: false });
    // Builtin album ids cannot be recreated.
    const dup = await createArtwork(env, s, { id: 'other', newAlbum: { id: 'garden', titleFr: 'J', titleEn: 'G', access: 'free' } });
    expect(dup.status).toBe(409);
  });

  it('refuses oversized JSON bodies', async () => {
    const res = await createArtwork(env, s, { rows: Array(16).fill('A'.repeat(20_000)) });
    expect(res.status).toBe(413);
  });
});

describe('update / unpublish / delete', () => {
  it('bumps rev when the artwork content changes, keeps it otherwise', async () => {
    await createArtwork(env, s);
    const patch = (body: unknown) => env.app.request('/admin/api/artworks/red-blue', authed(s, { method: 'PATCH' }, body));
    const base = { titleFr: 'Rouge et bleu', titleEn: 'Red and blue', album: 'garden', difficulty: 1, access: 'free', publish: { mode: 'keep' } };
    let res = await patch(base);
    expect(((await res.json()) as { artwork: { rev: number } }).artwork.rev).toBe(1);
    res = await patch({ ...base, titleFr: 'Bleu et rouge', access: 'pro' });
    const { artwork } = (await res.json()) as { artwork: { rev: number; state: string } };
    expect(artwork).toMatchObject({ rev: 2, state: 'published' });
    const file = await env.app.request('/catalog/v1/artworks/red-blue.2.json');
    expect(await file.json()).toMatchObject({ title: { fr: 'Bleu et rouge' }, access: 'pro' });
  });

  it('unpublishes, and only lets never-published drafts be deleted', async () => {
    await createArtwork(env, s);
    expect((await env.app.request('/admin/api/artworks/red-blue', authed(s, { method: 'DELETE' }))).status).toBe(409);
    const res = await env.app.request('/admin/api/artworks/red-blue/unpublish', authed(s, { method: 'POST' }));
    expect(((await res.json()) as { artwork: { state: string } }).artwork.state).toBe('draft');
    await createArtwork(env, s, { id: 'just-draft', publish: { mode: 'draft' } });
    expect((await env.app.request('/admin/api/artworks/just-draft', authed(s, { method: 'DELETE' }))).status).toBe(200);
    expect(env.db.getArtwork('just-draft')).toBeNull();
  });

  it('keeps a scheduled artwork unpublished before its date deletable', async () => {
    const del = () => env.app.request('/admin/api/artworks/later', authed(s, { method: 'DELETE' }));
    await createArtwork(env, s, { id: 'later', publish: { mode: 'schedule', at: '2026-06-03T08:00:00Z' } });
    await env.app.request('/admin/api/artworks/later/unpublish', authed(s, { method: 'POST' }));
    expect(env.db.getArtwork('later')?.everPublished).toBe(false);
    expect((await del()).status).toBe(200);
  });

  it('reserves a scheduled artwork once its date has passed, even without any edit', async () => {
    await createArtwork(env, s, { id: 'later', publish: { mode: 'schedule', at: '2026-06-01T14:00:00Z' } });
    // Sessions last 12 h: stay within the same session.
    env.setNow(new Date('2026-06-01T15:00:00Z'));
    const state = (await (await env.app.request('/admin/api/state', authed(s))).json()) as {
      artworks: { id: string; everPublished: boolean }[];
    };
    expect(state.artworks.find((a) => a.id === 'later')?.everPublished).toBe(true);
    expect((await env.app.request('/admin/api/artworks/later', authed(s, { method: 'DELETE' }))).status).toBe(409);
    await env.app.request('/admin/api/artworks/later/unpublish', authed(s, { method: 'POST' }));
    expect(env.db.getArtwork('later')?.everPublished).toBe(true);
    expect((await env.app.request('/admin/api/artworks/later', authed(s, { method: 'DELETE' }))).status).toBe(409);
  });

  it('"publish now" on an already visible artwork keeps its original date', async () => {
    await createArtwork(env, s);
    env.setNow(new Date('2026-06-01T18:00:00Z'));
    const res = await env.app.request(
      '/admin/api/artworks/red-blue',
      authed(s, { method: 'PATCH' }, { titleFr: 'Rouge', titleEn: 'Red', album: 'garden', difficulty: 1, access: 'free', publish: { mode: 'now' } }),
    );
    expect(res.status).toBe(200);
    expect(env.db.getArtwork('red-blue')).toMatchObject({ rev: 2, publishedAt: '2026-06-01T12:00:00.000Z' });
    // A draft published "now" gets the current date.
    await createArtwork(env, s, { id: 'drafty', publish: { mode: 'draft' } });
    await env.app.request(
      '/admin/api/artworks/drafty',
      authed(s, { method: 'PATCH' }, { titleFr: 'R', titleEn: 'R', album: 'garden', difficulty: 1, access: 'free', publish: { mode: 'now' } }),
    );
    expect(env.db.getArtwork('drafty')).toMatchObject({ publishedAt: '2026-06-01T18:00:00.000Z', everPublished: true });
  });

  it('serves an authenticated preview of stored artworks', async () => {
    await createArtwork(env, s);
    expect((await env.app.request('/admin/api/artworks/red-blue/preview.png')).status).toBe(401);
    const res = await env.app.request('/admin/api/artworks/red-blue/preview.png', authed(s));
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});

describe('albums', () => {
  it('edits catalog albums but not builtin ones', async () => {
    const create = await env.app.request(
      '/admin/api/albums',
      authed(s, { method: 'POST' }, { id: 'winter', titleFr: 'Hiver', titleEn: 'Winter', access: 'free', order: 7 }),
    );
    expect(create.status).toBe(201);
    const upd = await env.app.request(
      '/admin/api/albums/winter',
      authed(s, { method: 'PATCH' }, { titleFr: 'Hiver doux', titleEn: 'Mild winter', access: 'pro', order: 2 }),
    );
    expect(upd.status).toBe(200);
    expect(env.db.getAlbum('winter')).toMatchObject({ titleFr: 'Hiver doux', access: 'pro', order: 2 });
    const builtin = await env.app.request(
      '/admin/api/albums/garden',
      authed(s, { method: 'PATCH' }, { titleFr: 'X', titleEn: 'X', access: 'free', order: 0 }),
    );
    expect(builtin.status).toBe(409);
  });

  it('rejects invalid album payloads', async () => {
    const res = await env.app.request('/admin/api/albums', authed(s, { method: 'POST' }, { id: '../etc', titleFr: '', access: 'pack:', order: -1 }));
    expect(res.status).toBe(422);
  });
});

it('converts a real-world style RGBA image end-to-end', async () => {
  const png = makePng(32, 24, (x, y) => [(x * 8) % 256, (y * 10) % 256, 128, x === y ? 0 : 255]);
  const res = await convert(env, s, png, 12);
  const grid = (await res.json()) as Converted;
  expect(grid.palette.length).toBeLessThanOrEqual(12);
  const created = await createArtwork(env, s, { id: 'gradient', w: grid.w, h: grid.h, palette: grid.palette, rows: grid.rows });
  expect(created.status).toBe(201);
});
