/**
 * scripts/png-to-artwork.mjs, run as artists would (Node child process) on 4×4 fixtures.
 */
import { execFileSync } from 'child_process';
import { join } from 'path';

import { decodeRow } from '@/lib/artwork/codec';
import { deltaE76, luminance } from '@/lib/artwork/color';

const SCRIPT = join(__dirname, 'png-to-artwork.mjs');
const FIXTURES = join(__dirname, '__fixtures__');

interface Converted {
  id: string;
  album: string;
  title: { fr: string; en: string };
  w: number;
  h: number;
  palette: string[];
  rows: string[];
  access: unknown;
  difficulty: number;
}

function convert(fixture: string, ...extra: string[]): Converted {
  const out = execFileSync(
    process.execPath,
    [SCRIPT, join(FIXTURES, fixture), '--id', 'tiny', '--album', 'garden', '--out', '-', ...extra],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out) as Converted;
}

// Fixture (both files): red red blue blue / red · blue blue / red ~red white white / black ×4,
// where "·" is transparent and "~red" is #FE0101 (ΔE < 10 from red).
const EXPECTED_ROWS = ['2C2B', 'C.2B', '2C2D', '4A'];

describe('png-to-artwork', () => {
  it('converts an RGBA PNG: luminance-sorted palette, RLE rows, transparent cells, near colors merged', () => {
    const art = convert('tiny-4x4-rgba.png', '--title-fr', 'Minuscule', '--title-en', 'Tiny', '--difficulty', '2');
    expect(art).toMatchObject({ id: 'tiny', album: 'garden', w: 4, h: 4, access: 'free', difficulty: 2 });
    expect(art.title).toEqual({ fr: 'Minuscule', en: 'Tiny' });
    expect(art.palette).toEqual(['#000000', '#0000FF', '#FF0000', '#FFFFFF']);
    expect(art.rows).toEqual(EXPECTED_ROWS);
  });

  it('reads indexed (palette + tRNS) PNGs the same way', () => {
    const art = convert('tiny-4x4-indexed.png', '--access', 'pack:ocean');
    expect(art.access).toEqual({ pack: 'ocean' });
    expect(art.palette).toEqual(['#000000', '#0000FF', '#FF0000', '#FFFFFF']);
    expect(art.rows).toEqual(EXPECTED_ROWS);
  });

  it('limits the number of colors and keeps the output valid', () => {
    const art = convert('tiny-4x4-rgba.png', '--max-colors', '2');
    expect(art.palette).toHaveLength(2);
    const lum = art.palette.map(luminance);
    expect([...lum].sort((a, b) => a - b)).toEqual(lum);
    expect(deltaE76(art.palette[0], art.palette[1])).toBeGreaterThanOrEqual(10);
    const cells = art.rows.map((row) => decodeRow(row, art.palette.length, art.w));
    expect(cells.every((row) => row.length === 4)).toBe(true);
    // Values: 0 (empty) plus the two palette entries.
    expect(new Set(cells.flat())).toEqual(new Set([0, 1, 2]));
  });

  it('rejects an invalid access value', () => {
    expect(() => convert('tiny-4x4-rgba.png', '--access', 'gold')).toThrow();
  });

  function run(args: string[]): { status: number | null; stderr: string } {
    try {
      execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: 0, stderr: '' };
    } catch (e) {
      const err = e as { status: number | null; stderr: string };
      return { status: err.status, stderr: String(err.stderr) };
    }
  }

  it('rejects a flag without a value', () => {
    const fixture = join(FIXTURES, 'tiny-4x4-rgba.png');
    expect(run([fixture, '--id', 'tiny', '--album', 'garden', '--out'])).toMatchObject({ status: 2 });
    const res = run([fixture, '--id', '--album', 'garden', '--out', '-']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--id needs a value');
  });

  it('validates --id and --album before reading the file', () => {
    // The input does not exist: a kebab-case error (not a read error) proves validation runs first.
    const res = run(['/nonexistent.png', '--id', '../evil', '--album', 'garden', '--out', '-']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('kebab-case');
  });
});
