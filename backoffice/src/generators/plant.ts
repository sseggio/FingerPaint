/**
 * Plants from stochastic L-systems (trees, bushes, flowers, bouquets). The grammar is expanded,
 * interpreted by a turtle into branch segments, leaves and blossoms, then fitted to the canvas
 * and drawn crisply: tapered branches (4-connected when thin), shaded foliage clusters, leaves,
 * petals, with ground or pot and a soft background.
 */
import type { HexColor } from '../artwork-lib';
import { hexToOklch, inkOf, oklchToHex, withLightness } from './color';
import { boundaries, clamp, lineWidth } from './common';
import { bool, commonSpecs, str } from './params';
import type { Rng } from './prng';
import { Canvas, Raster } from './raster';
import type { DrawContext, GeneratorDef } from './types';

type Kind = 'tree' | 'bush' | 'flower' | 'bouquet';

interface Rule {
  weight: number;
  out: string;
}

interface LSystem {
  axiom: string;
  rules: Record<string, Rule[]>;
  iterations: number;
  angle: number;
  /** Random angle jitter (degrees). */
  jitter: number;
  /** Step length shrink per branching level. */
  shrink: number;
}

const SYSTEMS: Record<Kind, (detail: number) => LSystem> = {
  tree: (d) => ({
    axiom: 'TX',
    rules: {
      X: [
        { weight: 3, out: 'F[+X][-X]FX' },
        { weight: 2, out: 'F[+X]F[-X]X' },
        { weight: 2, out: 'F[-X][+X]' },
        { weight: 1, out: 'F[+X][X][-X]' },
      ],
      T: [{ weight: 1, out: 'TF' }],
    },
    iterations: 3 + Math.min(2, d),
    angle: 26,
    jitter: 9,
    shrink: 0.78,
  }),
  bush: (d) => ({
    axiom: '[--X][-X][X][+X][++X]',
    rules: {
      X: [
        { weight: 3, out: 'F[+XL][-XL]FXL' },
        { weight: 2, out: 'F[-XL]F[+XL]XL' },
        { weight: 1, out: 'FXL' },
      ],
    },
    iterations: 2 + Math.min(1, d - 1),
    angle: 24,
    jitter: 8,
    shrink: 0.85,
  }),
  flower: () => ({
    axiom: 'S',
    rules: {
      S: [
        { weight: 2, out: 'F[+L]F[-L]FFA' },
        { weight: 2, out: 'F[-L]F[+L]F[+L]FA' },
        { weight: 1, out: 'FF[+L][-L]FFA' },
      ],
    },
    iterations: 1,
    angle: 40,
    jitter: 6,
    shrink: 1,
  }),
  bouquet: () => ({
    axiom: 'B',
    rules: {
      B: [{ weight: 1, out: '[--S][-S][S][+S][++S]' }, { weight: 1, out: '[--S][-S][+S][++S]' }, { weight: 1, out: '[---S][-S][S][+S][+++S]' }],
      S: [
        { weight: 2, out: 'FF[+L]FA' },
        { weight: 2, out: 'F[-L]FFA' },
        { weight: 1, out: 'FFFA' },
      ],
    },
    iterations: 2,
    angle: 17,
    jitter: 5,
    shrink: 1,
  }),
};

function expand(sys: LSystem, rng: Rng): string {
  let s = sys.axiom;
  for (let i = 0; i < sys.iterations; i++) {
    let out = '';
    for (const ch of s) {
      const rules = sys.rules[ch];
      if (!rules) {
        out += ch;
        continue;
      }
      const total = rules.reduce((a, r) => a + r.weight, 0);
      let t = rng.next() * total;
      let pick = rules[0];
      for (const r of rules) {
        t -= r.weight;
        if (t < 0) {
          pick = r;
          break;
        }
      }
      out += pick.out;
      if (out.length > 20000) break;
    }
    s = out;
  }
  return s;
}

interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  level: number;
}
interface Leaf {
  x: number;
  y: number;
  angle: number;
  level: number;
}
interface Bloom {
  x: number;
  y: number;
  angle: number;
}

/** Turtle interpretation (y up = negative). Tips are the ends of X / last F before ']'. */
function interpret(str: string, sys: LSystem, rng: Rng) {
  const segs: Seg[] = [];
  const leaves: Leaf[] = [];
  const blooms: Bloom[] = [];
  const tips: { x: number; y: number; level: number }[] = [];
  let x = 0;
  let y = 0;
  let a = -90;
  let level = 0;
  let len = 1;
  const stack: [number, number, number, number, number][] = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === 'F' || ch === 'T') {
      const rad = (a * Math.PI) / 180;
      const nx = x + Math.cos(rad) * len;
      const ny = y + Math.sin(rad) * len;
      segs.push({ x0: x, y0: y, x1: nx, y1: ny, level });
      x = nx;
      y = ny;
    } else if (ch === '+') a += sys.angle + rng.range(-sys.jitter, sys.jitter);
    else if (ch === '-') a -= sys.angle + rng.range(-sys.jitter, sys.jitter);
    else if (ch === '[') {
      stack.push([x, y, a, level, len]);
      level++;
      len *= sys.shrink;
    } else if (ch === ']') {
      const top = stack.pop();
      if (top) [x, y, a, level, len] = top;
    } else if (ch === 'X') tips.push({ x, y, level });
    else if (ch === 'L') leaves.push({ x, y, angle: a + rng.range(-25, 25), level });
    else if (ch === 'A') blooms.push({ x, y, angle: a });
  }
  return { segs, leaves, blooms, tips };
}

export const plant: GeneratorDef = {
  id: 'plant',
  name: { fr: 'Plante', en: 'Plant' },
  description: 'Arbres, buissons, fleurs et bouquets par L-systèmes, sol ou pot, fond doux.',
  clean: true,
  params: [
    ...commonSpecs({ colors: 12 }),
    {
      key: 'kind',
      kind: 'enum',
      label: 'Type',
      options: [
        { value: 'auto', label: 'Au hasard' },
        { value: 'tree', label: 'Arbre' },
        { value: 'bush', label: 'Buisson' },
        { value: 'flower', label: 'Fleur' },
        { value: 'bouquet', label: 'Bouquet' },
      ],
      default: 'auto',
    },
    { key: 'blossoms', kind: 'bool', label: 'Fleurs / fruits', default: true },
    { key: 'background', kind: 'bool', label: 'Fond', default: true },
  ],
  draw(ctx: DrawContext) {
    const { rng, w, h, keys, detail } = ctx;
    const cv = new Canvas(w, h);
    const S = Math.min(w, h);
    const kindParam = str(ctx.params, 'kind');
    const kind: Kind = kindParam === 'auto' ? rng.pick(['tree', 'tree', 'bush', 'flower', 'bouquet'] as Kind[]) : (kindParam as Kind);
    const background = bool(ctx.params, 'background');
    const blossoms = bool(ctx.params, 'blossoms') || kind === 'flower' || kind === 'bouquet';
    const lw = lineWidth(ctx, 40);
    const order = rng.shuffle(keys.map((_, i) => i));

    // ---------------------------------------------------------------- colors (priority order)
    const greenKey = keys.reduce((best, k) => {
      const d = (c: string) => Math.abs(((hexToOklch(c).h - 140 + 540) % 360) - 180);
      return d(k) < d(best) ? k : best;
    }, keys[0]);
    const leafHue = (hexToOklch(greenKey).h * 0.4 + 135 * 0.6 + 360) % 360;
    const flowerKeys = order.map((i) => keys[i]).filter((k) => k !== greenKey);
    const bgHue = hexToOklch(flowerKeys[2 % flowerKeys.length]).h;
    const roles: [string, HexColor][] = [
      ['leaf', oklchToHex({ l: 0.62, c: 0.14, h: leafHue })],
      ['bark', oklchToHex({ l: 0.45, c: 0.07, h: 50 })],
      ['ink', inkOf(greenKey)],
      ...(background ? ([['bg', oklchToHex({ l: 0.95, c: 0.03, h: bgHue })]] as [string, HexColor][]) : []),
      ['petal', withLightness(flowerKeys[0], clamp(hexToOklch(flowerKeys[0]).l, 0.55, 0.75))],
      ['leafDark', oklchToHex({ l: 0.47, c: 0.12, h: leafHue + 8 })],
      ['ground', kind === 'tree' || kind === 'bush' ? oklchToHex({ l: 0.68, c: 0.12, h: leafHue - 15 }) : withLightness(flowerKeys[1 % flowerKeys.length], 0.55)],
      ['center', oklchToHex({ l: 0.85, c: 0.15, h: 90 })],
      ['leafLight', oklchToHex({ l: 0.76, c: 0.14, h: leafHue - 10 })],
      ['barkDark', oklchToHex({ l: 0.33, c: 0.06, h: 45 })],
      ...(background ? ([['bg2', oklchToHex({ l: 0.89, c: 0.04, h: bgHue })]] as [string, HexColor][]) : []),
      ['petal2', withLightness(flowerKeys[1 % flowerKeys.length], clamp(hexToOklch(flowerKeys[1 % flowerKeys.length]).l, 0.55, 0.78))],
      ['groundDark', kind === 'tree' || kind === 'bush' ? oklchToHex({ l: 0.55, c: 0.1, h: leafHue - 25 }) : withLightness(flowerKeys[1 % flowerKeys.length], 0.42)],
      ['petalLight', withLightness(flowerKeys[0], 0.86)],
      ['petal3', withLightness(flowerKeys[2 % flowerKeys.length], 0.66)],
    ];
    const got = new Map<string, number>();
    roles.slice(0, ctx.colors).forEach(([r, c]) => got.set(r, cv.ink(c)));
    const g = (...names: string[]) => {
      for (const n of names) {
        const v = got.get(n);
        if (v !== undefined) return v;
      }
      return got.get('leaf')!;
    };
    const ink = g('ink', 'bark');
    const leaf = g('leaf');
    const leafDark = g('leafDark', 'leaf');
    const leafLight = g('leafLight', 'leaf');
    const bark = g('bark', 'leafDark');
    const barkDark = g('barkDark', 'bark');
    const petals = [g('petal', 'bark'), g('petal2', 'petal', 'bark'), g('petal3', 'petal', 'bark')];
    const petalLight = g('petalLight', 'center', 'petal');
    const center = g('center', 'petal', 'bark');
    const ground = g('ground', 'leafDark');
    const groundDark = g('groundDark', 'ground');

    // ---------------------------------------------------------------- grammar → geometry
    const sys = SYSTEMS[kind](detail);
    const shape = interpret(expand(sys, rng), sys, rng);
    ctx.check();
    const potted = kind === 'flower' || kind === 'bouquet';
    const groundY = potted ? h * 0.74 : h * 0.86;
    // Bounding box of the plant, including foliage / blossom radius margins.
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    for (const sg of shape.segs) {
      minX = Math.min(minX, sg.x0, sg.x1);
      maxX = Math.max(maxX, sg.x0, sg.x1);
      minY = Math.min(minY, sg.y0, sg.y1);
    }
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, -minY);
    const margin = kind === 'tree' ? 0.16 : kind === 'bush' ? 0.1 : 0.12;
    const availW = w * (1 - margin * 2);
    const availH = (groundY - h * (margin + 0.02)) * (kind === 'bush' ? 0.7 : 1);
    const k = Math.min(availW / spanX, availH / spanY);
    const ox = w / 2 - ((minX + maxX) / 2) * k;
    const tx = (x: number) => ox + x * k;
    const ty = (y: number) => groundY + y * k;

    const ids = new Raster(w, h);
    let nextId = 2;
    const part = (draw: (m: Raster) => void, paint: number | ((x: number, y: number) => number), id = ++nextId) => {
      const m = new Raster(w, h);
      draw(m);
      cv.paintMask(m, paint);
      ids.paintMask(m, id);
      return m;
    };

    // Ground or pot (drawn first: the plant stands in front).
    if (potted) {
      const pw = S * (kind === 'bouquet' ? 0.16 : 0.2);
      const top = groundY - S * 0.02;
      const bottom = h - S * 0.05;
      part((m) => m.polygon([[w / 2 - pw, top], [w / 2 + pw, top], [w / 2 + pw * 0.72, bottom], [w / 2 - pw * 0.72, bottom]], 1), (x) => (x + 0.5 > w / 2 + pw * 0.35 ? groundDark : ground));
      part((m) => m.rect(Math.round(w / 2 - pw * 1.12), Math.round(top - S * 0.035), Math.round(w / 2 + pw * 1.12), Math.round(top + S * 0.025), 1), ground);
    } else {
      part((m) => m.region(0, groundY - 2, w - 1, h - 1, (x, y) => y + 0.5 >= groundY + Math.sin((x / w) * Math.PI * 2 + 1) * S * 0.015, 1), (x, y) => (y > groundY + S * 0.06 ? groundDark : ground), 1);
    }

    // Branches, thick to thin.
    const baseW = kind === 'tree' ? Math.max(2, S * 0.065) : kind === 'bush' ? Math.max(1.5, S * 0.03) : Math.max(1, S * 0.018);
    const stemColor = potted ? leafDark : bark;
    const segs = [...shape.segs].sort((a, b) => a.level - b.level);
    const branchMask = new Raster(w, h);
    for (const sg of segs) {
      const width = Math.max(1, baseW * 0.68 ** sg.level);
      const x0 = tx(sg.x0);
      const y0 = ty(sg.y0);
      const x1 = tx(sg.x1);
      const y1 = ty(sg.y1);
      const dx = x1 - x0;
      const dy = y1 - y0;
      branchMask.stroke(x0, y0, x1, y1, width, 1);
      const paint = width >= 4 && !potted ? (x: number, y: number) => ((x + 0.5 - x0) * dy - (y + 0.5 - y0) * dx > 0 ? barkDark : bark) : stemColor;
      cv.stroke(x0, y0, x1, y1, width, paint);
    }
    ids.paintMask(branchMask, ++nextId);
    ctx.check();

    // Foliage clusters (trees, bushes) on branch tips, shaded from the top-left.
    if (kind === 'tree' || kind === 'bush') {
      const r0 = S * (kind === 'tree' ? 0.06 : 0.045) * (detail === 1 ? 1.4 : detail === 2 ? 1.1 : 1);
      const foliage = new Raster(w, h);
      const shadeMap = new Raster(w, h);
      const pts = kind === 'tree' ? shape.tips : shape.leaves;
      const sorted = [...pts].sort((a, b) => b.y - a.y);
      for (const t of sorted) {
        const cx = tx(t.x);
        const cy = ty(t.y);
        const r = Math.max(1.8, r0 * rng.range(0.75, 1.25));
        foliage.disc(cx, cy, r, 1);
        shadeMap.region(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r, (x, y) => {
          const nx = (x + 0.5 - cx) / r;
          const ny = (y + 0.5 - cy) / r;
          const d = -nx * 0.45 - ny * 0.6 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.65;
          return d > 0.78 && detail >= 2 ? 3 : d < 0.12 ? 1 : 2;
        });
      }
      cv.paintMask(foliage, (x, y) => [leaf, leafDark, leaf, leafLight][shadeMap.get(x, y)]);
      ids.paintMask(foliage, ++nextId);
      if (blossoms && S >= 96) {
        const fr = Math.max(1.2, S * 0.016);
        let left = Math.round(4 + S / 16);
        const fruit = petals[0];
        for (const t of sorted) {
          if (left <= 0 || !rng.chance(0.3)) continue;
          const fx = tx(t.x) + rng.range(-r0, r0) * 0.6;
          const fy = ty(t.y) + rng.range(-r0, r0) * 0.6;
          if (!foliage.get(Math.floor(fx), Math.floor(fy))) continue;
          part((m) => m.disc(fx, fy, fr + 0.6, 1), fruit);
          left--;
        }
      }
    }

    // Leaves along stems (flowers, bouquets).
    if (potted) {
      const ll = S * (kind === 'bouquet' ? 0.06 : 0.09);
      for (const lf of shape.leaves) {
        const rad = (lf.angle * Math.PI) / 180;
        const cx = tx(lf.x) + Math.cos(rad) * ll * 0.8;
        const cy = ty(lf.y) + Math.sin(rad) * ll * 0.8;
        part((m) => m.ellipse(cx, cy, ll, Math.max(1.2, ll * 0.42), 1, lf.angle), (x, y) => ((x + 0.5 - cx) * Math.sin(rad) - (y + 0.5 - cy) * Math.cos(rad) > 0 ? leafLight : leaf));
      }
    }

    // Blossoms: petals around a center.
    if (potted) {
      const br = S * (kind === 'bouquet' ? rng.range(0.07, 0.085) : rng.range(0.12, 0.15));
      shape.blooms.forEach((b, i) => {
        const cx = tx(b.x);
        const cy = ty(b.y);
        const n = rng.int(5, 8);
        const col = petals[i % petals.length];
        const rot = rng.range(0, 360);
        const style = rng.pick(['round', 'pointed'] as const);
        part((m) => {
          for (let p = 0; p < n; p++) {
            const a = ((rot + (p * 360) / n) * Math.PI) / 180;
            m.ellipse(cx + Math.cos(a) * br * 0.55, cy + Math.sin(a) * br * 0.55, br * 0.55, br * (style === 'round' ? 0.4 : 0.25), 1, (a * 180) / Math.PI);
          }
        }, col);
        if (br >= 6 && detail >= 2) {
          part((m) => {
            for (let p = 0; p < n; p++) {
              const a = ((rot + (p * 360) / n) * Math.PI) / 180;
              m.ellipse(cx + Math.cos(a) * br * 0.55, cy + Math.sin(a) * br * 0.55, br * 0.25, br * 0.13, 1, (a * 180) / Math.PI);
            }
          }, petalLight);
        }
        part((m) => m.disc(cx, cy, Math.max(1.2, br * 0.3), 1), center);
      });
    }
    ctx.check();

    // Small grids: plant silhouette only (part lines would swallow petals and leaves); the
    // ground keeps id 1 so it is outlined against the plant, never inside itself.
    const outlineIds = S < 96 ? new Raster(w, h).paintMask(ids, (x, y) => (ids.get(x, y) === 1 ? 1 : 2)) : ids;
    if (lw > 0) cv.paintMask(boundaries(outlineIds, lw), ink);
    if (background) {
      const bg = g('bg', 'leafLight');
      const bg2 = g('bg2', 'bg');
      // Two soft bands with a crenel edge (runs of ≥ 2 cells: colorable, no orphans).
      const split = Math.round(groundY * 0.55);
      const run = Math.max(2, Math.round(S / 24));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (ids.data[i]) continue;
          cv.data[i] = y < split || (y === split && Math.floor(x / run) % 2 === 0) ? bg : bg2;
        }
    }
    return cv;
  },
};
