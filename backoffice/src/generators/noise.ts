/** Value noise (1D and 2D) with smooth interpolation and fractal sums, driven by a seeded Rng. */
import type { Rng } from './prng';

const smooth = (t: number) => t * t * (3 - 2 * t);

export class ValueNoise {
  private readonly table: Float64Array;
  private readonly perm: Uint16Array;

  constructor(rng: Rng, size = 256) {
    this.table = new Float64Array(size);
    for (let i = 0; i < size; i++) this.table[i] = rng.next();
    this.perm = new Uint16Array(size * 2);
    const p = rng.shuffle(Array.from({ length: size }, (_, i) => i));
    for (let i = 0; i < size * 2; i++) this.perm[i] = p[i % size];
  }

  private v1(i: number): number {
    return this.table[this.perm[i & 255]];
  }

  private v2(i: number, j: number): number {
    return this.table[this.perm[(this.perm[i & 255] + j) & 511]];
  }

  /** 1D noise in [0, 1). */
  noise1(x: number): number {
    const i = Math.floor(x);
    const t = smooth(x - i);
    return this.v1(i) * (1 - t) + this.v1(i + 1) * t;
  }

  /** 2D noise in [0, 1). */
  noise2(x: number, y: number): number {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const tx = smooth(x - i);
    const ty = smooth(y - j);
    const a = this.v2(i, j) * (1 - tx) + this.v2(i + 1, j) * tx;
    const b = this.v2(i, j + 1) * (1 - tx) + this.v2(i + 1, j + 1) * tx;
    return a * (1 - ty) + b * ty;
  }

  /** Fractal 1D noise normalized to [0, 1). */
  fbm1(x: number, octaves = 4, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise1(x * f + o * 17.3);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }

  fbm2(x: number, y: number, octaves = 4, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * f + o * 31.7, y * f - o * 11.1);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }
}
