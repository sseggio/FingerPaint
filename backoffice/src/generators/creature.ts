/**
 * Creatures, robots and insects: one half is drawn at random and mirrored (bilateral
 * symmetry). Bodies are metaballs / rounded boxes / segments with quantized top lighting
 * (1–2 extra tones), parts are separated by automatic ink outlines, eyes always read well
 * (sclera, pupil, highlight). Optional background: soft bands, ground shadow, sparkles.
 */
import type { HexColor } from '../artwork-lib';
import { hexToOklch, inkOf, oklchToHex, withLightness } from './color';
import { boundaries, clamp, lineWidth } from './common';
import { bool, commonSpecs, str } from './params';
import type { Rng } from './prng';
import { Canvas, Raster } from './raster';
import type { DrawContext, GeneratorDef } from './types';

type Kind = 'creature' | 'robot' | 'insect';

/** Role → color value, with fallbacks when the color budget is small. */
interface Inks {
  ink: number;
  body: number;
  shadow: number;
  light: number;
  belly: number;
  accent: number;
  accent2: number;
  white: number;
  mouth: number;
  bg: number;
  bg2: number;
  ground: number;
  sparkle: number;
}

function makeInks(cv: Canvas, ctx: DrawContext, background: boolean, tones: number): Inks {
  const { keys, rng } = ctx;
  const order = rng.shuffle(keys.map((_, i) => i));
  const main = keys[order[0]];
  const second = keys[order[1]];
  const third = keys[order[2]];
  const mo = hexToOklch(main);
  const bodyL = clamp(mo.l, 0.55, 0.75);
  const bgHue = hexToOklch(keys[order[3]]).h;
  // Priority order: the first `colors` roles get their own color, the others fall back.
  const wanted: [keyof Inks, HexColor][] = [
    ['body', withLightness(main, bodyL)],
    ['ink', inkOf(second)],
    ['white', oklchToHex({ l: 0.98, c: 0.01, h: bgHue })],
    ...(background ? ([['bg', oklchToHex({ l: 0.94, c: 0.035, h: bgHue })]] as [keyof Inks, HexColor][]) : []),
    ['shadow', withLightness(main, bodyL - 0.17)],
    ['accent', withLightness(second, clamp(hexToOklch(second).l, 0.5, 0.68))],
    ...(tones >= 2 ? ([['light', withLightness(main, Math.min(0.93, bodyL + 0.13))]] as [keyof Inks, HexColor][]) : []),
    ['belly', withLightness(third, clamp(hexToOklch(third).l + 0.12, 0.7, 0.84))],
    ...(background ? ([['ground', oklchToHex({ l: 0.78, c: 0.06, h: bgHue })]] as [keyof Inks, HexColor][]) : []),
    ['mouth', oklchToHex({ l: 0.55, c: 0.17, h: 15 })],
    ...(background ? ([['bg2', oklchToHex({ l: 0.885, c: 0.045, h: bgHue })]] as [keyof Inks, HexColor][]) : []),
    ['accent2', withLightness(third, clamp(hexToOklch(third).l, 0.5, 0.7))],
    ...(background ? ([['sparkle', withLightness(keys[order[4 % keys.length]], 0.8)]] as [keyof Inks, HexColor][]) : []),
  ];
  const got = new Map<keyof Inks, number>();
  wanted.slice(0, ctx.colors).forEach(([role, hex]) => got.set(role, cv.ink(hex)));
  const g = (role: keyof Inks, ...fallbacks: (keyof Inks)[]): number => {
    for (const r of [role, ...fallbacks]) {
      const v = got.get(r);
      if (v !== undefined) return v;
    }
    return got.get('body')!;
  };
  return {
    ink: g('ink'),
    body: g('body'),
    shadow: g('shadow', 'ink'),
    light: g('light', 'body'),
    belly: g('belly', 'white'),
    accent: g('accent', 'shadow', 'ink'),
    accent2: g('accent2', 'accent', 'shadow'),
    white: g('white'),
    mouth: g('mouth', 'accent', 'ink'),
    bg: background ? g('bg', 'white') : 0,
    bg2: background ? g('bg2', 'bg', 'white') : 0,
    ground: background ? g('ground', 'bg2', 'shadow') : 0,
    sparkle: background ? g('sparkle', 'accent2', 'white') : 0,
  };
}

/** Painter: shapes go to a mask, then color + outline id are written. */
class Figure {
  readonly ids: Raster;
  private nextId = 2;

  constructor(
    readonly cv: Canvas,
    readonly w: number,
    readonly h: number,
  ) {
    this.ids = new Raster(w, h);
  }

  /** Paints a part; `id` > 0 gets outlined against lower ids (0 = background). */
  part(draw: (m: Raster) => void, paint: number | ((x: number, y: number) => number), sameId = false): Raster {
    const m = new Raster(this.w, this.h);
    draw(m);
    if (!sameId) this.nextId++;
    this.cv.paintMask(m, paint);
    this.ids.paintMask(m, this.nextId);
    return m;
  }

  /** Same as part() but keeps the current id (no outline with what is under it). */
  detail(draw: (m: Raster) => void, paint: number | ((x: number, y: number) => number)): Raster {
    return this.part(draw, paint, true);
  }
}

/** Top-lit sphere shading over an ellipse (bands: shadow / body / light). */
function shade(inks: Inks, tones: number, cx: number, cy: number, rx: number, ry: number) {
  return (x: number, y: number): number => {
    const nx = (x + 0.5 - cx) / rx;
    const ny = (y + 0.5 - cy) / ry;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const d = -ny * 0.62 + nz * 0.78 - Math.abs(nx) * 0.15;
    if (d < 0.32) return inks.shadow;
    if (tones >= 2 && d > 0.86) return inks.light;
    return inks.body;
  };
}

function eye(f: Figure, inks: Inks, x: number, y: number, r: number, rng: Rng, lw: number) {
  f.part((m) => m.disc(x, y, r + (lw > 0 ? 0 : 0), 1), inks.white);
  const pr = Math.max(0.9, r * rng.range(0.45, 0.6));
  const py = y + r * 0.18;
  f.detail((m) => m.disc(x, py, pr, 1), inks.ink);
  if (r >= 3.5) {
    const hs = Math.max(1, Math.round(pr * 0.45));
    const hx = Math.floor(x - pr * 0.45);
    const hy = Math.floor(py - pr * 0.6);
    f.detail((m) => m.rect(hx, hy, hx + hs - 1, hy + hs - 1, 1), inks.white);
  }
}

function eyesCount(ctx: DrawContext): number {
  const e = str(ctx.params, 'eyes');
  return e === 'auto' ? ctx.rng.pick([1, 2, 2, 2, 3]) : Number(e);
}

function drawCreature(f: Figure, ctx: DrawContext, inks: Inks, tones: number, lw: number) {
  const { rng, w, h } = ctx;
  const S = Math.min(w, h);
  const cx = w / 2;
  const cy = h * 0.52;
  const bodyR = S * rng.range(0.22, 0.28);
  const bodyRy = bodyR * rng.range(0.9, 1.2);
  // Legs and arms first (the body is drawn over their roots).
  const legX = cx - bodyR * rng.range(0.35, 0.6);
  const legTop = cy + bodyRy * 0.5;
  const legBottom = Math.min(h - S * 0.06, cy + bodyRy + S * rng.range(0.08, 0.14));
  const legR = Math.max(1.2, S * rng.range(0.045, 0.07));
  f.part((m) => m.capsule(legX, legTop, legX - S * 0.02, legBottom - legR, legR, 1), inks.shadow);
  f.part((m) => m.ellipse(legX - S * 0.03, legBottom - legR * 0.6, legR * 1.6, legR * 0.9, 1), inks.shadow);
  if (rng.chance(0.75)) {
    const ay = cy + bodyRy * rng.range(-0.1, 0.25);
    const ax = cx - bodyR * 0.8;
    const hx = cx - bodyR - S * rng.range(0.1, 0.16);
    const hy = ay + S * rng.range(-0.12, 0.12);
    const ar = Math.max(1, legR * 0.75);
    f.part((m) => m.capsule(ax, ay, hx, hy, ar, 1), inks.body);
    f.part((m) => m.disc(hx, hy, ar * 1.5, 1), inks.light);
  }
  // Ears / horns.
  const hornType = rng.pick(['horn', 'ear', 'antenna', 'none'] as const);
  const topY = cy - bodyRy;
  if (hornType === 'horn') {
    const bx = cx - bodyR * rng.range(0.35, 0.6);
    const hh = S * rng.range(0.1, 0.16);
    f.part((m) => m.polygon([[bx - hh * 0.35, topY + hh * 0.6], [bx + hh * 0.3, topY + hh * 0.5], [bx - hh * 0.25, topY - hh * 0.9]], 1), inks.accent);
  } else if (hornType === 'ear') {
    const bx = cx - bodyR * rng.range(0.5, 0.75);
    f.part((m) => m.ellipse(bx, topY + bodyRy * 0.15, S * 0.07, S * 0.12, 1, -25), inks.body);
    f.detail((m) => m.ellipse(bx, topY + bodyRy * 0.2, S * 0.035, S * 0.07, 1, -25), inks.belly);
  } else if (hornType === 'antenna') {
    const bx = cx - bodyR * 0.3;
    const tx = bx - S * rng.range(0.05, 0.12);
    const ty = topY - S * rng.range(0.1, 0.16);
    f.part((m) => m.stroke(bx, topY + 2, tx, ty, Math.max(1, S / 48), 1), inks.ink);
    f.part((m) => m.disc(tx, ty, Math.max(1.5, S * 0.035), 1), inks.accent2);
  }
  // Body: metaballs (a central blob + 1–3 side blobs, mirrored).
  const blobs = [{ x: cx, y: cy, r: bodyR }];
  for (let i = rng.int(1, 3); i > 0; i--) blobs.push({ x: cx - bodyR * rng.range(0.2, 0.55), y: cy + bodyRy * rng.range(-0.5, 0.5), r: bodyR * rng.range(0.55, 0.8) });
  const field = (x: number, y: number) => {
    let s = 0;
    for (const b of blobs) s += (b.r * b.r) / ((x + 0.5 - b.x) ** 2 + ((y + 0.5 - b.y) * (bodyR / bodyRy)) ** 2 + 1e-6);
    return s;
  };
  const body = f.part((m) => m.region(cx - bodyR * 2, cy - bodyRy * 2, cx + bodyR * 2, cy + bodyRy * 2, (x, y) => field(x, y) >= 1.6, 1), shade(inks, tones, cx, cy, bodyR * 1.25, bodyRy * 1.25));
  // Belly.
  if (rng.chance(0.7)) {
    const by = cy + bodyRy * 0.35;
    f.part((m) => m.region(cx - bodyR, by - bodyRy, cx + bodyR, by + bodyRy, (x, y) => body.get(x, y) > 0 && ((x + 0.5 - cx) / (bodyR * 0.62)) ** 2 + ((y + 0.5 - by) / (bodyRy * 0.55)) ** 2 <= 1, 1), inks.belly);
  }
  // Spots.
  const spots = rng.int(0, 4);
  for (let i = 0; i < spots; i++) {
    const sx = cx - bodyR * rng.range(0.45, 0.95);
    const sy = cy + bodyRy * rng.range(-0.7, 0.3);
    const sr = Math.max(1.5, S * rng.range(0.025, 0.045));
    f.part((m) => m.region(sx - sr - 1, sy - sr - 1, sx + sr + 1, sy + sr + 1, (x, y) => body.get(x, y) > 0 && Math.hypot(x + 0.5 - sx, y + 0.5 - sy) <= sr && Math.abs(x + 0.5 - cx) > sr, 1), inks.accent2);
  }
  // Face.
  const n = eyesCount(ctx);
  const er = Math.max(1.6, S * (n === 1 ? rng.range(0.08, 0.11) : rng.range(0.05, 0.075)));
  const ey = cy - bodyRy * rng.range(0.25, 0.45);
  if (n !== 2) eye(f, inks, cx, ey - (n === 3 ? er * 1.4 : 0), n === 1 ? er : er * 0.85, rng, lw);
  if (n >= 2) eye(f, inks, cx - bodyR * rng.range(0.3, 0.42), ey, er, rng, lw);
  const my = ey + er + Math.max(2, S * 0.07);
  const mw = bodyR * rng.range(0.3, 0.5);
  if (rng.chance(0.5)) {
    f.part((m) => m.region(cx - mw, my - S * 0.05, cx + mw, my + S * 0.06, (x, y) => ((x + 0.5 - cx) / mw) ** 2 + ((y + 0.5 - my) / Math.max(1.2, S * 0.045)) ** 2 <= 1 && y + 0.5 >= my - 0.2, 1), inks.mouth);
  } else {
    const t = Math.max(1, Math.round(S / 64));
    f.part((m) => {
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI * (0.15 + (0.7 * i) / 6);
        const b = Math.PI * (0.15 + (0.7 * (i + 1)) / 6);
        if (i < 6) m.stroke(cx + Math.cos(a) * mw, my - mw * 0.5 + Math.sin(a) * mw * 0.6, cx + Math.cos(b) * mw, my - mw * 0.5 + Math.sin(b) * mw * 0.6, t, 1);
      }
    }, inks.ink);
  }
}

function drawRobot(f: Figure, ctx: DrawContext, inks: Inks, tones: number, lw: number) {
  const { rng, w, h } = ctx;
  const S = Math.min(w, h);
  const cx = w / 2;
  const bw = S * rng.range(0.2, 0.26);
  const bh = S * rng.range(0.18, 0.24);
  const by = h * 0.58;
  const hw = bw * rng.range(0.6, 0.85);
  const hh = S * rng.range(0.13, 0.17);
  const hy = by - bh - hh * 0.95;
  const r = Math.max(1, S * 0.03);
  const bevel = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => {
    const t = Math.max(1, Math.round(S / 40));
    if (y < y0 + t + 0.5 && tones >= 2) return inks.light;
    if (y > y1 - t - 0.5) return inks.shadow;
    if (x < x0 + t + 0.5 && tones >= 2) return inks.light;
    return inks.body;
  };
  // Legs or treads.
  if (rng.chance(0.5)) {
    const lx = cx - bw * 0.5;
    const lw2 = Math.max(1.5, S * 0.05);
    f.part((m) => m.rect(lx - lw2, by + bh - 1, lx + lw2, h - S * 0.12, 1), inks.shadow);
    f.part((m) => m.rect(lx - lw2 * 1.8, h - S * 0.12 - 1, lx + lw2 * 1.4, h - S * 0.07, 1), inks.accent);
  } else {
    const ty = by + bh + S * 0.02;
    f.part((m) => m.region(cx - bw * 1.1, ty - S * 0.08, cx, ty + S * 0.09, (x, y) => {
      const rr = S * 0.085;
      const px = Math.max(cx - bw * 1.1 + rr, Math.min(cx, x + 0.5));
      return (x + 0.5 - px) ** 2 + (y + 0.5 - ty) ** 2 <= rr * rr;
    }, 1), inks.ink);
    for (let i = 0; i < 3; i++) {
      const wx = cx - bw * 1.1 + S * 0.085 + i * bw * 0.45;
      if (wx > cx) break;
      f.part((m) => m.disc(wx, ty, Math.max(1.2, S * 0.045), 1), inks.accent);
    }
  }
  // Arms.
  const ax = cx - bw;
  const ay = by - bh * 0.7;
  const elbowX = ax - S * rng.range(0.06, 0.1);
  const elbowY = ay + S * rng.range(0.06, 0.12);
  const handY = elbowY + S * rng.range(-0.15, 0.08);
  const ar = Math.max(1, S * 0.025);
  f.part((m) => m.capsule(ax, ay, elbowX, elbowY, ar, 1), inks.shadow);
  f.part((m) => m.capsule(elbowX, elbowY, elbowX - S * 0.02, handY, ar, 1), inks.shadow);
  f.part((m) => m.disc(elbowX, elbowY, ar * 1.6, 1), inks.accent);
  f.part((m) => m.disc(elbowX - S * 0.02, handY, ar * 2, 1), inks.accent2);
  // Torso.
  const roundBox = (m: Raster, x0: number, y0: number, x1: number, y1: number, rr: number) =>
    m.region(x0, y0, x1, y1, (x, y) => {
      const px = x + 0.5;
      const py = y + 0.5;
      if (px < x0 || px > x1 || py < y0 || py > y1) return false;
      const ix = Math.min(Math.max(px, x0 + rr), x1 - rr);
      const iy = Math.min(Math.max(py, y0 + rr), y1 - rr);
      return (px - ix) ** 2 + (py - iy) ** 2 <= rr * rr;
    }, 1);
  f.part((m) => roundBox(m, cx - bw, by - bh, cx + bw, by + bh, r * 1.5), bevel(cx - bw, by - bh, cx + bw, by + bh));
  // Chest panel with buttons.
  const pw = bw * 0.55;
  const ph = bh * 0.55;
  f.part((m) => roundBox(m, cx - pw, by - ph * 0.6, cx + pw, by + ph, r), inks.belly);
  const btn = Math.max(1, S * 0.028);
  if (pw > 5) {
    f.part((m) => m.disc(cx - pw * 0.45, by, btn, 1), inks.accent);
    f.part((m) => m.disc(cx, by + ph * 0.45, btn, 1), inks.accent2);
  }
  // Neck + head.
  f.part((m) => m.rect(cx - hw * 0.35, hy + hh * 0.9, cx + hw * 0.35, by - bh + 1, 1), inks.shadow);
  f.part((m) => roundBox(m, cx - hw, hy - hh * 0.5, cx + hw, hy + hh, r * 2), bevel(cx - hw, hy - hh * 0.5, cx + hw, hy + hh));
  // Antenna.
  const at = hy - hh * 0.5 - S * rng.range(0.08, 0.13);
  const ax2 = rng.chance(0.5) ? cx : cx - hw * 0.5;
  f.part((m) => m.stroke(ax2, hy - hh * 0.5, ax2, at, Math.max(1, S / 50), 1), inks.ink);
  f.part((m) => m.disc(ax2, at, Math.max(1.5, S * 0.035), 1), inks.mouth);
  // Visor + eyes.
  const vy = hy + hh * 0.15;
  const vh = Math.max(2, hh * 0.38);
  f.part((m) => roundBox(m, cx - hw * 0.8, vy - vh * 0.6, cx + hw * 0.8, vy + vh * 0.6, r), inks.ink);
  const n = eyesCount(ctx);
  const er = Math.max(1, vh * 0.42);
  if (n !== 2) f.detail((m) => m.disc(cx, vy, er, 1), inks.white);
  if (n >= 2) f.detail((m) => m.disc(cx - hw * 0.42, vy, er, 1), inks.white);
  // Rivets.
  if (S >= 96) for (const [x, y] of [[cx - bw + r * 1.6, by - bh + r * 1.6], [cx - bw + r * 1.6, by + bh - r * 1.6]]) f.part((m) => m.disc(x, y, Math.max(1, S / 90), 1), inks.shadow);
  void lw;
}

function drawInsect(f: Figure, ctx: DrawContext, inks: Inks, tones: number, lw: number) {
  const { rng, w, h } = ctx;
  const S = Math.min(w, h);
  const cx = w / 2;
  const headY = h * 0.27;
  const headR = S * rng.range(0.085, 0.11);
  const thY = headY + headR + S * 0.07;
  const thR = S * rng.range(0.08, 0.1);
  const abY = thY + thR + S * rng.range(0.13, 0.17);
  const abRx = S * rng.range(0.11, 0.15);
  const abRy = S * rng.range(0.16, 0.2);
  const legW = Math.max(1, S / 56);
  // Wings (behind).
  const wingKind = rng.pick(['round', 'long', 'butterfly'] as const);
  const wingA = rng.range(-50, -25);
  if (wingKind === 'butterfly') {
    f.part((m) => m.ellipse(cx - S * 0.19, thY - S * 0.05, S * 0.2, S * 0.14, 1, wingA), inks.accent);
    f.detail((m) => m.ellipse(cx - S * 0.22, thY - S * 0.07, S * 0.09, S * 0.06, 1, wingA), inks.belly);
    f.part((m) => m.ellipse(cx - S * 0.15, thY + S * 0.14, S * 0.13, S * 0.1, 1, -wingA * 0.6), inks.accent2);
  } else {
    const len = wingKind === 'long' ? S * 0.3 : S * 0.2;
    f.part((m) => m.ellipse(cx - len * 0.6, thY + len * 0.25, len * 0.75, len * 0.38, 1, wingA + 70), inks.belly);
    if (S >= 64 && lw > 0) {
      const vx = cx - len * 0.6;
      const vy = thY + len * 0.25;
      f.detail((m) => m.stroke(cx - S * 0.03, thY, vx - len * 0.3, vy + len * 0.3, 1, 1), inks.white);
    }
  }
  // Legs: three jointed legs on the left, mirrored.
  for (let i = 0; i < 3; i++) {
    const sy = thY + (i - 1) * thR * 0.6;
    const kx = cx - thR - S * rng.range(0.1, 0.14);
    const ky = sy - S * (0.06 - i * 0.04);
    const fx = kx - S * rng.range(0.03, 0.07);
    const fy = ky + S * rng.range(0.12, 0.18);
    f.part((m) => {
      m.stroke(cx - thR * 0.5, sy, kx, ky, legW, 1);
      m.stroke(kx, ky, fx, Math.min(h - 2, fy), legW, 1);
    }, inks.ink);
  }
  // Antennae.
  const tipX = cx - S * rng.range(0.1, 0.16);
  const tipY = headY - headR - S * rng.range(0.08, 0.14);
  f.part((m) => {
    const midX = cx - headR * 0.6;
    const midY = headY - headR - S * 0.04;
    m.stroke(cx - headR * 0.3, headY - headR * 0.6, midX, midY, legW, 1);
    m.stroke(midX, midY, tipX, tipY, legW, 1);
  }, inks.ink);
  f.part((m) => m.disc(tipX, tipY, Math.max(1.4, S * 0.025), 1), inks.accent);
  // Abdomen with stripes, thorax, head.
  const stripes = rng.int(2, 4);
  f.part((m) => m.ellipse(cx, abY, abRx, abRy, 1), (x, y) => {
    const t = (y + 0.5 - (abY - abRy)) / (2 * abRy);
    const band = Math.floor(t * (stripes * 2 + 1));
    if (band % 2 === 1) return inks.accent2;
    return shade(inks, tones, cx, abY, abRx, abRy)(x, y);
  });
  f.part((m) => m.ellipse(cx, thY, thR, thR * 0.85, 1), shade(inks, tones, cx, thY, thR, thR));
  f.part((m) => m.disc(cx, headY, headR, 1), shade(inks, tones, cx, headY, headR, headR));
  // Compound eyes on the sides of the head.
  const er = Math.max(1.4, headR * 0.45);
  eye(f, inks, cx - headR * 0.55, headY - headR * 0.05, er, rng, lw);
  if (eyesCount(ctx) % 2 === 1 && headR > 6) eye(f, inks, cx, headY - headR * 0.55, er * 0.6, rng, lw);
}

export const creature: GeneratorDef = {
  id: 'creature',
  name: { fr: 'Créature', en: 'Creature' },
  description: 'Créatures, robots et insectes symétriques, contour et ombrage automatiques.',
  clean: true,
  params: [
    ...commonSpecs({ colors: 12 }),
    {
      key: 'kind',
      kind: 'enum',
      label: 'Type',
      options: [
        { value: 'auto', label: 'Au hasard' },
        { value: 'creature', label: 'Créature' },
        { value: 'robot', label: 'Robot' },
        { value: 'insect', label: 'Insecte' },
      ],
      default: 'auto',
    },
    {
      key: 'eyes',
      kind: 'enum',
      label: 'Yeux',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
      ],
      default: 'auto',
    },
    {
      key: 'shading',
      kind: 'enum',
      label: 'Ombrage',
      options: [
        { value: '1', label: '1 ton' },
        { value: '2', label: '2 tons' },
      ],
      default: '2',
    },
    { key: 'background', kind: 'bool', label: 'Fond', default: true },
  ],
  draw(ctx) {
    const { rng, w, h } = ctx;
    const cv = new Canvas(w, h);
    const background = bool(ctx.params, 'background');
    const tones = Number(str(ctx.params, 'shading'));
    const kindParam = str(ctx.params, 'kind');
    const kind: Kind = kindParam === 'auto' ? rng.pick(['creature', 'creature', 'robot', 'insect'] as Kind[]) : (kindParam as Kind);
    const inks = makeInks(cv, ctx, background, tones);
    const lw = lineWidth(ctx, 28);
    // Same color values in the figure layer as in the canvas.
    const f = new Figure(cv, w, h);
    if (kind === 'robot') drawRobot(f, ctx, inks, tones, lw);
    else if (kind === 'insect') drawInsect(f, ctx, inks, tones, lw);
    else drawCreature(f, ctx, inks, tones, lw);
    ctx.check();
    // Mirror the left half, then outline every part (one-sided, so lines stay thin).
    cv.mirrorX();
    f.ids.mirrorX();
    // Small grids: silhouette only (inner part lines would eat the drawing).
    if (lw > 0) cv.paintMask(boundaries(Math.min(w, h) < 56 ? new Raster(w, h).paintMask(f.ids, 1) : f.ids, lw), inks.ink);
    if (background) {
      const figure = new Raster(w, h).paintMask(f.ids, 1);
      const S = Math.min(w, h);
      let bottom = 0;
      for (let i = 0; i < f.ids.data.length; i++) if (f.ids.data[i]) bottom = Math.max(bottom, Math.floor(i / w));
      const groundY = Math.min(h - 2, bottom + 1);
      const bands = h >= 48 ? 3 : 2;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (figure.data[i]) continue;
          const b = Math.floor((y / h) * bands);
          cv.data[i] = b === bands - 1 && bands === 3 ? inks.bg2 : inks.bg;
        }
      cv.region(0, 0, w - 1, h - 1, (x, y) => !figure.get(x, y) && ((x + 0.5 - w / 2) / (S * 0.36)) ** 2 + ((y + 0.5 - groundY) / Math.max(1.5, S * 0.05)) ** 2 <= 1, inks.ground);
      // Sparkles ("+" shapes) in the empty corners.
      if (S >= 40) {
        const arm = S >= 160 ? 2 : 1;
        for (let i = rng.int(3, 6); i > 0; i--) {
          const sx = rng.int(arm + 1, Math.floor(w * 0.22));
          const sy = rng.int(arm + 1, Math.floor(h * 0.6));
          const ok = (x: number, y: number) => !figure.get(x, y) && !figure.get(w - 1 - x, y);
          for (const [px, py] of [[sx, sy], [w - 1 - sx, sy]]) {
            let free = true;
            for (let d = -arm - 1; d <= arm + 1; d++) if (!ok(px + d, py) || !ok(px, py + d)) free = false;
            if (!free) continue;
            cv.rect(px - arm, py, px + arm, py, inks.sparkle);
            cv.rect(px, py - arm, px, py + arm, inks.sparkle);
          }
        }
      }
    }
    return cv;
  },
};
