#!/usr/bin/env node
/**
 * Generates the 6 original starter artworks (src/content/artworks/<album>/<id>.json)
 * from the ASCII pixel maps below. Run: `node scripts/generate-starter-art.mjs`.
 *
 * Map conventions: '.' = empty cell; any other char is looked up in `colors`.
 * `mirror: true` means each row is the left half and is mirrored to the right.
 * `patches` are [x, y, char] overrides applied after mirroring.
 * The palette is sorted by luminance (dark → light), so color number 1 is the darkest.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ARTWORKS = [
  {
    id: 'strawberry',
    album: 'kitchen',
    title: { fr: 'Fraise', en: 'Strawberry' },
    difficulty: 1,
    colors: {
      o: '#7A1030', R: '#F2304B', H: '#FF9AAE', S: '#FFE14D',
      L: '#4FE08A', G: '#138A4A', T: '#7A4A1E',
    },
    mirror: true,
    rows: [
      '.......T',
      '....GG.T',
      '..GGLLGT',
      '.oGLLLLG',
      'oRRGGLGG',
      'oRRRRGRR',
      'oRSRRRRS',
      'oRRRRSRR',
      'oRRSRRRR',
      '.oRRRRSR',
      '.oRSRRRR',
      '..oRRRSR',
      '...oRRRR',
      '....oRSR',
      '.....oRR',
      '......oo',
    ],
    patches: [[2, 5, 'H'], [3, 5, 'H'], [2, 7, 'H'], [2, 8, 'H']],
  },
  {
    id: 'potted-cactus',
    album: 'garden',
    title: { fr: 'Cactus en pot', en: 'Potted cactus' },
    difficulty: 1,
    colors: {
      f: '#FF5FA2', y: '#FFE14D', g: '#3DD47A', d: '#16935A',
      s: '#6B4226', P: '#D9531E', p: '#FF8A3D',
    },
    rows: [
      '.......ff.......',
      '......fyyf......',
      '.......ff.......',
      '......gggg......',
      '......gdgg......',
      '......gdgg..gg..',
      '......gdgg..gd..',
      '..gg..gdgg..gd..',
      '..dg..gdgg..gd..',
      '..dg..gdgggggd..',
      '..dg..gdgg......',
      '..dggggdgg......',
      '......gdgg......',
      '......gdgg......',
      '..ssssgdggssss..',
      '.PPPPPPPPPPPPPP.',
      '..pppppppppppp..',
      '..pppfpppppfpp..',
      '...pppppppppp...',
      '....PPPPPPPP....',
    ],
  },
  {
    id: 'tropical-fish',
    album: 'ocean',
    title: { fr: 'Poisson tropical', en: 'Tropical fish' },
    difficulty: 1,
    colors: {
      c: '#BDEBFF', v: '#7B5CFF', B: '#3DB8FF', s: '#FFFFFF',
      k: '#1B1A2E', Y: '#FFC93C',
    },
    rows: [
      '..................c.',
      '........vvv.....c...',
      '.......vvvvv........',
      'vv....BBBBBBBB......',
      'vvv..BBBBBBBBBBB....',
      '.vvvBBsBBBBBBkkBB...',
      '..vvBBsBBBBBBksBBB..',
      '..vvBBsBBBBBBBBBBBB.',
      '.vvvYYsYYYYYYYYYYY..',
      'vvv..YYYYYYYYYYY....',
      'vv....YYYYYYYY......',
      '........vvv.........',
      '.........v.......c..',
    ],
  },
  {
    id: 'happy-mushroom',
    album: 'garden',
    title: { fr: 'Champignon joyeux', en: 'Happy mushroom' },
    difficulty: 1,
    colors: {
      o: '#5A1630', R: '#FF3D5A', W: '#FFFFFF', c: '#FFE8C2',
      s: '#F0B27A', k: '#1B1A2E', p: '#FF8FB8', g: '#2ED3A0',
    },
    mirror: true,
    rows: [
      '.....ooo',
      '...ooRRR',
      '..oRRWWR',
      '.oRRWWWR',
      '.oRRRWRR',
      'oRWRRRRR',
      'oWWWRRRW',
      'oRWRRRRW',
      'ooRRRRRR',
      '.ooooooo',
      '...occcc',
      '...ockcc',
      '...opccc',
      '...occcc',
      '...osscc',
      '.ggggggg',
    ],
  },
  {
    id: 'tabby-cat',
    album: 'animals',
    title: { fr: 'Chat tigré', en: 'Tabby cat' },
    difficulty: 1,
    colors: {
      k: '#1B1A2E', p: '#FF6FA5', O: '#FF9A3D', d: '#D9531E',
      g: '#2ED3A0', w: '#FFF4E6',
    },
    mirror: true,
    rows: [
      '.k......',
      '.kk.....',
      '.kpk....',
      '.kppkkkk',
      '.kOOOdOd',
      'kOOOOOOO',
      'kOOgkOOO',
      'kOOkkOOO',
      'kdOOOwww',
      'kOOOwwwp',
      'kdOOwwkw',
      '.kOOOwww',
      '..kOOOOO',
      '...kkkkk',
    ],
  },
  {
    id: 'little-rocket',
    album: 'space',
    title: { fr: 'Petite fusée', en: 'Little rocket' },
    difficulty: 2,
    colors: {
      r: '#FF3D5A', g: '#B8B0D9', W: '#FFFFFF', B: '#2E6BE6',
      b: '#8FE3FF', v: '#7B5CFF', f: '#FF8A3D', y: '#FFE14D',
    },
    mirror: true,
    rows: [
      '.......r',
      '......rr',
      '.....rrr',
      '.....gWW',
      '....gWWW',
      '....gWBB',
      '....gBbb',
      '....gBbb',
      '....gWBB',
      '....gWWW',
      '....gvvv',
      '....gWWW',
      '...rgWWW',
      '..rrgWWW',
      '.rrrgWWW',
      '.rrrgvvv',
      '.rr..ggg',
      '.....fff',
      '.....fyy',
      '......fy',
      '......ff',
      '.......f',
    ],
    patches: [[1, 2, 'y'], [14, 5, 'y'], [2, 9, 'y'], [13, 19, 'y'], [15, 12, 'y']],
  },
];

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function encodeRow(values) {
  let out = '';
  for (let i = 0; i < values.length; ) {
    let j = i + 1;
    while (j < values.length && values[j] === values[i]) j++;
    out += (j - i > 1 ? String(j - i) : '') + values[i];
    i = j;
  }
  return out;
}

function build(art) {
  let grid = art.rows.map((row) => (art.mirror ? row + [...row].reverse().join('') : row).split(''));
  for (const [x, y, ch] of art.patches ?? []) grid[y][x] = ch;
  const w = grid[0].length;
  grid.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${art.id}: row ${y} has ${row.length} cells, expected ${w}`);
  });
  const chars = Object.keys(art.colors).sort((a, b) => luminance(art.colors[a]) - luminance(art.colors[b]));
  const keyOf = new Map(chars.map((ch, i) => [ch, KEYS[i]]));
  const rows = grid.map((row, y) =>
    encodeRow(
      row.map((ch, x) => {
        if (ch === '.') return '.';
        const key = keyOf.get(ch);
        if (!key) throw new Error(`${art.id}: unknown char "${ch}" at ${x},${y}`);
        return key;
      }),
    ),
  );
  return {
    v: 1,
    id: art.id,
    album: art.album,
    title: art.title,
    w,
    h: grid.length,
    palette: chars.map((ch) => art.colors[ch]),
    rows,
    access: art.access ?? 'free',
    difficulty: art.difficulty,
  };
}

for (const art of ARTWORKS) {
  const json = build(art);
  const file = join(ROOT, 'src/content/artworks', json.album, `${json.id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`wrote ${json.id} (${json.w}×${json.h}, ${json.palette.length} colors)`);
}
