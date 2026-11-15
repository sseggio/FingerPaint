/**
 * Admin authentication: one password (scrypt hash in ADMIN_PASSWORD_HASH), server-side sessions
 * (random token in an httpOnly cookie, only its HMAC is stored), a per-session CSRF token and an
 * in-memory login rate limiter. IP addresses are only kept in memory, for the limiter window,
 * and are never written to disk or logs.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { CatalogDb } from './db';

export const SESSION_COOKIE = '__Host-pj_admin';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class SessionManager {
  constructor(
    private readonly db: CatalogDb,
    private readonly secret: string,
  ) {}

  private hash(token: string): string {
    return createHmac('sha256', this.secret).update(token).digest('hex');
  }

  create(nowMs: number): { token: string; csrf: string; expiresAt: number } {
    this.db.purgeSessions(nowMs);
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    const expiresAt = nowMs + SESSION_TTL_MS;
    this.db.insertSession(this.hash(token), csrf, expiresAt);
    return { token, csrf, expiresAt };
  }

  get(token: string | undefined, nowMs: number): { csrf: string } | null {
    if (!token || token.length > 128) return null;
    return this.db.getSession(this.hash(token), nowMs);
  }

  destroy(token: string | undefined) {
    if (token && token.length <= 128) this.db.deleteSession(this.hash(token));
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface RateLimitOptions {
  /** Failed attempts allowed per client within the window. */
  perClient: number;
  /** Failed attempts allowed overall within the window (slows distributed guessing). */
  global: number;
  windowMs: number;
}

/** Fixed-window limiter on failed logins. Memory only; entries expire with their window. */
export class LoginRateLimiter {
  private readonly clients = new Map<string, { count: number; resetAt: number }>();
  private globalCount = 0;
  private globalResetAt = 0;

  constructor(private readonly opts: RateLimitOptions) {}

  /** Milliseconds to wait before another attempt, or 0 when allowed. */
  retryAfter(client: string, nowMs: number): number {
    if (nowMs >= this.globalResetAt) {
      this.globalCount = 0;
      this.globalResetAt = nowMs + this.opts.windowMs;
    }
    if (this.globalCount >= this.opts.global) return this.globalResetAt - nowMs;
    const entry = this.clients.get(client);
    if (!entry || nowMs >= entry.resetAt) return 0;
    return entry.count >= this.opts.perClient ? entry.resetAt - nowMs : 0;
  }

  fail(client: string, nowMs: number) {
    this.globalCount++;
    const entry = this.clients.get(client);
    if (!entry || nowMs >= entry.resetAt) this.clients.set(client, { count: 1, resetAt: nowMs + this.opts.windowMs });
    else entry.count++;
    if (this.clients.size > 10_000) {
      for (const [k, v] of this.clients) if (nowMs >= v.resetAt) this.clients.delete(k);
    }
  }

  succeed(client: string) {
    this.clients.delete(client);
  }
}
