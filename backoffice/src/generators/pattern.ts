/**
 * Geometric tiled patterns: azulejo-like tiles with grout, seigaiha waves, decorated
 * checkerboards, quilts of half-square triangles with stitched seams, chevrons and isometric
 * tumbling blocks. Everything is computed per cell from tile coordinates, so edges are crisp.
 */
import type { HexColor } from '../artwork-lib';
import { hexToOklch, inkOf, oklchToHex, withLightness } from './color';
import { boundaries, clamp, lineWidth } from './common';
import { commonSpecs, str } from './params';
import type { Rng } from './prng';
import { Canvas, Raster } from './raster';
import type { DrawContext, GeneratorDef } from './types';

type Kind = 'tiles' | 'waves' | 'checker' | 'quilt' | 'chevron' | 'iso';
const KINDS: Kind[] = ['tiles', 'waves', 'checker', 'quilt', 'chevron', 'iso'];

/** n distinct, well separated colors from the palette (alternating lightness). */
function swatches(keys: readonly HexColor[], n: number, rng: Rng): HexColor[] {
  const order = rng.shuffle(keys.map((_, i) => i));
  const out: HexColor[] = [];
  const levels = [0.68, 0.48, 0.84, 0.58, 0.76, 0.4];
  for (let i = 0; out.length < n; i++) {
    const key = keys[order[i % keys.length]];
    const round = Math.floor(i / keys.length);
    const l = round === 0 ? clamp(hexToOklch(key).l, 0.42, 0.82) : levels[(i + round) % levels.length];
    out.push(withLightness(key, l));
  }
  return out;
}

function repeatsOf(ctx: DrawContext): number {
  const r = str(ctx.params, 'repeats');
  if (r !== 'auto') return Number(r);
  const s = Math.min(ctx.w, ctx.h);
  const byDetail = ctx.detail === 1 ? 2 : ctx.detail === 2 ? 3 : ctx.rng.pick([4, 5, 6]);
  return clamp(Math.min(byDetail, Math.floor(s / 10)), 1, 8);
}

export const pattern: GeneratorDef = {
  id: 'pattern',
  name: { fr: 'Motif', en: 'Pattern' },
  description: 'Motifs géométriques pavés : carreaux, vagues, damiers, quilts, chevrons, cubes isométriques.',
  clean: true,
  params: [
    ...commonSpecs({ colors: 10 }),
    {
      key: 'kind',
      kind: 'enum',
      label: 'Motif',
      options: [
        { value: 'auto', label: 'Au hasard' },
        { value: 'tiles', label: 'Carreaux' },
        { value: 'waves', label: 'Vagues' },
        { value: 'checker', label: 'Damier' },
        { value: 'quilt', label: 'Quilt' },
        { value: 'chevron', label: 'Chevrons' },
        { value: 'iso', label: 'Cubes isométriques' },
      ],
      default: 'auto',
    },
    {
      key: 'repeats',
      kind: 'enum',
      label: 'Répétitions',
      options: [{ value: 'auto', label: 'Auto' }, ...['1', '2', '3', '4', '6', '8'].map((v) => ({ value: v, label: v }))],
      default: 'auto',
    },
  ],
  draw(ctx) {
    const { rng, w, h, keys } = ctx;
    const cv = new Canvas(w, h);
    const ids = new Raster(w, h);
    const kindParam = str(ctx.params, 'kind');
    const kind: Kind = kindParam === 'auto' ? rng.pick(KINDS) : (kindParam as Kind);
    const S = Math.min(w, h);
    const reps = repeatsOf(ctx);
    const T = Math.max(8, Math.floor(S / reps));
    const lw = lineWidth(ctx, 40);
    const C = ctx.colors;
    const ink = cv.ink(inkOf(keys[0]));
    const put = (x: number, y: number, v: number, id: number) => {
      cv.data[y * w + x] = v;
      ids.data[y * w + x] = id;
    };
    // Center the pattern: tiles are cut evenly on both sides.
    const offX = Math.floor((w - Math.ceil(w / T) * T) / 2);
    const offY = Math.floor((h - Math.ceil(h / T) * T) / 2);

    if (kind === 'tiles') {
      const cols = swatches(keys, Math.max(3, C - 1), rng).map((c) => cv.ink(c));
      const r1 = rng.range(0.35, 0.6);
      const r2 = rng.range(0.45, 0.75);
      const r3 = rng.range(0.15, 0.3);
      const star = rng.chance(0.6);
      const ringOn = C >= 7 && rng.chance(0.7);
      const grout = Math.max(1, Math.round(T / 24)) / (T / 2);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const lx = (((x - offX) % T) + T) % T;
          const ly = (((y - offY) % T) + T) % T;
          const u = Math.abs((lx + 0.5) / T - 0.5) * 2;
          const v = Math.abs((ly + 0.5) / T - 0.5) * 2;
          const ti = Math.floor((x - offX) / T) + Math.floor((y - offY) / T);
          let c = cols[0];
          let id = 2;
          if (Math.hypot(1 - u, 1 - v) < r1) [c, id] = [cols[1], 3];
          if (ringOn && Math.abs(Math.hypot(1 - u, 1 - v) - r1 * 0.55) < 0.09) [c, id] = [cols[4 % cols.length], 4];
          const shape = star ? Math.min(u + v, Math.max(u, v) * 1.42) : u + v;
          if (shape < r2) [c, id] = [cols[2], 5];
          if (Math.hypot(u, v) < r3 + 0.05) [c, id] = [cols[(3 + (ti & 1)) % cols.length], 6];
          if (lw > 0 && (u > 1 - grout || v > 1 - grout)) [c, id] = [ink, 1];
          put(x, y, c, id);
        }
    } else if (kind === 'waves') {
      const k = clamp(Math.round(C / 2), 2, 5);
      const R = T / 2;
      const ringW = R / k;
      const cols = swatches(keys, Math.min(C - 1, k * 2), rng).map((c) => cv.ink(c));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          let best = -1;
          let d = 0;
          let col = 0;
          // Rows are R apart, odd rows shifted by R; lower rows overlap upper ones (seigaiha).
          const r0 = Math.floor(py / R);
          for (let r = r0 + 1; r >= r0 - 1 && best < 0; r--) {
            const cy = r * R;
            const shift = (r & 1) * R;
            const c = Math.round((px - shift) / (2 * R));
            const dd = Math.hypot(px - (c * 2 * R + shift), py - cy);
            if (dd <= R) {
              best = r;
              d = dd;
              col = c;
            }
          }
          if (best < 0) {
            put(x, y, cols[0], 1);
            continue;
          }
          const ring = Math.min(k - 1, Math.floor(d / ringW));
          const alt = ((best & 1) + (col & 1)) % 2;
          const v = cols[(ring + alt * k) % cols.length];
          if (lw > 0 && d > R - lw) put(x, y, ink, 0);
          else put(x, y, v, 2 + ring);
        }
    } else if (kind === 'checker') {
      const half = Math.max(4, Math.floor(T / 2));
      const cols = swatches(keys, Math.max(4, Math.min(C - 1, 6)), rng).map((c) => cv.ink(c));
      const shape = rng.pick(['circle', 'diamond', 'plus', 'square'] as const);
      const size = rng.range(0.45, 0.7);
      const inner = C >= 8 && half >= 10;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = Math.floor((x - offX) / half);
          const j = Math.floor((y - offY) / half);
          const odd = ((i + j) & 1) === 1;
          const u = (((((x - offX) % half) + half) % half) + 0.5) / half - 0.5;
          const v = (((((y - offY) % half) + half) % half) + 0.5) / half - 0.5;
          const a = Math.abs(u) * 2;
          const b = Math.abs(v) * 2;
          const inShape = (s: number) =>
            shape === 'circle' ? Math.hypot(a, b) < s : shape === 'diamond' ? a + b < s * 1.2 : shape === 'plus' ? Math.min(a, b) < s * 0.38 && Math.max(a, b) < s * 1.2 : Math.max(a, b) < s * 0.85;
          let c = odd ? cols[0] : cols[1];
          let id = odd ? 2 : 3;
          if (inShape(size)) [c, id] = [odd ? cols[2] : cols[3], 4];
          if (inner && inShape(size * 0.45)) [c, id] = [cols[(odd ? 4 : 5) % cols.length], 5];
          put(x, y, c, id);
        }
    } else if (kind === 'quilt') {
      const sub = rng.pick([2, 4]);
      const cell = Math.max(4, Math.floor(T / sub));
      const block = cell * sub;
      const cols = swatches(keys, Math.max(4, C - 1), rng).map((c) => cv.ink(c));
      // Orientation map of one block quadrant (mirrored into the 4 quadrants: symmetric block).
      const q = sub / 2;
      const orient = Array.from({ length: q * q }, () => rng.int(0, 3));
      const pair = Array.from({ length: q * q }, () => rng.int(0, 2));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const bx = Math.floor((x - offX) / block);
          const by = Math.floor((y - offY) / block);
          const lx = (((x - offX) % block) + block) % block;
          const ly = (((y - offY) % block) + block) % block;
          let sx = Math.floor(lx / cell);
          let sy = Math.floor(ly / cell);
          let fx = ((lx % cell) + 0.5) / cell;
          let fy = ((ly % cell) + 0.5) / cell;
          if (sx >= q) {
            sx = sub - 1 - sx;
            fx = 1 - fx;
          }
          if (sy >= q) {
            sy = sub - 1 - sy;
            fy = 1 - fy;
          }
          const o = orient[sy * q + sx];
          const above = o === 0 ? fx > fy : o === 1 ? fx + fy < 1 : o === 2 ? fx < fy : fx + fy > 1;
          const p = (pair[sy * q + sx] + ((bx + by) & 1)) % 3;
          const c = above ? cols[p % cols.length] : cols[(p + 3) % cols.length];
          put(x, y, c, above ? 2 + p : 5 + p);
          // Stitched seams between blocks: dashes of 3 cells.
          if (lw > 0 && block >= 12 && (lx === 0 || ly === 0) && Math.floor((lx === 0 ? ly : lx) / 3) % 2 === 0) put(x, y, ink, 0);
        }
    } else if (kind === 'chevron') {
      const n = clamp(C - 1, 3, 8);
      const cols = swatches(keys, n, rng).map((c) => cv.ink(c));
      const period = T;
      const amp = T * rng.range(0.25, 0.5);
      const widths = Array.from({ length: n }, () => Math.max(2, Math.round((T / 3) * rng.range(0.5, 1.3))));
      const total = widths.reduce((a, b) => a + b, 0);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const t = Math.abs((((x + 0.5 - offX) % period) + period) % period / period - 0.5) * 2;
          const yy = (((y + t * amp) % total) + total) % total;
          let acc = 0;
          let band = 0;
          while (band < n - 1 && yy >= acc + widths[band]) acc += widths[band++];
          put(x, y, cols[band], 2 + band);
        }
    } else {
      // Isometric tumbling blocks (2:1 pixel isometry).
      const s = Math.max(4, Math.floor(T / 2));
      const hues = rng.shuffle(keys).slice(0, clamp(Math.floor((C - 1) / 3), 1, 3));
      const faces = hues.map((k) => {
        const o = hexToOklch(k);
        return [0.86, 0.66, 0.46].map((l) => cv.ink(oklchToHex({ l, c: Math.max(0.06, o.c * 0.9), h: o.h })));
      });
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const px = x + 0.5 - offX;
          const py = y + 0.5 - offY;
          const n0 = Math.floor(py / (1.5 * s));
          let hit = -1;
          let cube = 0;
          for (let n = n0 - 2; n <= n0 && hit < 0; n++) {
            const m0 = Math.floor((px - n * s) / (2 * s));
            for (let m = m0 - 1; m <= m0 + 1 && hit < 0; m++) {
              const tx = m * 2 * s + n * s;
              const ty = n * 1.5 * s;
              const dx = px - tx;
              const dy = py - ty;
              // Top face: T + a·(s, s/2) + b·(−s, s/2).
              const a = (dx / s + (2 * dy) / s) / 2;
              const b = ((2 * dy) / s - dx / s) / 2;
              if (a >= 0 && a < 1 && b >= 0 && b < 1) hit = 0;
              else {
                // Left face: (T + e2) + a·e1 + c·(0, s).
                const lx = dx + s;
                const a2 = lx / s;
                const c2 = (dy - s / 2 - a2 * (s / 2)) / s;
                if (a2 >= 0 && a2 < 1 && c2 >= 0 && c2 < 1) hit = 1;
                else {
                  // Right face: (T + e1) + b·e2 + c·(0, s).
                  const rx = dx - s;
                  const b3 = -rx / s;
                  const c3 = (dy - s / 2 - b3 * (s / 2)) / s;
                  if (b3 >= 0 && b3 < 1 && c3 >= 0 && c3 < 1) hit = 2;
                }
              }
              if (hit >= 0) cube = ((m % 3) + 3 + n * 2) % 3;
            }
          }
          if (hit < 0) hit = 0;
          const set = faces[cube % faces.length];
          put(x, y, set[hit], 2 + hit + (cube % faces.length) * 3);
        }
    }
    ctx.check();
    if (lw > 0 && (kind === 'iso' || kind === 'checker' || kind === 'tiles')) {
      const edges = boundaries(ids, 1);
      if (kind !== 'tiles') cv.paintMask(edges, ink);
    }
    return cv;
  },
};
