import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashPassword, parsePasswordHash, verifyPassword } from '../src/password';
import { authed, login, ORIGIN, PASSWORD, setup, type TestEnv } from './helpers';

let env: TestEnv;
beforeEach(async () => {
  env = await setup();
});
afterEach(() => env.cleanup());

function tryLogin(password: string, ip = '198.51.100.7', origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip };
  if (origin) headers.Origin = origin;
  return env.app.request('/admin/api/login', { method: 'POST', headers, body: JSON.stringify({ password }) });
}

describe('password hashing', () => {
  it('round-trips with scrypt and uses a .env-safe format', async () => {
    const hash = await hashPassword('hunter2-but-longer', 1 << 14);
    expect(hash).toMatch(/^scrypt:16384:8:1:[\w-]+:[\w-]+$/);
    expect(hash).not.toContain('$');
    expect(parsePasswordHash(hash)).not.toBeNull();
    expect(await verifyPassword('hunter2-but-longer', hash)).toBe(true);
    expect(await verifyPassword('hunter2', hash)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});

describe('login', () => {
  it('rejects a wrong password without setting a cookie', async () => {
    const res = await tryLogin('wrong password');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('sets a hardened session cookie on success', async () => {
    const res = await tryLogin(PASSWORD);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__Host-pj_admin=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it('refuses cross-origin or origin-less login attempts', async () => {
    expect((await tryLogin(PASSWORD, '1.1.1.1', 'https://evil.test')).status).toBe(403);
    expect((await tryLogin(PASSWORD, '1.1.1.1', null)).status).toBe(403);
  });

  it('rate-limits failed attempts per client, even with the right password', async () => {
    for (let i = 0; i < 3; i++) expect((await tryLogin('nope')).status).toBe(401);
    const blocked = await tryLogin(PASSWORD);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another client is not affected.
    expect((await tryLogin(PASSWORD, '192.0.2.50')).status).toBe(200);
    // The window expires.
    env.setNow(new Date('2026-06-01T12:02:00Z'));
    expect((await tryLogin(PASSWORD)).status).toBe(200);
  });

  it('has a global limit across clients', async () => {
    for (let i = 0; i < 10; i++) await tryLogin('nope', `10.0.0.${i}`);
    expect((await tryLogin(PASSWORD, '10.0.1.1')).status).toBe(429);
  });
});

describe('session + CSRF', () => {
  it('requires a session for the admin API', async () => {
    expect((await env.app.request('/admin/api/state')).status).toBe(401);
    const s = await login(env);
    expect((await env.app.request('/admin/api/state', authed(s))).status).toBe(200);
  });

  it('rejects state-changing requests without a valid CSRF token', async () => {
    const s = await login(env);
    const body = { id: 'new-album', titleFr: 'Nouveau', titleEn: 'New', access: 'free', order: 9 };
    const noToken = await env.app.request('/admin/api/albums', authed({ ...s, csrf: '' }, { method: 'POST' }, body));
    expect(noToken.status).toBe(403);
    const badToken = await env.app.request('/admin/api/albums', authed({ ...s, csrf: 'x'.repeat(43) }, { method: 'POST' }, body));
    expect(badToken.status).toBe(403);
    const ok = await env.app.request('/admin/api/albums', authed(s, { method: 'POST' }, body));
    expect(ok.status).toBe(201);
  });

  it('rejects a valid token sent from another origin', async () => {
    const s = await login(env);
    const init = authed(s, { method: 'POST' }, { id: 'x-album', titleFr: 'X', titleEn: 'X', access: 'free', order: 1 });
    (init.headers as Headers).set('Origin', 'https://evil.test');
    expect((await env.app.request('/admin/api/albums', init)).status).toBe(403);
  });

  it('invalidates the session on logout', async () => {
    const s = await login(env);
    expect((await env.app.request('/admin/api/logout', authed(s, { method: 'POST' }))).status).toBe(200);
    expect((await env.app.request('/admin/api/state', authed(s))).status).toBe(401);
  });

  it('serves the admin page with a strict CSP', async () => {
    const res = await env.app.request('/admin/');
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
