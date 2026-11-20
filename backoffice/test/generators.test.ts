import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ArtworkSource } from '../src/artwork-lib';
import { decode, deltaE76, validateArtwork } from '../src/artwork-lib';
import type { GeneratorId } from '../src/generators';
import { describeGenerators, generate, GENERATOR_IDS, GenerateTimeoutError, gridStats, ParamError, suggestTitle, toArtworkSource } from '../src/generators';
import { normalizeSeed, Rng } from '../src/generators/prng';
import { Raster } from '../src/generators/raster';

const DRAWING: GeneratorId[] = GENERATOR_IDS.filter((g) => g !== 'remix');
const fox = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'src', 'content', 'artworks', 'animals', 'fox.json'), 'utf8')) as ArtworkSource;
const resolveSource = (kind: string, id: string) => (kind === 'embedded' && id === 'fox' ? fox : null);

function asSource(art: ReturnType<typeof generate>) {
  return toArtworkSource(art, { id: 'gen-test', album: 'garden', title: { fr: 'T', en: 'T' }, access: 'free' });
}

describe('prng', () => {
  it('is deterministic and accepts integer or string seeds', () => {
    const a = new Rng('hello');
    const b = new Rng('hello');
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(new Rng('hello').next()).not.toBe(new Rng('hellp').next());
    expect(normalizeSeed(4821)).toBe('4821');
    expect(normalizeSeed(' étoile-7 ')).toBe('étoile-7');
    expect(normalizeSeed(-1)).toBeNull();
    expect(normalizeSeed(1.5)).toBeNull();
    expect(normalizeSeed('x'.repeat(33))).toBeNull();
    expect(normalizeSeed('<script>')).toBeNull();
    expect(normalizeSeed({})).toBeNull();
  });
});

describe('generators', () => {
  it.each(DRAWING)('%s: same seed + params = same artwork; another seed differs', (g) => {
    const params = { width: 48, height: 48, colors: 10 };
    const a = generate(g, params, 4821);
    const b = generate(g, params, '4821');
    expect(b.rows).toEqual(a.rows);
    expect(b.palette).toEqual(a.palette);
    const c = generate(g, params, 4822);
    expect(JSON.stringify([c.rows, c.palette])).not.toBe(JSON.stringify([a.rows, a.palette]));
  });

  it.each(DRAWING)('%s: valid ArtworkSource at 16, 64, 256 and non-square, within budget, no orphans', (g) => {
    for (const [width, height] of [
      [16, 16],
      [64, 64],
      [256, 256],
      [96, 64],
      [40, 80],
    ]) {
      for (const seed of [1, 2]) {
        const art = generate(g, { width, height, colors: 12 }, seed);
        expect(art.w).toBe(width);
        expect(art.h).toBe(height);
        expect(validateArtwork(asSource(art))).toEqual([]);
        expect(art.palette.length).toBeGreaterThanOrEqual(2);
        expect(art.palette.length).toBeLessThanOrEqual(12);
        // Every color is used (validateArtwork) and pairs are ΔE76 ≥ 10.
        for (let i = 0; i < art.palette.length; i++)
          for (let j = i + 1; j < art.palette.length; j++) expect(deltaE76(art.palette[i], art.palette[j])).toBeGreaterThanOrEqual(10);
        expect(art.stats.orphanRatio).toBeLessThanOrEqual(0.002);
        expect(art.ms).toBeLessThan(1000);
      }
    }
  });

  it('respects the color budget from 4 to 24', () => {
    for (const g of DRAWING) {
      expect(generate(g, { width: 64, height: 64, colors: 4 }, 3).palette.length).toBeLessThanOrEqual(4);
      expect(generate(g, { width: 64, height: 64, colors: 24 }, 3).palette.length).toBeLessThanOrEqual(24);
    }
  });

  it('refuses out-of-range, unknown and malformed parameters', () => {
    const bad = [
      { width: 15 },
      { width: 257 },
      { width: 256, height: 100 },
      { colors: 3 },
      { colors: 25 },
      { colors: 10.5 },
      { palette: 'nope' },
      { difficulty: '4' },
      { folds: '5' },
      { mirror: 'yes' },
      { unknown: 1 },
    ];
    for (const params of bad) expect(() => generate('mandala', params, 1), JSON.stringify(params)).toThrow(ParamError);
    expect(() => generate('mandala', 'nope', 1)).toThrow(ParamError);
    expect(() => generate('mandala', {}, -3)).toThrow(ParamError);
    expect(() => generate('landscape', { layers: 6 }, 1)).toThrow(ParamError);
    try {
      generate('pattern', { width: 8, colors: 99 }, 1);
    } catch (e) {
      expect((e as ParamError).issues.map((i) => i.field).sort()).toEqual(['params.colors', 'params.width']);
    }
  });

  it('forced difficulty wins over the estimate', () => {
    expect(generate('pattern', { width: 256, height: 256, difficulty: '1' }, 1).difficulty).toBe(1);
    expect(generate('pattern', { width: 16, height: 16, difficulty: '3' }, 1).difficulty).toBe(3);
    const small = generate('mandala', { width: 24, height: 24, colors: 6 }, 1);
    const big = generate('mandala', { width: 256, height: 256, colors: 20 }, 1);
    expect(small.stats.estimatedDifficulty).toBeLessThan(big.stats.estimatedDifficulty);
  });

  it('times out past the budget', () => {
    let t = 0;
    expect(() => generate('landscape', { width: 128, height: 128 }, 1, { budgetMs: 5, now: () => (t += 10) })).toThrow(GenerateTimeoutError);
  });

  it('every generator kind option renders', () => {
    for (const kind of ['tiles', 'waves', 'checker', 'quilt', 'chevron', 'iso'])
      expect(validateArtwork(asSource(generate('pattern', { kind, width: 64, height: 48 }, 5)))).toEqual([]);
    for (const kind of ['tree', 'bush', 'flower', 'bouquet'])
      expect(validateArtwork(asSource(generate('plant', { kind, width: 64, height: 64 }, 5)))).toEqual([]);
    for (const kind of ['creature', 'robot', 'insect'])
      expect(validateArtwork(asSource(generate('creature', { kind, width: 64, height: 64, background: false }, 5)))).toEqual([]);
    for (const sky of ['day', 'sunset', 'night'])
      expect(validateArtwork(asSource(generate('landscape', { sky, width: 64, height: 64, water: false }, 5)))).toEqual([]);
  });

  it('describes generators and suggests titles', () => {
    const d = describeGenerators();
    expect(d.map((g) => g.id)).toEqual([...GENERATOR_IDS]);
    expect(d.every((g) => g.params.length > 0)).toBe(true);
    expect(suggestTitle('mandala', '4821')).toEqual({ fr: 'Mandala n°4821', en: 'Mandala #4821' });
    expect(suggestTitle('plant', 'abc').fr).toMatch(/^Plante n°\d+$/);
  });
});

describe('remix', () => {
  const cellsOf = (a: { rows: string[]; w: number; h: number; palette: string[] }) => decode(a.rows, a.w, a.h, a.palette.length).cells;

  /** Same partition of the grid into colors (up to a renumbering of the palette). */
  function samePartition(a: Uint8Array, b: Uint8Array) {
    const map = new Map<number, number>();
    const back = new Map<number, number>();
    for (let i = 0; i < a.length; i++) {
      if (map.has(a[i]) && map.get(a[i]) !== b[i]) return false;
      if (back.has(b[i]) && back.get(b[i]) !== a[i]) return false;
      map.set(a[i], b[i]);
      back.set(b[i], a[i]);
    }
    return true;
  }

  it.each([
    { mode: 'hue', hue: 120 },
    { mode: 'hue', hue: 180 },
    { mode: 'palette', palette: 'forest' },
    { mode: 'palette', palette: 'random' },
  ])('keeps the structure, size and colors count (%o)', (variant) => {
    const art = generate('remix', { source: 'embedded:fox', ...variant }, 9, { resolveSource });
    expect(validateArtwork(asSource(art))).toEqual([]);
    expect([art.w, art.h]).toEqual([fox.w, fox.h]);
    expect(art.palette.length).toBe(fox.palette.length);
    expect(art.palette).not.toEqual(fox.palette);
    expect(samePartition(cellsOf(fox), cellsOf(art))).toBe(true);
    expect(art.difficulty).toBe(fox.difficulty);
  });

  it('refuses unknown or malformed sources', () => {
    expect(() => generate('remix', { source: 'embedded:nope' }, 1, { resolveSource })).toThrow(ParamError);
    expect(() => generate('remix', { source: 'file:/etc/passwd' }, 1, { resolveSource })).toThrow(ParamError);
    expect(() => generate('remix', {}, 1, { resolveSource })).toThrow(ParamError);
    expect(() => generate('remix', { source: 'embedded:fox', hue: 400 }, 1, { resolveSource })).toThrow(ParamError);
  });
});

describe('raster cleanup', () => {
  it('merges orphan cells and specks into their surroundings', () => {
    const r = new Raster(8, 8).fill(1);
    r.set(3, 3, 2);
    r.set(5, 5, 3);
    r.set(6, 5, 3);
    r.cleanSmallRegions(3);
    expect([...r.data].every((v) => v === 1)).toBe(true);
    const st = gridStats(Uint8Array.from(r.data), 8, 8);
    expect(st).toEqual({ cells: 64, regions: 1, orphans: 0 });
  });

  it('4-connected lines never break into diagonal-only steps', () => {
    const r = new Raster(20, 20).line4(1, 2, 17, 13, 1);
    const st = gridStats(Uint8Array.from(r.data), 20, 20);
    expect(st.orphans).toBe(0);
    expect(st.regions).toBe(1);
  });
});
