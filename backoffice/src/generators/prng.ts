/**
 * Seeded PRNG (mulberry32) for the procedural generators: the same seed always gives the same
 * sequence on every platform (integer math only, no Math.random).
 */

/** A seed as typed by the admin: a short string or a non-negative integer. */
export type Seed = string | number;

export const MAX_SEED_LENGTH = 32;
const SEED_RE = /^[\p{L}\p{N} _.:#-]{1,32}$/u;

/** Canonical string form of a seed, or null when invalid. */
export function normalizeSeed(seed: unknown): string | null {
  if (typeof seed === 'number') {
    return Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? String(seed) : null;
  }
  if (typeof seed !== 'string') return null;
  const s = seed.normalize('NFC').trim();
  return SEED_RE.test(s) ? s : null;
}

/** FNV-1a 32-bit hash of a string, finalized with a murmur-style mix. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Fisher–Yates shuffle (returns a new array). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Independent child stream: adding draws to one feature never changes another's. */
  fork(label: string): Rng {
    return new Rng((hashString(label) ^ Math.imul(this.state, 0x9e3779b1)) >>> 0);
  }
}
