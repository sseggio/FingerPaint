/**
 * Admin password hashing with scrypt (node:crypto, no native dependency).
 * Format: `scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>` — no `$`, so the value can be
 * pasted as-is into a Docker Compose `.env` file (where `$` would be interpolated).
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 32;
const DEFAULT_N = 1 << 15;
const DEFAULT_R = 8;
const DEFAULT_P = 1;

interface Params {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function derive(password: string, salt: Buffer, N: number, r: number, p: number, keyLen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, keyLen, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export function parsePasswordHash(value: string): Params | null {
  const parts = value.trim().split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64url');
  const hash = Buffer.from(parts[5], 'base64url');
  const pow2 = Number.isInteger(N) && N >= 1 << 14 && N <= 1 << 20 && (N & (N - 1)) === 0;
  if (!pow2 || !Number.isInteger(r) || r < 8 || r > 32 || !Number.isInteger(p) || p < 1 || p > 4) return null;
  if (salt.length < 16 || hash.length < 32) return null;
  return { N, r, p, salt, hash };
}

export async function hashPassword(password: string, N = DEFAULT_N): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, DEFAULT_R, DEFAULT_P, KEY_LEN);
  return ['scrypt', N, DEFAULT_R, DEFAULT_P, salt.toString('base64url'), hash.toString('base64url')].join(':');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const params = parsePasswordHash(stored);
  if (!params || password.length === 0 || password.length > 1024) return false;
  const candidate = await derive(password, params.salt, params.N, params.r, params.p, params.hash.length);
  return timingSafeEqual(candidate, params.hash);
}
