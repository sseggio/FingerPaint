/**
 * Mandala: rotational symmetry (4/6/8/12 folds) with optional mirror symmetry, concentric
 * rings each holding a motif (petals, dots, teeth, scallops, diamonds, checkered band), a
 * quantized radial gradient behind the motifs and ink lines between regions.
 */
import type { HexColor } from '../artwork-lib';
import { hexToOklch, inkOf, oklchToHex, ramp, withLightness } from './color';
import { boundaries, clamp, lineWidth, TAU } from './common';
import type { ParamValues } from './params';
import { bool, commonSpecs, str } from './params';
import { Canvas, Raster } from './raster';
import type { DrawContext, GeneratorDef } from './types';

type Motif = 'petals' | 'lens' | 'dots' | 'teeth' | 'scallops' | 'diamonds' | 'band';
const MOTIFS: Motif[] = ['petals', 'lens', 'dots', 'teeth', 'scallops', 'diamonds', 'band'];

interface Ring {
  r0: number;
  r1: number;
  motif: Motif;
  /** Motif repeats around the circle. */
  count: number;
  base: number;
  fg: number;
  accent: number;
  inner: boolean;
}

function foldsOf(p: ParamValues, ctx: DrawContext): number {
  const f = str(p, 'folds');
  if (f !== 'auto') return Number(f);
  const s = Math.min(ctx.w, ctx.h);
  return s < 48 ? ctx.rng.pick([4, 6, 8]) : s < 100 ? ctx.rng.pick([6, 8, 8]) : ctx.rng.pick([6, 8, 8, 12]);
}

function ringsOf(p: ParamValues, ctx: DrawContext): number {
  const r = str(p, 'rings');
  if (r !== 'auto') return Number(r);
  const s = Math.min(ctx.w, ctx.h);
  const byDetail = ctx.detail === 1 ? 3 : ctx.detail === 2 ? 4 : 6;
  return clamp(Math.min(byDetail, Math.floor(s / 18)), 2, 8);
}

/** Whether (s, t) — s radial 0..1 in the ring, t 0 (axis) .. 1 (wedge edge) — is in the motif. */
function inMotif(m: Motif, s: number, t: number): boolean {
  switch (m) {
    case 'petals':
      // Rounded petal: wide body, rounded tip.
      return t <= Math.sqrt(Math.max(0, 1 - s * s)) * 0.95 * Math.min(1, s * 3 + 0.35);
    case 'lens':
      return t <= Math.sin(Math.PI * Math.min(1, s * 1.05)) ** 0.8 * 0.9;
    case 'dots': {
      const dy = (s - 0.5) * 2;
      return dy * dy + t * t * 1.1 <= 0.62;
    }
    case 'teeth':
      return s <= 1 - t * 0.95;
    case 'scallops':
      return s <= 0.35 + 0.6 * Math.sqrt(Math.max(0, 1 - t * t));
    case 'diamonds':
      return Math.abs(s - 0.5) * 2 + t <= 0.92;
    case 'band':
      return t < 0.5;
  }
}

export const mandala: GeneratorDef = {
  id: 'mandala',
  name: { fr: 'Mandala', en: 'Mandala' },
  description: 'Symétrie rotative et miroir, anneaux de motifs, dégradé radial.',
  clean: true,
  params: [
    ...commonSpecs({ colors: 12 }),
    {
      key: 'folds',
      kind: 'enum',
      label: 'Symétrie',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: '4', label: '4' },
        { value: '6', label: '6' },
        { value: '8', label: '8' },
        { value: '12', label: '12' },
      ],
      default: 'auto',
    },
    {
      key: 'rings',
      kind: 'enum',
      label: 'Anneaux',
      options: [{ value: 'auto', label: 'Auto' }, ...[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))],
      default: 'auto',
    },
    { key: 'mirror', kind: 'bool', label: 'Miroir', default: true },
  ],
  draw(ctx) {
    const { rng, w, h, keys } = ctx;
    const p = ctx.params;
    const cv = new Canvas(w, h);
    const folds = foldsOf(p, ctx);
    const mirror = bool(p, 'mirror');
    const nRings = ringsOf(p, ctx);
    const lw = lineWidth(ctx, 44);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - (lw > 0 ? 1 : 0.5);

    // Color budget: ink + outside background + radial ring gradient + motif colors.
    const C = ctx.colors;
    const order = rng.shuffle(keys.map((_, i) => i));
    const hueKey = keys[order[0]];
    const ink = cv.ink(inkOf(keys[order[1]]));
    const bgN = C >= 12 ? 2 : 1;
    const gradN = clamp(Math.round((C - 1 - bgN) * 0.4), 1, Math.min(4, nRings + 1));
    const motifN = Math.max(1, C - (lw > 0 ? 1 : 0) - bgN - gradN);
    const bgHue = hexToOklch(keys[order[2 % keys.length]]);
    const bg = Array.from({ length: bgN }, (_, i) => cv.ink(oklchToHex({ l: 0.95 - i * 0.07, c: 0.04 + i * 0.015, h: bgHue.h })));
    const grad = ramp(withLightness(hueKey, 0.8), gradN, { span: 0.35, min: 0.62, max: 0.95 }).map((c) => cv.ink(c));
    const motifPool: HexColor[] = [];
    for (let i = 0; motifPool.length < motifN; i++) {
      const key = keys[order[(1 + i) % keys.length]];
      const round = Math.floor(i / keys.length);
      const o = hexToOklch(key);
      const l = round === 0 ? clamp(o.l, 0.5, 0.74) : round === 1 ? clamp(o.l + 0.15, 0.68, 0.88) : clamp(o.l - 0.15, 0.4, 0.55);
      motifPool.push(withLightness(key, l));
    }
    const motifs = motifPool.map((c) => cv.ink(c));

    // Rings from the center outward; widths grow slightly toward the rim.
    const weights = Array.from({ length: nRings }, (_, i) => (i === 0 ? 1.2 : 1) * rng.range(0.8, 1.25) * (1 + i * 0.08));
    const total = weights.reduce((a, b) => a + b, 0);
    const rings: Ring[] = [];
    let acc = 0;
    for (let i = 0; i < nRings; i++) {
      const r0 = (acc / total) * R;
      acc += weights[i];
      const r1 = (acc / total) * R;
      const widthCells = r1 - r0;
      let motif: Motif = i === 0 ? rng.pick(['petals', 'lens', 'diamonds'] as Motif[]) : rng.pick(MOTIFS);
      if (widthCells < 3) motif = rng.pick(['band', 'teeth'] as Motif[]);
      // Motif repeat: enough room per motif (≥ ~4 cells at the ring's middle radius).
      const circumference = TAU * (r0 + r1) * 0.5;
      let mult = rng.pick([1, 2, 2, 3]);
      while (mult > 1 && circumference / (folds * mult) < Math.max(6, widthCells * 0.7)) mult--;
      const count = i === 0 ? folds : folds * mult;
      rings.push({
        r0,
        r1,
        motif,
        count: Math.max(folds, count),
        base: grad[(nRings - 1 - i) % grad.length],
        fg: motifs[(i * 2) % motifs.length],
        accent: motifs[(i * 2 + 1) % motifs.length],
        inner: ctx.detail >= 2 && widthCells >= 7 && motif !== 'band' && motif !== 'teeth',
      });
    }
    // Neighbor rings never share their base color.
    for (let i = 1; i < rings.length; i++)
      if (rings[i].base === rings[i - 1].base && grad.length > 1) rings[i].base = grad[(grad.indexOf(rings[i].base) + 1) % grad.length];
    ctx.check();

    const twist = mirror ? 0 : rng.range(0.25, 0.45);
    const ids = new Raster(w, h);
    // Outside: quantized radial gradient toward the corners.
    const far = Math.hypot(w / 2, h / 2);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const r = Math.hypot(dx, dy);
        const i = y * w + x;
        if (r > R) {
          const band = Math.min(bgN - 1, Math.floor(((r - R) / Math.max(1, far - R)) * bgN));
          cv.data[i] = bg[band];
          continue;
        }
        let k = 0;
        while (k < rings.length - 1 && r > rings[k].r1) k++;
        const ring = rings[k];
        const s = clamp((r - ring.r0) / Math.max(0.5, ring.r1 - ring.r0), 0, 1);
        const a = (Math.atan2(dy, dx) + TAU + Math.PI / 2) % TAU;
        const u = ((a / TAU) * ring.count + s * twist) % 1;
        const t = Math.abs(u - 0.5) * 2;
        let v = ring.base;
        let id = 10 + k * 4;
        if (ring.motif === 'band') {
          const seg = Math.floor((a / TAU) * ring.count * 2 + 0.5) % 2;
          v = seg === 0 ? ring.fg : ring.base;
          id += seg === 0 ? 1 : 0;
        } else if (inMotif(ring.motif, s, t)) {
          v = ring.fg;
          id += 1;
          if (ring.inner && inMotif(ring.motif, clamp((s - 0.12) / 0.62, 0, 1), clamp(t / 0.55, 0, 2))) {
            v = ring.accent;
            id += 1;
          }
        }
        cv.data[i] = v;
        ids.data[i] = id;
      }
    ctx.check();
    if (lw > 0) cv.paintMask(boundaries(ids, lw), ink);
    // Center jewel.
    const jr = Math.max(1.2, rings[0].r1 * 0.28);
    if (jr >= 2) {
      cv.disc(cx, cy, jr + (lw > 0 ? lw : 0), lw > 0 ? ink : motifs[motifs.length - 1]);
      cv.disc(cx, cy, jr, motifs[(motifs.length - 1) % motifs.length]);
    }
    return cv;
  },
};
