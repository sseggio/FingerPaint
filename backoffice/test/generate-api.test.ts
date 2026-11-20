import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decode } from '../src/artwork-lib';
import { generate } from '../src/generators';
import { authed, createArtwork, login, ORIGIN, setup, type Session, type TestEnv } from './helpers';

let env: TestEnv;
let s: Session;
beforeEach(async () => {
  env = await setup();
  s = await login(env);
});
afterEach(() => env.cleanup());

interface Proposal {
  generator: string;
  seed: string;
  params: Record<string, unknown>;
  w: number;
  h: number;
  palette: string[];
  difficulty: number;
  stats: { cells: number; colors: number; regions: number; estimatedDifficulty: number };
  title: { fr: string; en: string };
  preview: string;
  pixels: string;
}

const post = (path: string, body: unknown, session = s) => env.app.request(`/admin/api${path}`, authed(session, { method: 'POST' }, body));

const meta = { id: 'gen-mandala', titleFr: 'Mandala n°7', titleEn: 'Mandala #7', album: 'garden', access: 'free', publish: { mode: 'now' } };

describe('POST /admin/api/generate', () => {
  it('returns proposals with previews, palette and stats, without storing anything', async () => {
    const res = await post('/generate', { generator: 'mandala', params: { width: 64, height: 48, colors: 10 }, seed: 7, count: 3 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { proposals: Proposal[]; truncated: boolean };
    expect(body.truncated).toBe(false);
    expect(body.proposals).toHaveLength(3);
    const [p] = body.proposals;
    expect(p).toMatchObject({ generator: 'mandala', seed: '7', w: 64, h: 48, title: { fr: 'Mandala n°7', en: 'Mandala #7' } });
    expect(p.preview).toMatch(/^data:image\/png;base64,/);
    expect(p.pixels).toMatch(/^data:image\/png;base64,/);
    expect(p.stats.colors).toBe(p.palette.length);
    expect(p.stats.cells).toBe(64 * 48);
    expect([1, 2, 3]).toContain(p.difficulty);
    // Same seed + params as the pure module.
    expect(p.palette).toEqual(generate('mandala', { width: 64, height: 48, colors: 10 }, 7).palette);
    // Other proposals get their own random seeds.
    expect(new Set(body.proposals.map((x) => x.seed)).size).toBe(3);
    expect(env.db.listArtworks()).toEqual([]);
  });

  it('checks count, generator, params and seed', async () => {
    for (const count of [0, 13, 1.5, '2']) expect((await post('/generate', { generator: 'mandala', count })).status).toBe(422);
    expect((await post('/generate', { generator: 'nope' })).status).toBe(422);
    const bad = await post('/generate', { generator: 'pattern', params: { width: 300 } });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { errors: { field: string }[] }).errors[0].field).toBe('params.width');
    expect((await post('/generate', { generator: 'pattern', seed: '<b>' })).status).toBe(422);
    expect((await post('/generate', 'nope')).status).toBe(400);
  });

  it('needs a session, a CSRF token and the admin origin', async () => {
    const body = { generator: 'mandala' };
    expect((await post('/generate', body, { ...s, csrf: 'nope' })).status).toBe(403);
    expect((await post('/generate', body, { cookie: '', csrf: s.csrf })).status).toBe(401);
    const res = await env.app.request('/admin/api/generate', {
      method: 'POST',
      headers: { Cookie: s.cookie, 'X-CSRF-Token': s.csrf, Origin: 'https://evil.test', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(403);
    expect((await env.app.request('/admin/api/generators', { headers: { Origin: ORIGIN } })).status).toBe(401);
  });

  it('rate limits proposals per minute', async () => {
    env.cleanup();
    env = await setup({ generateLimits: { perMinute: 5 } });
    s = await login(env);
    expect((await post('/generate', { generator: 'pattern', params: { width: 16, height: 16 }, count: 4 })).status).toBe(200);
    const res = await post('/generate', { generator: 'pattern', params: { width: 16, height: 16 }, count: 2 });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('refuses or truncates past the time budget', async () => {
    env.cleanup();
    env = await setup({ generateLimits: { artworkBudgetMs: 0 } });
    s = await login(env);
    const res = await post('/generate', { generator: 'landscape', params: { width: 256, height: 256 } });
    expect(res.status).toBe(503);
  });

  it('lists generators and remix sources', async () => {
    const res = await env.app.request('/admin/api/generators', authed(s));
    const body = (await res.json()) as { generators: { id: string }[]; sources: { value: string }[]; maxCount: number };
    expect(body.generators.map((g) => g.id)).toEqual(['creature', 'mandala', 'landscape', 'plant', 'pattern', 'remix']);
    expect(body.sources.map((x) => x.value)).toContain('embedded:fox');
    expect(body.maxCount).toBe(12);
  });
});

describe('POST /admin/api/generate/save', () => {
  it('regenerates on the server and ignores any grid sent by the client', async () => {
    const params = { width: 32, height: 32, colors: 8 };
    const res = await post('/generate/save', {
      generator: 'mandala',
      params,
      seed: 7,
      ...meta,
      w: 8,
      h: 8,
      palette: ['#000000', '#FFFFFF'],
      rows: Array(8).fill('8A'),
    });
    expect(res.status).toBe(201);
    const { artwork } = (await res.json()) as { artwork: { id: string; w: number; h: number; rev: number; state: string; difficulty: number } };
    expect(artwork).toMatchObject({ id: 'gen-mandala', w: 32, h: 32, rev: 1, state: 'published' });
    const file = await env.app.request('/catalog/v1/artworks/gen-mandala.1.json');
    const stored = (await file.json()) as { palette: string[]; rows: string[]; w: number; h: number; difficulty: number };
    const expected = generate('mandala', params, 7);
    expect(stored.rows).toEqual(expected.rows);
    expect(stored.palette).toEqual(expected.palette);
    expect(stored.difficulty).toBe(expected.difficulty);
    // Manifest carries w/h.
    const manifest = (await (await env.app.request('/catalog/v1/manifest.json')).json()) as { artworks: { id: string; w: number; h: number }[] };
    expect(manifest.artworks.find((a) => a.id === 'gen-mandala')).toMatchObject({ w: 32, h: 32 });
  });

  it('honors draft / schedule and a forced difficulty', async () => {
    const draft = await post('/generate/save', { generator: 'pattern', params: { width: 24, height: 24 }, seed: 'abc', ...meta, difficulty: 3, publish: { mode: 'draft' } });
    expect(draft.status).toBe(201);
    expect(((await draft.json()) as { artwork: { state: string; difficulty: number } }).artwork).toMatchObject({ state: 'draft', difficulty: 3 });
    const later = await post('/generate/save', {
      generator: 'pattern',
      params: { width: 24, height: 24 },
      seed: 'abc',
      ...meta,
      id: 'gen-later',
      publish: { mode: 'schedule', at: '2027-01-01T00:00:00.000Z' },
    });
    expect(((await later.json()) as { artwork: { state: string } }).artwork.state).toBe('scheduled');
  });

  it('saves a remix of an embedded artwork and of a catalog artwork', async () => {
    const res = await post('/generate/save', { generator: 'remix', params: { source: 'embedded:fox', hue: 90 }, seed: 1, ...meta, id: 'fox-blue' });
    expect(res.status).toBe(201);
    expect((await createArtwork(env, s)).status).toBe(201);
    const cat = await post('/generate/save', { generator: 'remix', params: { source: 'catalog:red-blue', mode: 'palette', palette: 'ocean' }, seed: 1, ...meta, id: 'red-blue-ocean' });
    expect(cat.status).toBe(201);
    const stored = (await (await env.app.request('/catalog/v1/artworks/red-blue-ocean.1.json')).json()) as { rows: string[]; w: number; h: number; palette: string[] };
    expect(decode(stored.rows, stored.w, stored.h, stored.palette.length).cells.filter((v) => v > 0).length).toBe(225);
    expect((await post('/generate/save', { generator: 'remix', params: { source: 'catalog:missing' }, seed: 1, ...meta, id: 'x' })).status).toBe(422);
  });

  it('runs the usual checks: seed required, id collisions, metadata, CSRF', async () => {
    expect((await post('/generate/save', { generator: 'mandala', ...meta })).status).toBe(422);
    expect((await post('/generate/save', { generator: 'mandala', seed: 1, ...meta, id: 'fox' })).status).toBe(409);
    expect((await post('/generate/save', { generator: 'mandala', seed: 1, ...meta, titleFr: '' })).status).toBe(422);
    expect((await post('/generate/save', { generator: 'mandala', seed: 1, ...meta }, { ...s, csrf: 'x' })).status).toBe(403);
    expect((await post('/generate/save', { generator: 'mandala', seed: 1, ...meta })).status).toBe(201);
    expect((await post('/generate/save', { generator: 'mandala', seed: 2, ...meta })).status).toBe(409);
  });
});
