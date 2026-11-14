/**
 * PNG previews of artwork sources (pixel-perfect, nearest neighbor), used to review the
 * generated content. Empty cells are drawn as a light checkerboard.
 */
import { writeFileSync } from 'node:fs';

import { PNG } from 'pngjs';

import { KEYS, hexToRgb } from './engine.mjs';

const CHECKER = [[236, 236, 240], [250, 250, 252]];

/** Decodes RLE rows to palette indices (-1 = empty). */
export function decodeSource(src) {
  return src.rows.map((row) => {
    const out = [];
    for (const m of row.matchAll(/(\d*)([A-Za-z.])/g)) {
      const n = m[1] ? Number(m[1]) : 1;
      const v = m[2] === '.' ? -1 : KEYS.indexOf(m[2]);
      for (let i = 0; i < n; i++) out.push(v);
    }
    return out;
  });
}

function blit(png, src, ox, oy, box) {
  const grid = decodeSource(src);
  const scale = Math.max(1, Math.floor(box / Math.max(src.w, src.h)));
  const dx = ox + Math.floor((box - src.w * scale) / 2);
  const dy = oy + Math.floor((box - src.h * scale) / 2);
  const rgb = src.palette.map(hexToRgb);
  for (let y = 0; y < src.h * scale; y++)
    for (let x = 0; x < src.w * scale; x++) {
      const v = grid[Math.floor(y / scale)][Math.floor(x / scale)];
      const c = v < 0 ? CHECKER[(Math.floor(x / 4) + Math.floor(y / 4)) % 2] : rgb[v];
      const i = ((dy + y) * png.width + dx + x) * 4;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = 255;
    }
}

function fill(png, rgb) {
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
}

export function writePreview(src, file, box = 512) {
  const png = new PNG({ width: box, height: box });
  fill(png, [255, 248, 240]);
  blit(png, src, 0, 0, box);
  writeFileSync(file, PNG.sync.write(png));
}

/** Grid of all sources, one row per album. */
export function writeContactSheet(rowsOfSources, file, box = 160, gap = 8) {
  const cols = Math.max(...rowsOfSources.map((r) => r.length));
  const png = new PNG({ width: cols * (box + gap) + gap, height: rowsOfSources.length * (box + gap) + gap });
  fill(png, [255, 248, 240]);
  rowsOfSources.forEach((row, r) =>
    row.forEach((src, c) => blit(png, src, gap + c * (box + gap), gap + r * (box + gap), box)),
  );
  writeFileSync(file, PNG.sync.write(png));
}
