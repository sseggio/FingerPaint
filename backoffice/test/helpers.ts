import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PNG } from 'pngjs';

import type { GenerateLimits } from '../src/app';
import { createApp } from '../src/app';
import type { ArtworkSource } from '../src/artwork-lib';
import { CatalogDb } from '../src/db';
import type { EmbeddedContent } from '../src/embedded';
import { hashPassword } from '../src/password';
import { parseTrustedProxies, TrustedProxies } from '../src/trusted-proxies';

export type Rgba = [number, number, number, number];

/** Builds a PNG where `pixel(x, y)` returns RGBA. */
export function makePng(w: number, h: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = (y * w + x) * 4;
      png.data[o] = r;
      png.data[o + 1] = g;
      png.data[o + 2] = b;
      png.data[o + 3] = a;
    }
  return PNG.sync.write(png);
}

/** 16×16: transparent border, red/blue halves, a near-red pixel (merged by ΔE). */
export function samplePng(): Buffer {
  return makePng(16, 16, (x, y) => {
    if (x === 0 || y === 0) return [0, 0, 0, 0];
    if (x === 5 && y === 5) return [252, 2, 2, 255];
    return x < 8 ? [255, 0, 0, 255] : [0, 0, 255, 255];
  });
}

export const PASSWORD = 'correct horse battery staple';
export const ORIGIN = 'https://catalog.test';
/** Nginx mode: bridge gateway seen by the app; traefik mode: Traefik's fixed address on edge. */
export const DEFAULT_TRUSTED_PROXIES = '172.18.0.1, 172.30.0.2';
export const EMBEDDED: EmbeddedContent = {
  artworkIds: ['strawberry', 'fox'],
  albums: [
    { id: 'garden', title: { fr: 'Jardin', en: 'Garden' }, order: 0 },
    { id: 'deep-ocean', title: { fr: 'Océan profond', en: 'Deep ocean' }, order: 5, pack: 'ocean' },
  ],
};

let cachedHash: string | null = null;

export interface SetupOptions {
  now?: () => Date;
  /** Simulated TCP peer of every request (e.g. the local reverse proxy); undefined = no socket. */
  remoteAddress?: string;
  publicUrl?: string;
  /** TRUSTED_PROXIES (default: the Nginx bridge gateway and the shared Traefik of the tests). */
  trustedProxies?: string;
  generateLimits?: Partial<GenerateLimits>;
}

/** The app's fox (embedded remix source in the tests). */
export const FOX = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'src', 'content', 'artworks', 'animals', 'fox.json'), 'utf8')) as ArtworkSource;

export async function setup(opts: SetupOptions = {}) {
  cachedHash ??= await hashPassword(PASSWORD, 1 << 14);
  const dataDir = mkdtempSync(join(tmpdir(), 'pj-bo-'));
  const db = new CatalogDb(join(dataDir, 'catalog.sqlite'));
  db.syncBuiltinAlbums(EMBEDDED, new Date('2026-01-01T00:00:00Z').toISOString());
  let clock = new Date('2026-06-01T12:00:00Z');
  const now = opts.now ?? (() => clock);
  const app = createApp({
    db,
    dataDir,
    embedded: EMBEDDED,
    embeddedSources: new Map([[FOX.id, FOX]]),
    generateLimits: opts.generateLimits,
    passwordHash: cachedHash,
    sessionSecret: 'x'.repeat(48),
    publicUrl: opts.publicUrl ?? ORIGIN,
    publicDir: join(import.meta.dirname, '..', 'public', 'admin'),
    cookieSecure: true,
    trustedProxies: new TrustedProxies(parseTrustedProxies(opts.trustedProxies ?? DEFAULT_TRUSTED_PROXIES)),
    rateLimit: { perClient: 3, perPeer: 6, global: 10, windowMs: 60_000 },
    now,
    remoteAddress: opts.remoteAddress === undefined ? undefined : () => opts.remoteAddress,
  });
  const cleanup = () => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  };
  return {
    app,
    db,
    dataDir,
    cleanup,
    setNow: (d: Date) => (clock = d),
  };
}

export type TestEnv = Awaited<ReturnType<typeof setup>>;

export interface Session {
  cookie: string;
  csrf: string;
}

export async function login(env: TestEnv, ip = '203.0.113.1'): Promise<Session> {
  const res = await env.app.request('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-For': ip },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const { csrf } = (await res.json()) as { csrf: string };
  return { cookie, csrf };
}

export function authed(s: Session, init: RequestInit = {}, json?: unknown): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('Cookie', s.cookie);
  headers.set('X-CSRF-Token', s.csrf);
  headers.set('Origin', ORIGIN);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  return { ...init, headers, body: json !== undefined ? JSON.stringify(json) : init.body };
}

export async function convert(env: TestEnv, s: Session, png: Buffer, maxColors?: number) {
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(png)], 'art.png', { type: 'image/png' }));
  if (maxColors !== undefined) fd.append('maxColors', String(maxColors));
  return env.app.request('/admin/api/convert', authed(s, { method: 'POST', body: fd }));
}

export interface Converted {
  w: number;
  h: number;
  palette: string[];
  rows: string[];
  cells: number;
  merged: number;
  preview: string;
}

export async function createArtwork(env: TestEnv, s: Session, overrides: Record<string, unknown> = {}) {
  const res = await convert(env, s, samplePng());
  const grid = (await res.json()) as Converted;
  const body = {
    id: 'red-blue',
    titleFr: 'Rouge et bleu',
    titleEn: 'Red and blue',
    album: 'garden',
    difficulty: 1,
    access: 'free',
    publish: { mode: 'now' },
    w: grid.w,
    h: grid.h,
    palette: grid.palette,
    rows: grid.rows,
    ...overrides,
  };
  return env.app.request('/admin/api/artworks', authed(s, { method: 'POST' }, body));
}
