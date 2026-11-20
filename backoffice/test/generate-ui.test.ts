import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { describeGenerators } from '../src/generators';

const dir = join(import.meta.dirname, '..', 'public', 'admin');

interface Helpers {
  SIZE_PRESETS: number[];
  sizeFromPreset(size: number | string, format: string): { width: number; height: number };
  buildParams(d: unknown, values: Record<string, unknown>): Record<string, unknown>;
  suggestId(generator: string, seed: string, taken: string[]): string;
  formatStats(p: unknown): string;
  zoomedSize(w: number, h: number, z: number | string): { width: number; height: number };
  defaultZoom(w: number, h: number): number;
  randomSeed(r?: () => number): number;
  inkOn(hex: string): string;
}

function load(): Helpers {
  const ctx = createContext({});
  runInContext(readFileSync(join(dir, 'generate.js'), 'utf8'), ctx);
  return (ctx as { PixelJoyGenerate: Helpers }).PixelJoyGenerate;
}

describe('generate.js helpers', () => {
  const G = load();

  it('size presets cover 32..256 and formats stay within the 2:1 limit', () => {
    expect(G.SIZE_PRESETS).toEqual([32, 64, 96, 128, 192, 256]);
    expect(G.sizeFromPreset(128, 'square')).toEqual({ width: 128, height: 128 });
    expect(G.sizeFromPreset(256, 'landscape')).toEqual({ width: 256, height: 192 });
    expect(G.sizeFromPreset(256, 'portrait')).toEqual({ width: 192, height: 256 });
    expect(G.sizeFromPreset(32, 'wide')).toEqual({ width: 32, height: 16 });
    expect(G.sizeFromPreset(999, 'nope')).toEqual({ width: 256, height: 256 });
  });

  it('types params after the server descriptor and drops unknown keys', () => {
    const mandala = describeGenerators().find((g) => g.id === 'mandala')!;
    const params = G.buildParams(JSON.parse(JSON.stringify(mandala)), { width: '64', height: '64', colors: '12', palette: 'ocean', mirror: false, folds: '8', evil: 'x', difficulty: '' });
    expect({ ...params }).toEqual({ width: 64, height: 64, colors: 12, palette: 'ocean', mirror: false, folds: '8' });
  });

  it('suggests unique kebab-case ids', () => {
    expect(G.suggestId('mandala', '4821', [])).toBe('mandala-4821');
    expect(G.suggestId('mandala', '4821', ['mandala-4821', 'mandala-4821-2'])).toBe('mandala-4821-3');
    expect(G.suggestId('plant', 'Été Doré!', [])).toBe('plant-ete-dore');
    expect(G.suggestId('plant', 'x'.repeat(60), []).length).toBeLessThanOrEqual(48);
  });

  it('formats stats, zoom and swatch ink', () => {
    expect(G.formatStats({ w: 64, h: 48, stats: { cells: 3072, colors: 12 }, difficulty: 2, ms: 18 })).toBe('64 × 48 · 3 072 cases · 12 couleurs · difficulté Moyen · 18 ms');
    expect({ ...G.zoomedSize(64, 32, 4) }).toEqual({ width: 256, height: 128 });
    expect({ ...G.zoomedSize(64, 32, 99) }).toEqual({ width: 1024, height: 512 });
    expect(G.defaultZoom(256, 256)).toBe(2);
    expect(G.defaultZoom(16, 16)).toBe(16);
    expect(G.randomSeed(() => 0)).toBe(1);
    expect(G.randomSeed(() => 0.999999999)).toBe(999999);
    expect(G.inkOn('#FFFFFF')).toBe('#1B1A2E');
    expect(G.inkOn('#1B1A2E')).toBe('#FFFFFF');
  });
});

describe('admin UI files', () => {
  it('never uses innerHTML and is served under the strict CSP', async () => {
    for (const f of ['admin.js', 'generate.js']) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<script src="/admin/generate.js" defer></script>');
    expect(html).not.toMatch(/<script>|style="/);
    expect(html).toContain('id="tab-generate"');
  });

  it('serves generate.js', async () => {
    const { setup } = await import('./helpers');
    const env = await setup();
    const res = await env.app.request('/admin/generate.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    env.cleanup();
  });
});
