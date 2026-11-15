/**
 * HTTP application (Hono):
 * - public, read-only catalog under /catalog/v1 (no auth, no cookies, no logs);
 * - single-admin back-office under /admin (static UI + JSON API behind a session cookie + CSRF).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import type { ArtworkSource } from './artwork-lib';
import { decode, formatIssue, validateArtwork } from './artwork-lib';
import type { RateLimitOptions } from './auth';
import { LoginRateLimiter, safeEqual, SESSION_COOKIE, SESSION_TTL_MS, SessionManager } from './auth';
import { buildManifest, CHANGED_AT_KEY } from './catalog';
import { convertPng, ConvertError, MAX_PNG_BYTES } from './convert';
import type { AlbumRecord, ArtworkRecord, CatalogDb } from './db';
import type { EmbeddedContent } from './embedded';
import type { ArtworkMetaInput, FieldError } from './input';
import { accessToSource, InputError, isRecord, isValidId, parseAlbum, parseArtworkCreate, parseArtworkUpdate } from './input';
import { verifyPassword } from './password';
import { renderPreview } from './preview';
import { ArtworkStore } from './store';

export interface AppConfig {
  db: CatalogDb;
  dataDir: string;
  embedded: EmbeddedContent;
  passwordHash: string;
  sessionSecret: string;
  /** Public origin, e.g. https://catalog.example.com (used for artwork URLs in the manifest). */
  publicUrl: string;
  /** Directory holding the admin UI (index.html, admin.css, admin.js, favicon.svg). */
  publicDir: string;
  cookieSecure: boolean;
  /** Behind Caddy: the client address is the right-most X-Forwarded-For entry (memory only). */
  trustProxy: boolean;
  rateLimit?: RateLimitOptions;
  /** Password verifications allowed in parallel (default MAX_LOGIN_CHECKS). */
  maxConcurrentLogins?: number;
  now?: () => Date;
  /** Client address when not behind a proxy (from the socket); tests leave it out. */
  remoteAddress?: (c: Context) => string | undefined;
}

const JSON_LIMIT = 256 * 1024;
export const MAX_LOGIN_CHECKS = 2;
const UPLOAD_LIMIT = MAX_PNG_BYTES + 64 * 1024;

const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const STATIC_FILES: Record<string, string> = {
  'index.html': 'text/html; charset=utf-8',
  'admin.css': 'text/css; charset=utf-8',
  'admin.js': 'text/javascript; charset=utf-8',
  'favicon.svg': 'image/svg+xml',
};

const ARTWORK_FILE_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([1-9]\d{0,5})\.json$/;

type Env = { Variables: { csrf: string } };

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function acceptsGzip(c: Context): boolean {
  return /\bgzip\b/.test(c.req.header('accept-encoding') ?? '');
}

function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((t) => {
    const v = t.trim();
    return v === '*' || v === etag || v === `W/${etag}`;
  });
}

/** Sends a cacheable public body with ETag, conditional GET and optional gzip. */
function sendPublic(c: Context, body: Buffer, contentType: string, cacheControl: string): Response {
  const gzip = acceptsGzip(c) && body.length > 512;
  const etag = `"${sha256(body).slice(0, 32)}${gzip ? '-gz' : ''}"`;
  const headers: Record<string, string> = {
    'Cache-Control': cacheControl,
    ETag: etag,
    Vary: 'Accept-Encoding',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  if (etagMatches(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
  headers['Content-Type'] = contentType;
  if (gzip) headers['Content-Encoding'] = 'gzip';
  const payload = gzip ? gzipSync(body) : body;
  return c.body(new Uint8Array(payload), 200, headers);
}

function fieldErrors(c: Context, errors: FieldError[], status: 400 | 409 | 422 = 422) {
  return c.json({ error: 'invalid', errors }, status);
}

function albumJson(a: AlbumRecord, counts: Map<string, number>) {
  return { ...a, artworkCount: counts.get(a.id) ?? 0 };
}

function artworkJson(a: ArtworkRecord, nowIso: string) {
  const state =
    a.status === 'draft' ? 'draft' : a.publishedAt && a.publishedAt <= nowIso ? 'published' : 'scheduled';
  return { ...a, state };
}

export function createApp(cfg: AppConfig) {
  const now = cfg.now ?? (() => new Date());
  const store = new ArtworkStore(cfg.dataDir);
  const sessions = new SessionManager(cfg.db, cfg.sessionSecret);
  const maxLoginChecks = cfg.maxConcurrentLogins ?? MAX_LOGIN_CHECKS;
  let loginChecks = 0;
  const limiter = new LoginRateLimiter(cfg.rateLimit ?? { perClient: 5, global: 50, windowMs: 15 * 60 * 1000 });
  const embeddedIds = new Set(cfg.embedded.artworkIds);
  const cookieName = cfg.cookieSecure ? SESSION_COOKIE : SESSION_COOKIE.replace('__Host-', '');
  const staticFiles = new Map<string, Buffer>();
  for (const name of Object.keys(STATIC_FILES)) staticFiles.set(name, readFileSync(join(cfg.publicDir, name)));

  const app = new Hono<Env>();

  const touch = () => cfg.db.setMeta(CHANGED_AT_KEY, now().toISOString());

  function clientId(c: Context): string {
    if (cfg.trustProxy) {
      const xff = c.req.header('x-forwarded-for');
      const last = xff?.split(',').pop()?.trim();
      if (last) return last;
    }
    return cfg.remoteAddress?.(c) ?? 'unknown';
  }

  function sameOrigin(c: Context): boolean {
    const origin = c.req.header('origin');
    if (!origin) return false;
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return false;
    }
    const expected = new Set<string>([new URL(cfg.publicUrl).host]);
    const reqHost = c.req.header('host');
    if (reqHost) expected.add(reqHost);
    return expected.has(host);
  }

  // ------------------------------------------------------------------ common headers
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    if (c.req.path === '/admin' || c.req.path.startsWith('/admin/')) {
      c.header('Content-Security-Policy', ADMIN_CSP);
      c.header('X-Frame-Options', 'DENY');
      c.header('Cross-Origin-Opener-Policy', 'same-origin');
      c.header('Cross-Origin-Resource-Policy', 'same-origin');
      c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
    }
  });

  app.onError((err, c) => {
    // Never log request details (no IP, no headers): the message is enough to debug.
    console.error(`[backoffice] ${err.name}: ${err.message}`);
    return c.json({ error: 'internal' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.get('/healthz', (c) => c.text('ok', 200, { 'Cache-Control': 'no-store' }));

  // ------------------------------------------------------------------ public catalog
  app.get('/catalog/v1/manifest.json', (c) => {
    const manifest = buildManifest(cfg.db, cfg.publicUrl, now());
    const body = Buffer.from(JSON.stringify(manifest), 'utf8');
    return sendPublic(c, body, 'application/json; charset=utf-8', 'public, max-age=300');
  });

  app.get('/catalog/v1/artworks/:file', (c) => {
    const m = ARTWORK_FILE_RE.exec(c.req.param('file'));
    if (!m) return c.json({ error: 'not_found' }, 404);
    const id = m[1];
    const rev = Number(m[2]);
    const art = cfg.db.getArtwork(id);
    const nowIso = now().toISOString();
    const visible = art && art.status === 'published' && art.publishedAt !== null && art.publishedAt <= nowIso;
    if (!art || !visible || rev > art.rev) return c.json({ error: 'not_found' }, 404);
    const bytes = store.read(id, rev);
    if (!bytes) return c.json({ error: 'not_found' }, 404);
    return sendPublic(c, bytes, 'application/json; charset=utf-8', 'public, max-age=31536000, immutable');
  });

  // ------------------------------------------------------------------ admin UI (static)
  app.get('/admin', (c) => c.redirect('/admin/', 302));
  app.get('/admin/', (c) => c.body(new Uint8Array(staticFiles.get('index.html')!), 200, { 'Content-Type': STATIC_FILES['index.html'] }));
  app.get('/admin/:name{[a-z]+\\.(?:css|js|svg)}', (c) => {
    const name = c.req.param('name');
    const file = staticFiles.get(name);
    if (!file) return c.json({ error: 'not_found' }, 404);
    return c.body(new Uint8Array(file), 200, { 'Content-Type': STATIC_FILES[name], 'Cache-Control': 'no-cache' });
  });

  // ------------------------------------------------------------------ admin API
  const api = new Hono<Env>();

  // Every state-changing request must come from the admin page itself.
  api.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !sameOrigin(c)) {
      return c.json({ error: 'bad_origin' }, 403);
    }
    await next();
  });

  api.get('/session', (c) => {
    const session = sessions.get(getCookie(c, cookieName), now().getTime());
    return c.json(session ? { authenticated: true, csrf: session.csrf } : { authenticated: false });
  });

  api.post('/login', bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: 'too_large' }, 413) }), async (c) => {
    // At most MAX_LOGIN_CHECKS scrypt verifications run at once (CPU + ~32 MB each): beyond, 429.
    if (loginChecks >= maxLoginChecks) {
      return c.json({ error: 'rate_limited', retryAfter: 1 }, 429, { 'Retry-After': '1' });
    }
    const client = clientId(c);
    const t = now().getTime();
    const wait = limiter.reserve(client, t);
    if (wait > 0) {
      const seconds = String(Math.ceil(wait / 1000));
      return c.json({ error: 'rate_limited', retryAfter: Number(seconds) }, 429, { 'Retry-After': seconds });
    }
    loginChecks++;
    let ok = false;
    try {
      const body: unknown = await c.req.json().catch(() => null);
      const password = isRecord(body) && typeof body.password === 'string' ? body.password : '';
      ok = password.length > 0 && (await verifyPassword(password, cfg.passwordHash));
    } finally {
      loginChecks--;
    }
    if (!ok) return c.json({ error: 'bad_password' }, 401);
    limiter.refund(client);
    const session = sessions.create(t);
    setCookie(c, cookieName, session.token, {
      httpOnly: true,
      secure: cfg.cookieSecure,
      sameSite: 'Strict',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return c.json({ authenticated: true, csrf: session.csrf });
  });

  const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
    const session = sessions.get(getCookie(c, cookieName), now().getTime());
    if (!session) return c.json({ error: 'unauthenticated' }, 401);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const token = c.req.header('x-csrf-token') ?? '';
      if (!safeEqual(token, session.csrf)) return c.json({ error: 'bad_csrf' }, 403);
    }
    c.set('csrf', session.csrf);
    await next();
  };

  api.post('/logout', requireAuth, (c) => {
    sessions.destroy(getCookie(c, cookieName));
    deleteCookie(c, cookieName, { path: '/', secure: cfg.cookieSecure });
    return c.json({ authenticated: false });
  });

  function snapshot() {
    const nowIso = now().toISOString();
    const artworks = cfg.db.listArtworks();
    const counts = new Map<string, number>();
    for (const a of artworks) counts.set(a.album, (counts.get(a.album) ?? 0) + 1);
    return {
      albums: cfg.db.listAlbums().map((a) => albumJson(a, counts)),
      artworks: artworks.map((a) => artworkJson(a, nowIso)),
      embeddedArtworkCount: embeddedIds.size,
      maxUploadBytes: MAX_PNG_BYTES,
    };
  }

  api.get('/state', requireAuth, (c) => c.json(snapshot()));

  api.post(
    '/convert',
    requireAuth,
    bodyLimit({ maxSize: UPLOAD_LIMIT, onError: (c) => c.json({ error: 'too_large', message: 'Le PNG dépasse 1 Mo.' }, 413) }),
    async (c) => {
      const form = await c.req.parseBody().catch(() => null);
      const file = form?.file;
      if (!(file instanceof File)) return c.json({ error: 'invalid', message: 'Aucun fichier PNG reçu.' }, 400);
      if (file.size > MAX_PNG_BYTES) return c.json({ error: 'too_large', message: 'Le PNG dépasse 1 Mo.' }, 413);
      const maxColors = typeof form?.maxColors === 'string' ? Number(form.maxColors) : undefined;
      try {
        const grid = convertPng(Buffer.from(await file.arrayBuffer()), maxColors);
        const preview = renderPreview(grid);
        return c.json({ ...grid, preview: `data:image/png;base64,${preview.toString('base64')}` });
      } catch (e) {
        if (e instanceof ConvertError) return c.json({ error: 'invalid', message: e.message }, 422);
        throw e;
      }
    },
  );

  const jsonLimit = bodyLimit({ maxSize: JSON_LIMIT, onError: (c) => c.json({ error: 'too_large' }, 413) });

  async function readJson(c: Context): Promise<unknown> {
    if (!(c.req.header('content-type') ?? '').startsWith('application/json')) return null;
    return c.req.json().catch(() => null);
  }

  /** Album checks shared by create/update; returns the album ids known after the operation. */
  function checkAlbum(meta: ArtworkMetaInput): { errors: FieldError[]; albumIds: Set<string> } {
    const albumIds = new Set(cfg.db.listAlbums().map((a) => a.id));
    const errors: FieldError[] = [];
    if (meta.newAlbum) {
      if (albumIds.has(meta.newAlbum.id)) errors.push({ field: 'newAlbum.id', message: 'Cet album existe déjà : choisis-le dans la liste.' });
      albumIds.add(meta.newAlbum.id);
    } else if (!albumIds.has(meta.album)) {
      errors.push({ field: 'album', message: `Album inconnu « ${meta.album} ».` });
    }
    return { errors, albumIds };
  }

  function insertNewAlbum(meta: ArtworkMetaInput, nowIso: string) {
    if (!meta.newAlbum) return;
    cfg.db.insertAlbum({
      id: meta.newAlbum.id,
      titleFr: meta.newAlbum.titleFr,
      titleEn: meta.newAlbum.titleEn,
      access: meta.newAlbum.access,
      order: cfg.db.nextAlbumOrder(),
      updatedAt: nowIso,
    });
  }

  function transaction<T>(fn: () => T): T {
    cfg.db.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      cfg.db.db.exec('COMMIT');
      return result;
    } catch (e) {
      cfg.db.db.exec('ROLLBACK');
      throw e;
    }
  }

  function buildSource(id: string, meta: ArtworkMetaInput, w: unknown, h: unknown, palette: unknown, rows: unknown): unknown {
    return {
      v: 1,
      id,
      album: meta.album,
      title: { fr: meta.titleFr, en: meta.titleEn },
      w,
      h,
      palette,
      rows,
      access: accessToSource(meta.access),
      difficulty: meta.difficulty,
    };
  }

  function stats(source: ArtworkSource): { cells: number; colors: number } {
    const { cells } = decode(source.rows, source.w, source.h, source.palette.length);
    let n = 0;
    for (const v of cells) if (v > 0) n++;
    return { cells: n, colors: source.palette.length };
  }

  api.post('/artworks', requireAuth, jsonLimit, async (c) => {
    const nowIso = now().toISOString();
    let input;
    try {
      input = parseArtworkCreate(await readJson(c), nowIso);
    } catch (e) {
      if (e instanceof InputError) return fieldErrors(c, e.errors);
      throw e;
    }
    if (embeddedIds.has(input.id)) {
      return fieldErrors(c, [{ field: 'id', message: 'Cet identifiant est déjà utilisé par une œuvre embarquée dans l’app.' }], 409);
    }
    if (cfg.db.getArtwork(input.id)) {
      return fieldErrors(c, [{ field: 'id', message: 'Une œuvre du catalogue utilise déjà cet identifiant.' }], 409);
    }
    const { errors, albumIds } = checkAlbum(input);
    if (errors.length) return fieldErrors(c, errors, 409);
    const source = buildSource(input.id, input, input.w, input.h, input.palette, input.rows);
    const issues = validateArtwork(source, { albumIds });
    if (issues.length) {
      return fieldErrors(c, issues.map((i) => ({ field: i.where, message: formatIssue(i) })));
    }
    const valid = source as ArtworkSource;
    const record = transaction(() => {
      insertNewAlbum(input, nowIso);
      const { sha256: hash } = store.write(valid, 1);
      const rec: ArtworkRecord = {
        id: valid.id,
        album: valid.album,
        titleFr: valid.title.fr,
        titleEn: valid.title.en,
        access: input.access,
        difficulty: valid.difficulty,
        w: valid.w,
        h: valid.h,
        ...stats(valid),
        rev: 1,
        sha256: hash,
        status: input.publication.status,
        publishedAt: input.publication.publishedAt,
        everPublished: input.publication.status === 'published',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      cfg.db.insertArtwork(rec);
      touch();
      return rec;
    });
    return c.json({ artwork: artworkJson(record, nowIso) }, 201);
  });

  api.patch('/artworks/:id', requireAuth, jsonLimit, async (c) => {
    const id = c.req.param('id');
    const current = isValidId(id) ? cfg.db.getArtwork(id) : null;
    if (!current) return c.json({ error: 'not_found' }, 404);
    const nowIso = now().toISOString();
    const raw = await readJson(c);
    // `keep` leaves the publication state untouched (editing a published artwork's title).
    const keep = isRecord(raw) && isRecord(raw.publish) && raw.publish.mode === 'keep';
    let input: ArtworkMetaInput;
    try {
      input = parseArtworkUpdate(keep && isRecord(raw) ? { ...raw, publish: { mode: 'draft' } } : raw, nowIso);
    } catch (e) {
      if (e instanceof InputError) return fieldErrors(c, e.errors);
      throw e;
    }
    if (keep) input.publication = { status: current.status, publishedAt: current.publishedAt };
    const { errors, albumIds } = checkAlbum(input);
    if (errors.length) return fieldErrors(c, errors, 409);
    const old = store.readSource(current.id, current.rev);
    const oldIssues = validateArtwork(old);
    if (!isRecord(old) || oldIssues.length) {
      return c.json({ error: 'corrupt', message: 'Le fichier de l’œuvre est illisible : restaure une sauvegarde.' }, 500);
    }
    const source = buildSource(current.id, input, old.w, old.h, old.palette, old.rows);
    const issues = validateArtwork(source, { albumIds });
    if (issues.length) return fieldErrors(c, issues.map((i) => ({ field: i.where, message: formatIssue(i) })));
    const valid = source as ArtworkSource;
    const changed = JSON.stringify(valid) !== JSON.stringify(old);
    const record = transaction(() => {
      insertNewAlbum(input, nowIso);
      let { rev, sha256: hash } = current;
      if (changed) {
        rev = current.rev + 1;
        hash = store.write(valid, rev).sha256;
      }
      const rec: ArtworkRecord = {
        ...current,
        album: valid.album,
        titleFr: valid.title.fr,
        titleEn: valid.title.en,
        access: input.access,
        difficulty: valid.difficulty,
        rev,
        sha256: hash,
        status: input.publication.status,
        publishedAt: input.publication.publishedAt,
        everPublished: current.everPublished || input.publication.status === 'published',
        updatedAt: nowIso,
      };
      cfg.db.updateArtwork(rec);
      touch();
      return rec;
    });
    return c.json({ artwork: artworkJson(record, nowIso) });
  });

  api.post('/artworks/:id/unpublish', requireAuth, (c) => {
    const id = c.req.param('id');
    const current = isValidId(id) ? cfg.db.getArtwork(id) : null;
    if (!current) return c.json({ error: 'not_found' }, 404);
    const nowIso = now().toISOString();
    const rec: ArtworkRecord = { ...current, status: 'draft', publishedAt: null, updatedAt: nowIso };
    transaction(() => {
      cfg.db.updateArtwork(rec);
      touch();
    });
    return c.json({ artwork: artworkJson(rec, nowIso) });
  });

  api.delete('/artworks/:id', requireAuth, (c) => {
    const id = c.req.param('id');
    const current = isValidId(id) ? cfg.db.getArtwork(id) : null;
    if (!current) return c.json({ error: 'not_found' }, 404);
    if (current.everPublished) {
      return c.json(
        { error: 'published', message: 'Une œuvre déjà publiée ne peut pas être supprimée (les joueurs peuvent l’avoir commencée) : dépublie-la.' },
        409,
      );
    }
    cfg.db.deleteArtwork(id);
    store.removeAll(id);
    return c.json({ deleted: id });
  });

  api.get('/artworks/:id/preview.png', requireAuth, (c) => {
    const id = c.req.param('id');
    const current = isValidId(id) ? cfg.db.getArtwork(id) : null;
    const source = current ? store.readSource(current.id, current.rev) : null;
    if (!current || !isRecord(source) || validateArtwork(source).length) return c.json({ error: 'not_found' }, 404);
    const png = renderPreview(source as unknown as ArtworkSource);
    return c.body(new Uint8Array(png), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' });
  });

  api.post('/albums', requireAuth, jsonLimit, async (c) => {
    let input;
    try {
      input = parseAlbum(await readJson(c), true);
    } catch (e) {
      if (e instanceof InputError) return fieldErrors(c, e.errors);
      throw e;
    }
    if (cfg.db.getAlbum(input.id)) return fieldErrors(c, [{ field: 'id', message: 'Cet album existe déjà.' }], 409);
    const nowIso = now().toISOString();
    cfg.db.insertAlbum({ ...input, updatedAt: nowIso });
    touch();
    return c.json({ album: cfg.db.getAlbum(input.id) }, 201);
  });

  api.patch('/albums/:id', requireAuth, jsonLimit, async (c) => {
    const id = c.req.param('id');
    const current = isValidId(id) ? cfg.db.getAlbum(id) : null;
    if (!current) return c.json({ error: 'not_found' }, 404);
    if (current.builtin) {
      return c.json({ error: 'builtin', message: 'Album embarqué dans l’app : ses titres et son ordre se modifient dans src/content.' }, 409);
    }
    let input;
    try {
      input = parseAlbum(await readJson(c), false);
    } catch (e) {
      if (e instanceof InputError) return fieldErrors(c, e.errors);
      throw e;
    }
    const nowIso = now().toISOString();
    cfg.db.updateAlbum({ ...input, id, updatedAt: nowIso });
    touch();
    return c.json({ album: cfg.db.getAlbum(id) });
  });

  app.route('/admin/api', api);
  return app;
}
