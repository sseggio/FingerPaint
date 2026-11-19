/**
 * The app behind a reverse proxy that terminates TLS (the host's Nginx in "nginx" mode, or Caddy):
 * the proxy talks plain HTTP to 127.0.0.1:<port> (seen by the container as the docker-proxy
 * gateway, a private address) and forwards Host, X-Forwarded-For and X-Forwarded-Proto.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { HSTS_VALUE, isTrustedProxyPeer } from '../src/app';
import { ORIGIN, PASSWORD, setup, type TestEnv } from './helpers';

let env: TestEnv | undefined;
afterEach(() => env?.cleanup());

const PUBLIC_HOST = new URL(ORIGIN).host;

/** A login request as Nginx forwards it (proxy_set_header Host $host, X-Forwarded-*). */
function viaNginx(e: TestEnv, opts: { password?: string; xff?: string; host?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Host: opts.host ?? PUBLIC_HOST,
    'X-Forwarded-Proto': 'https',
    'X-Forwarded-Host': PUBLIC_HOST,
    'X-Forwarded-For': opts.xff ?? '198.51.100.20',
  };
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  return e.app.request(`http://127.0.0.1:8787/admin/api/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: opts.password ?? PASSWORD }),
  });
}

describe('trusted proxy peers', () => {
  it('accepts loopback and private (Docker) addresses only', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '172.18.0.1', '172.31.255.254', '10.0.0.3', '192.168.1.2', 'fd00::1', 'fe80::1']) {
      expect(isTrustedProxyPeer(a)).toBe(true);
    }
    for (const a of ['203.0.113.9', '172.32.0.1', '172.15.0.1', '8.8.8.8', '::ffff:8.8.8.8', '2001:db8::1', '', 'unknown']) {
      expect(isTrustedProxyPeer(a)).toBe(false);
    }
  });
});

describe('behind Nginx terminating TLS', () => {
  it('sets the __Host- Secure session cookie although the hop to the app is plain HTTP', async () => {
    env = await setup({ remoteAddress: '172.18.0.1' });
    const res = await viaNginx(env);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__Host-pj_admin=/);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('checks Origin against the public URL, whatever Host the proxy forwards', async () => {
    env = await setup({ remoteAddress: '172.18.0.1' });
    expect((await viaNginx(env, { host: '127.0.0.1:8787' })).status).toBe(200);
    expect((await viaNginx(env, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await viaNginx(env, { origin: null })).status).toBe(403);
  });

  it('does not trust X-Forwarded-Host for the Origin check', async () => {
    env = await setup({ remoteAddress: '172.18.0.1' });
    const res = await env.app.request('http://127.0.0.1:8787/admin/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: '127.0.0.1:8787',
        'X-Forwarded-Host': 'evil.test',
        Origin: 'https://evil.test',
      },
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(res.status).toBe(403);
  });

  it('rate-limits per client using the right-most X-Forwarded-For entry set by the local proxy', async () => {
    env = await setup({ remoteAddress: '172.18.0.1' });
    // A spoofed left-most entry does not give a fresh budget: Nginx appends the real address.
    for (let i = 0; i < 3; i++) {
      expect((await viaNginx(env, { password: 'nope', xff: `10.9.9.${i}, 198.51.100.20` })).status).toBe(401);
    }
    expect((await viaNginx(env, { xff: '1.2.3.4, 198.51.100.20' })).status).toBe(429);
    expect((await viaNginx(env, { xff: '198.51.100.21' })).status).toBe(200);
  });

  it('ignores X-Forwarded-For when the peer is not a local proxy', async () => {
    env = await setup({ remoteAddress: '203.0.113.9' });
    for (let i = 0; i < 3; i++) {
      expect((await viaNginx(env, { password: 'nope', xff: `198.51.100.${i}` })).status).toBe(401);
    }
    // Rotating X-Forwarded-For does not help: the client is the socket address.
    expect((await viaNginx(env, { xff: '198.51.100.99' })).status).toBe(429);
  });

  it('sends HSTS and the /admin security headers itself (not only via Caddy)', async () => {
    env = await setup({ remoteAddress: '172.18.0.1' });
    const admin = await env.app.request('http://127.0.0.1:8787/admin/', { headers: { Host: PUBLIC_HOST } });
    expect(admin.status).toBe(200);
    expect(admin.headers.get('strict-transport-security')).toBe(HSTS_VALUE);
    expect(admin.headers.get('content-security-policy')).toMatch(/default-src 'none'/);
    expect(admin.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
    expect(admin.headers.get('x-frame-options')).toBe('DENY');
    expect(admin.headers.get('x-content-type-options')).toBe('nosniff');
    expect(admin.headers.get('cache-control')).toBe('no-store');
    expect(admin.headers.get('server')).toBeNull();

    const manifest = await env.app.request('http://127.0.0.1:8787/catalog/v1/manifest.json');
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get('strict-transport-security')).toBe(HSTS_VALUE);
    expect(manifest.headers.get('etag')).toBeTruthy();
    expect(((await manifest.json()) as { v: number }).v).toBe(1);
  });

  it('does not send HSTS when the public URL is plain http (local development)', async () => {
    env = await setup({ publicUrl: 'http://localhost:8080' });
    const res = await env.app.request('/healthz');
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });
});

/**
 * Shared Traefik of infra/edge ("traefik" mode): it reaches the app over the Docker network "edge"
 * (a private address), passes the original Host and, with forwardedHeaders.insecure=false (its
 * default, set explicitly in infra/edge/docker-compose.yml), DROPS any X-Forwarded-* sent by the
 * client and sets X-Forwarded-For to the address of the TCP peer it accepted.
 */
const TRAEFIK_PEER = '172.20.0.2';

function viaTraefik(e: TestEnv, opts: { password?: string; xff?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Host: PUBLIC_HOST,
    'X-Forwarded-For': opts.xff ?? '198.51.100.20',
    'X-Forwarded-Host': PUBLIC_HOST,
    'X-Forwarded-Port': '443',
    'X-Forwarded-Proto': 'https',
    'X-Forwarded-Server': '3f2a1b0c9d8e',
    'X-Real-Ip': '198.51.100.20',
  };
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  return e.app.request('http://app:8080/admin/api/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: opts.password ?? PASSWORD }),
  });
}

describe('behind the shared Traefik (Docker network edge)', () => {
  it('sets the __Host- Secure session cookie (TLS terminated by Traefik)', async () => {
    expect(isTrustedProxyPeer(TRAEFIK_PEER)).toBe(true);
    env = await setup({ remoteAddress: TRAEFIK_PEER });
    const res = await viaTraefik(env);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__Host-pj_admin=/);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('checks Origin against the public URL (Traefik passes the original Host)', async () => {
    env = await setup({ remoteAddress: TRAEFIK_PEER });
    expect((await viaTraefik(env)).status).toBe(200);
    expect((await viaTraefik(env, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await viaTraefik(env, { origin: null })).status).toBe(403);
  });

  it('rate-limits per client address set by Traefik', async () => {
    env = await setup({ remoteAddress: TRAEFIK_PEER });
    for (let i = 0; i < 3; i++) {
      expect((await viaTraefik(env, { password: 'nope', xff: '198.51.100.20' })).status).toBe(401);
    }
    expect((await viaTraefik(env, { xff: '198.51.100.20' })).status).toBe(429);
    // Another client (another address written by Traefik) has its own budget.
    expect((await viaTraefik(env, { xff: '198.51.100.21' })).status).toBe(200);
  });

  it('keeps using the right-most entry if a client-supplied X-Forwarded-For ever got through', async () => {
    // Even with forwardedHeaders.insecure=true, Traefik appends the real peer at the end.
    env = await setup({ remoteAddress: TRAEFIK_PEER });
    for (let i = 0; i < 3; i++) {
      expect((await viaTraefik(env, { password: 'nope', xff: `10.9.9.${i}, 198.51.100.20` })).status).toBe(401);
    }
    expect((await viaTraefik(env, { xff: '203.0.113.77, 198.51.100.20' })).status).toBe(429);
  });

  it('ignores X-Forwarded-For from a public peer (app port reached directly)', async () => {
    env = await setup({ remoteAddress: '203.0.113.9' });
    for (let i = 0; i < 3; i++) {
      expect((await viaTraefik(env, { password: 'nope', xff: `198.51.100.${i}` })).status).toBe(401);
    }
    expect((await viaTraefik(env, { xff: '198.51.100.99' })).status).toBe(429);
  });

  it('sends HSTS itself on responses relayed by Traefik', async () => {
    env = await setup({ remoteAddress: TRAEFIK_PEER });
    const res = await env.app.request('http://app:8080/catalog/v1/manifest.json', { headers: { Host: PUBLIC_HOST } });
    expect(res.status).toBe(200);
    expect(res.headers.get('strict-transport-security')).toBe(HSTS_VALUE);
  });
});
