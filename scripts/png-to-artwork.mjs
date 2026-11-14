#!/usr/bin/env node
/**
 * Converts a pixel-art PNG (indexed/palette, RGB, RGBA or gray) into an artwork JSON
 * (`ArtworkSource`, see docs/artwork-format.md): one PNG pixel = one cell.
 *
 *   node scripts/png-to-artwork.mjs art.png --id sea-otter --album ocean \
 *     --title-fr "Loutre de mer" --title-en "Sea otter" [--access free|pro|pack:<id>] \
 *     [--difficulty 1|2|3] [--max-colors 24] [--out <file> | --out -]
 *
 * - Pixels with alpha < 128 become empty cells ('.').
 * - Colors are merged (the rarer into the more frequent, closest pair first) until there are
 *   at most `--max-colors` and every pair is at least ΔE76 10 apart, as the validator requires.
 * - The palette is sorted by luminance (color 1 = darkest); rows are RLE-encoded.
 * - Default output: src/content/artworks/<album>/<id>.json. `--out -` prints to stdout.
 * Then add the file to src/content/index.ts (or re-run `node scripts/generate-art.mjs`, which
 * keeps imported files in the manifest) and run `npm run validate:art`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { deltaE, encodeRow, KEYS, luminance } from './art/engine.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MIN_DELTA_E = 10;
export const DEFAULT_MAX_COLORS = 24;
/** Above this many distinct colors (photos, anti-aliasing), channels are first rounded. */
const PREQUANTIZE_ABOVE = 512;

const hex2 = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const toHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Decoded PNG → grid of hex colors (null = transparent). */
export function readPixels(buffer) {
  const png = PNG.sync.read(buffer);
  const grid = [];
  for (let y = 0; y < png.height; y++) {
    const row = [];
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      row.push(png.data[i + 3] < 128 ? null : toHex(png.data[i], png.data[i + 1], png.data[i + 2]));
    }
    grid.push(row);
  }
  return { width: png.width, height: png.height, grid };
}

function prequantize(grid) {
  const q = (v) => Math.min(255, Math.round(v / 16) * 16);
  return grid.map((row) =>
    row.map((c) => {
      if (!c) return c;
      const n = parseInt(c.slice(1), 16);
      return toHex(q((n >> 16) & 255), q((n >> 8) & 255), q(n & 255));
    }),
  );
}

/**
 * Greedy palette reduction. Returns a map original color → kept color.
 * The closest pair is merged first; the less frequent color goes into the more frequent one.
 */
export function reducePalette(counts, maxColors = DEFAULT_MAX_COLORS, minDeltaE = MIN_DELTA_E) {
  const alive = new Map(counts);
  const target = new Map([...counts.keys()].map((c) => [c, c]));
  for (;;) {
    const colors = [...alive.keys()];
    let best = null;
    for (let i = 0; i < colors.length; i++)
      for (let j = i + 1; j < colors.length; j++) {
        const d = deltaE(colors[i], colors[j]);
        if (!best || d < best.d) best = { d, a: colors[i], b: colors[j] };
      }
    if (!best || (colors.length <= maxColors && best.d >= minDeltaE)) break;
    const [keep, drop] = alive.get(best.a) >= alive.get(best.b) ? [best.a, best.b] : [best.b, best.a];
    alive.set(keep, alive.get(keep) + alive.get(drop));
    alive.delete(drop);
    for (const [orig, t] of target) if (t === drop) target.set(orig, keep);
  }
  return target;
}

/** PNG buffer → ArtworkSource (+ warnings for rules the validator will reject). */
export function pngToArtwork(buffer, meta) {
  const maxColors = Math.min(meta.maxColors ?? DEFAULT_MAX_COLORS, KEYS.length);
  let { width, height, grid } = readPixels(buffer);
  const distinct = () => new Set(grid.flat().filter(Boolean));
  if (distinct().size > PREQUANTIZE_ABOVE) grid = prequantize(grid);
  const counts = new Map();
  for (const c of grid.flat()) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  const target = reducePalette(counts, maxColors);
  const palette = [...new Set(target.values())].sort((a, b) => luminance(a) - luminance(b) || a.localeCompare(b));
  const keyOf = new Map(palette.map((c, i) => [c, KEYS[i]]));
  const rows = grid.map((row) => encodeRow(row.map((c) => (c ? keyOf.get(target.get(c)) : '.'))));
  const warnings = [];
  if (width < 8 || height < 8 || width > 128 || height > 128) warnings.push(`size ${width}×${height} is outside 8..128`);
  if (palette.length < 2) warnings.push(`only ${palette.length} color(s), at least 2 are required`);
  return {
    artwork: {
      v: 1,
      id: meta.id,
      album: meta.album,
      title: { fr: meta.titleFr ?? meta.id, en: meta.titleEn ?? meta.id },
      w: width,
      h: height,
      palette,
      rows,
      access: meta.access ?? 'free',
      difficulty: meta.difficulty ?? 1,
    },
    warnings,
    merged: counts.size - palette.length,
  };
}

function parseArgs(argv) {
  const [input, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, '')] = rest[i + 1];
  return { input, opts };
}

function parseAccess(value) {
  if (!value || value === 'free' || value === 'pro') return value ?? 'free';
  const m = /^pack:([a-z0-9-]+)$/.exec(value);
  if (!m) throw new Error(`--access must be free, pro or pack:<id> (got "${value}")`);
  return { pack: m[1] };
}

function main() {
  const { input, opts } = parseArgs(process.argv.slice(2));
  if (!input || !opts.id || !opts.album) {
    console.error('usage: node scripts/png-to-artwork.mjs <file.png> --id <id> --album <album> [options]');
    process.exit(2);
  }
  const difficulty = Number(opts.difficulty ?? 1);
  if (![1, 2, 3].includes(difficulty)) throw new Error('--difficulty must be 1, 2 or 3');
  const { artwork, warnings, merged } = pngToArtwork(readFileSync(input), {
    id: opts.id,
    album: opts.album,
    titleFr: opts['title-fr'],
    titleEn: opts['title-en'],
    access: parseAccess(opts.access),
    difficulty,
    maxColors: opts['max-colors'] ? Number(opts['max-colors']) : undefined,
  });
  const json = `${JSON.stringify(artwork, null, 2)}\n`;
  for (const w of warnings) console.error(`warning: ${w}`);
  if (opts.out === '-') {
    process.stdout.write(json);
    return;
  }
  const file = opts.out ?? join(ROOT, 'src/content/artworks', artwork.album, `${artwork.id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, json);
  console.error(`wrote ${file} (${artwork.w}×${artwork.h}, ${artwork.palette.length} colors, ${merged} merged)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
