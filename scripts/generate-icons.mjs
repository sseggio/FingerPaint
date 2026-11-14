#!/usr/bin/env node
/**
 * Generates every app icon / splash asset from one original pixel-art design: "Drop", a
 * cheerful pink paint drop on a violet canvas sprinkled with palette pixels (FingerPaint's own
 * mascot, drawn here cell by cell — no third-party artwork).
 *
 *   node scripts/generate-icons.mjs [--preview <dir>]
 *
 * Outputs (assets/images/):
 * - icon.png                     1024×1024, RGB WITHOUT alpha (App Store requirement), iOS + default
 * - android-icon-foreground.png  1024×1024 RGBA, the drop only, inside the adaptive safe zone
 * - android-icon-background.png  1024×1024 RGB, violet canvas + palette pixels
 * - android-icon-monochrome.png  1024×1024 RGBA, white silhouette (Android 13 themed icons)
 * - splash-icon.png              512×512 RGBA, the drop only (background color set in app.json)
 * - favicon.png                  64×64 RGB
 *
 * Colors are the design tokens of src/theme/tokens.ts (kept in sync by hand; app.json's splash /
 * adaptive icon colors are checked against the tokens by src/release/app-config.test.ts).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'images');

/** src/theme/tokens.ts */
const TOKENS = {
  violet: '#7B5CFF',
  pink: '#FF3D7F',
  primary: '#E01F66',
  ink: '#1B1A2E',
  sun: '#FFC93C',
  mint: '#2ED3A0',
  sky: '#3DB8FF',
  orange: '#FF8A3D',
  white: '#FFFFFF',
};
/** Illustration-only shades (artwork data, not UI colors). */
const ART = {
  violetDeep: '#6A4BF0',
  blush: '#FF9EC0',
};

const N = 32;

function hex(color) {
  const v = Number.parseInt(color.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** The drop: a circle plus the cone of its tangents up to the tip. */
function inDrop(x, y) {
  const cx = 16;
  const cy = 19.5;
  const r = 9;
  const tipY = 3;
  const px = x + 0.5;
  const py = y + 0.5;
  if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) return true;
  const d = cy - tipY;
  const tan = r / Math.sqrt(d * d - r * r);
  const tangentY = tipY + (d * d - r * r) / d;
  return py >= tipY && py <= tangentY && Math.abs(px - cx) <= (py - tipY) * tan;
}

/** Eyes (2×3, with a sparkle added on top) and smile: holes in the monochrome silhouette. */
const FACE = [
  [12, 19],
  [13, 19],
  [12, 20],
  [13, 20],
  [12, 21],
  [13, 21],
  [18, 19],
  [19, 19],
  [18, 20],
  [19, 20],
  [18, 21],
  [19, 21],
  [14, 24],
  [15, 25],
  [16, 25],
  [17, 24],
];

/** White silhouette of the drop with the face cut out (Android themed icon). */
function monochromeLayer(drop) {
  const grid = drop.map((row) => row.map((c) => (c === null ? null : TOKENS.white)));
  for (const [x, y] of FACE) grid[y][x] = null;
  return grid;
}

/** Layer of the drop only: null = transparent. */
function dropLayer() {
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N && inDrop(x, y);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (inside(x, y)) {
        // Rim shading on the lower right (light comes from the upper left).
        const rim = !inside(x + 1, y + 1) || !inside(x + 2, y + 1) || !inside(x + 1, y + 2);
        grid[y][x] = rim && x + y > 36 ? TOKENS.primary : TOKENS.pink;
      } else if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) {
        grid[y][x] = TOKENS.ink;
      }
    }
  }
  const put = (color, cells) => {
    for (const [x, y] of cells) grid[y][x] = color;
  };
  // Glossy highlight.
  put(TOKENS.white, [
    [11, 14],
    [11, 15],
    [10, 16],
    [10, 17],
    [12, 12],
  ]);
  // Eyes and a smile.
  put(TOKENS.ink, FACE);
  put(TOKENS.white, [
    [12, 19],
    [18, 19],
  ]);
  put(ART.blush, [
    [10, 23],
    [11, 23],
    [20, 23],
    [21, 23],
  ]);
  return grid;
}

/** The violet canvas with palette pixels (confetti), no drop. */
function backgroundLayer() {
  const grid = Array.from({ length: N }, () => Array(N).fill(TOKENS.violet));
  const square = (x, y, size, color) => {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) grid[y + j][x + i] = color;
  };
  // A soft shadow under the drop.
  for (let y = 28; y < 31; y++) {
    for (let x = 0; x < N; x++) if (((x + 0.5 - 16) / 8) ** 2 + ((y + 0.5 - 29.6) / 1.3) ** 2 <= 1) grid[y][x] = ART.violetDeep;
  }
  square(3, 4, 2, TOKENS.sun);
  square(7, 2, 1, TOKENS.mint);
  square(26, 3, 2, TOKENS.mint);
  square(24, 8, 1, TOKENS.orange);
  square(4, 26, 2, TOKENS.sky);
  square(2, 20, 1, TOKENS.orange);
  square(26, 25, 2, TOKENS.orange);
  square(28, 18, 1, TOKENS.sun);
  square(6, 30, 1, TOKENS.sun);
  square(27, 30, 1, TOKENS.sky);
  return grid;
}

function compose(bottom, top) {
  return bottom.map((row, y) => row.map((c, x) => top[y][x] ?? c));
}

/**
 * Rasterizes a grid: `cell` px per grid cell, centered on a `size` canvas. Transparent cells
 * stay transparent unless `opaque` (then the PNG is written as RGB, without an alpha channel).
 */
function rasterize(grid, { size, cell, opaque }) {
  const png = new PNG({ width: size, height: size, colorType: opaque ? 2 : 6, inputHasAlpha: true });
  const offset = Math.round((size - N * cell) / 2);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const gx = Math.floor((px - offset) / cell);
      const gy = Math.floor((py - offset) / cell);
      const color = gx >= 0 && gy >= 0 && gx < N && gy < N ? grid[gy][gx] : null;
      const i = (py * size + px) * 4;
      if (color === null) {
        png.data[i + 3] = 0;
        continue;
      }
      const [r, g, b] = hex(color);
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: opaque ? 2 : 6 });
}

export function buildIcons() {
  const drop = dropLayer();
  const background = backgroundLayer();
  const full = compose(background, drop);
  return {
    // 32 px cells fill the whole 1024 canvas (iOS masks the corners itself).
    'icon.png': rasterize(full, { size: 1024, cell: 32, opaque: true }),
    // 20 px cells: the 640 px drop stays within Android's 66 % adaptive safe zone.
    'android-icon-foreground.png': rasterize(drop, { size: 1024, cell: 20, opaque: false }),
    'android-icon-background.png': rasterize(background, { size: 1024, cell: 32, opaque: true }),
    'android-icon-monochrome.png': rasterize(monochromeLayer(drop), { size: 1024, cell: 20, opaque: false }),
    'splash-icon.png': rasterize(drop, { size: 512, cell: 16, opaque: false }),
    'favicon.png': rasterize(full, { size: 64, cell: 2, opaque: true }),
  };
}

function main() {
  const args = process.argv.slice(2);
  const previewAt = args.indexOf('--preview');
  const dir = previewAt >= 0 ? args[previewAt + 1] : OUT;
  if (!dir) throw new Error('--preview needs a directory');
  mkdirSync(dir, { recursive: true });
  for (const [name, buffer] of Object.entries(buildIcons())) {
    writeFileSync(join(dir, name), buffer);
    console.log(`wrote ${join(dir, name)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
