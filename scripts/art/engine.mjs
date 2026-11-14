/**
 * Tiny pixel-art engine used by `scripts/generate-art.mjs`.
 *
 * An `Art` is a w×h grid of color *names* (null = empty, non-colorable cell). Shapes are
 * masks `(x, y) => boolean` tested at pixel centers; paints are a color name or a function
 * `(x, y) => name | null`. `toSource()` turns the grid into an `ArtworkSource` (palette sorted
 * by luminance, RLE rows) and checks the palette rules (ΔE76 ≥ 10, every color used).
 */

export const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// ---------------------------------------------------------------------------- color math

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lin(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function rgbToLab([r, g, b]) {
  const lr = lin(r);
  const lg = lin(g);
  const lb = lin(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a, b) {
  const [l1, a1, b1] = rgbToLab(hexToRgb(a));
  const [l2, a2, b2] = rgbToLab(hexToRgb(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export function encodeRow(values) {
  let out = '';
  for (let i = 0; i < values.length; ) {
    let j = i + 1;
    while (j < values.length && values[j] === values[i]) j++;
    out += (j - i > 1 ? String(j - i) : '') + values[i];
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------------------- shapes

export const ellipse = (cx, cy, rx, ry) => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
export const circle = (cx, cy, r) => ellipse(cx, cy, r, r);
/** Ellipse rotated by `deg` degrees (clockwise, screen coordinates). */
export const rotEllipse = (cx, cy, rx, ry, deg) => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const u = dx * c + dy * s;
    const v = -dx * s + dy * c;
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
  };
};
/** Inclusive integer bounds. */
export const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
/** Box covering cells x0..x1 × y0..y1 with rounded corners of radius r (in cells). */
export const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const px = x + 0.5;
  const py = y + 0.5;
  const ix = Math.min(Math.max(px, x0 + r), x1 + 1 - r);
  const iy = Math.min(Math.max(py, y0 + r), y1 + 1 - r);
  return (px - ix) ** 2 + (py - iy) ** 2 <= r * r;
};
/** Polygon with vertices in continuous coordinates. */
export const poly = (pts) => (x, y) => {
  const px = x + 0.5;
  const py = y + 0.5;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** Thick segment (capsule) of radius r between two continuous points. */
export const line = (x0, y0, x1, y1, r) => (x, y) => {
  const px = x + 0.5;
  const py = y + 0.5;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
  return (px - x0 - t * dx) ** 2 + (py - y0 - t * dy) ** 2 <= r * r;
};
/** Polyline whose radius varies along the way (`radii[i]` at `pts[i]`). */
export const taper = (pts, radii) => (x, y) => {
  const px = x + 0.5;
  const py = y + 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
    const r = radii[i] + t * (radii[i + 1] - radii[i]);
    if ((px - x0 - t * dx) ** 2 + (py - y0 - t * dy) ** 2 <= r * r) return true;
  }
  return false;
};
/** Points along a circular arc (degrees, screen coordinates: 0° = right, 90° = down). */
export const arcPoints = (cx, cy, r, from, to, n) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
/** Star polygon with `n` points. */
export const star = (cx, cy, r0, r1, n = 5, rot = -90) =>
  poly(
    Array.from({ length: n * 2 }, (_, i) => {
      const a = ((rot + (i * 180) / n) * Math.PI) / 180;
      const r = i % 2 === 0 ? r0 : r1;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }),
  );
/** Wavy band: cells between two sine curves y = base + amp·sin(x·freq + phase). */
export const wave = (base, amp, freq, phase = 0, bottom = Infinity) => (x, y) =>
  y + 0.5 >= base + amp * Math.sin((x + 0.5) * freq + phase) && y < bottom;
/** Polyline of capsules. */
export const path = (pts, r) => union(...pts.slice(1).map((p, i) => line(pts[i][0], pts[i][1], p[0], p[1], r)));
export const ring = (cx, cy, r0, r1) => (x, y) => {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return d >= r0 && d <= r1;
};
export const union = (...ms) => (x, y) => ms.some((m) => m(x, y));
export const inter = (...ms) => (x, y) => ms.every((m) => m(x, y));
export const diff = (a, ...bs) => (x, y) => a(x, y) && !bs.some((m) => m(x, y));
export const shift = (m, dx, dy) => (x, y) => m(x - dx, y - dy);
/** Mirror a mask around the vertical axis of a grid of width w. */
export const flipX = (m, w) => (x, y) => m(w - 1 - x, y);
export const sym = (m, w) => union(m, flipX(m, w));
export const all = () => true;
export const below = (y0) => (x, y) => y >= y0;
export const above = (y0) => (x, y) => y < y0;
export const leftOf = (x0) => (x) => x < x0;

// ---------------------------------------------------------------------------- paints

/** Quantized sphere lighting (light from the top-left). `bands` go dark → light. */
export function sphere(cx, cy, rx, ry, bands, { light = [-0.55, -0.65, 0.55], cuts } = {}) {
  const ln = Math.hypot(...light);
  const L = light.map((v) => v / ln);
  const n = bands.length;
  const thresholds = cuts ?? Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
  return (x, y) => {
    const nx = (x + 0.5 - cx) / rx;
    const ny = (y + 0.5 - cy) / ry;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    let i = 0;
    while (i < thresholds.length && d > thresholds[i]) i++;
    return bands[i];
  };
}

/** Vertical bands between y0 and y1 (inclusive); optional checker dither on band edges. */
export function vgrad(y0, y1, bands, { dither = false } = {}) {
  const n = bands.length;
  const span = y1 - y0 + 1;
  return (x, y) => {
    const f = ((y - y0 + 0.5) / span) * n;
    let i = Math.max(0, Math.min(n - 1, Math.floor(f)));
    const rowInBand = Math.floor((y - y0) - (i * span) / n);
    if (dither && i > 0 && rowInBand === 0 && (x + y) % 2 === 0) i -= 1;
    return bands[i];
  };
}

/** Radial bands around (cx, cy), inner → outer. */
export function rgrad(cx, cy, r, bands) {
  return (x, y) => {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    return bands[Math.max(0, Math.min(bands.length - 1, Math.floor(d * bands.length)))];
  };
}

export function stripes(period, a, b, { horizontal = false, offset = 0 } = {}) {
  return (x, y) => ((Math.floor(((horizontal ? y : x) + offset) / period) % 2 + 2) % 2 === 0 ? a : b);
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------- canvas

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [-1, -1], [1, -1], [-1, 1]];

export class Art {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x, y) {
    return this.inside(x, y) ? this.px[y * this.w + x] : null;
  }

  set(x, y, c) {
    if (this.inside(x, y)) this.px[y * this.w + x] = c;
    return this;
  }

  /**
   * Paints a mask. Options:
   * - `outline`: color of the mask's inner boundary (`outline8` for 8-connected boundary);
   * - `dark` / `light`: { color, depth } bevel shading on bottom-right / top-left edges;
   * - `clip`: extra mask restricting where paint lands; `only`: paint only over these names.
   */
  paint(mask, color, opts = {}) {
    const { outline, outline8 = false, dark, light, clip, only, skipOutlineAt } = opts;
    const m = clip ? inter(mask, clip) : mask;
    const ol = outline ? 1 : 0;
    const writes = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!m(x, y)) continue;
        if (only && !only.includes(this.get(x, y))) continue;
        let c;
        const edge = (outline8 ? N8 : N4).some(([dx, dy]) => !mask(x + dx, y + dy));
        if (outline && edge && !(skipOutlineAt && skipOutlineAt(x, y))) c = outline;
        else if (dark && Array.from({ length: (dark.depth ?? 1) }, (_, i) => i + 1 + ol).some((d) => !mask(x + (dark.dx ?? 1) * d, y + (dark.dy ?? 1) * d)))
          c = dark.color;
        else if (light && Array.from({ length: (light.depth ?? 1) }, (_, i) => i + 1 + ol).some((d) => !mask(x - (light.dx ?? 1) * d, y - (light.dy ?? 1) * d)))
          c = light.color;
        else c = typeof color === 'function' ? color(x, y) : color;
        if (c !== undefined) writes.push([x, y, c]);
      }
    }
    for (const [x, y, c] of writes) this.set(x, y, c);
    return this;
  }

  /** Stamps an ASCII map at (x0, y0); '.' and ' ' are transparent; `map` maps chars to names. */
  stamp(rows, map, x0 = 0, y0 = 0, { flip = false } = {}) {
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === '.' || ch === ' ') return;
        const name = map[ch];
        if (name === undefined) throw new Error(`stamp: unknown char "${ch}"`);
        this.set(flip ? x0 - dx : x0 + dx, y0 + dy, name);
      });
    });
    return this;
  }

  /** Little "+" shaped twinkle (only over empty cells unless `force`). */
  twinkle(x, y, c, { force = false, size = 1 } = {}) {
    for (let d = -size; d <= size; d++) {
      for (const [px, py] of [[x + d, y], [x, y + d]]) if (force || this.get(px, py) === null) this.set(px, py, c);
    }
    return this;
  }

  /** Mirrors the left half onto the right half. */
  mirrorX() {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < Math.floor(this.w / 2); x++) this.set(this.w - 1 - x, y, this.get(x, y));
    return this;
  }

  /** Outline around the filled area, drawn into empty neighbor cells. */
  outer(color, { diagonal = false } = {}) {
    const writes = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue;
        const n = (diagonal ? N8 : N4).map(([dx, dy]) => this.get(x + dx, y + dy)).find((c) => c !== null);
        if (n) writes.push([x, y, typeof color === 'function' ? color(n) : color]);
      }
    for (const [x, y, c] of writes) this.set(x, y, c);
    return this;
  }

  /** Fills every empty cell (or those in `mask`). */
  background(paint, mask = all) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.get(x, y) === null && mask(x, y)) this.set(x, y, typeof paint === 'function' ? paint(x, y) : paint);
    return this;
  }

  replace(from, to, mask = all) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.get(x, y) === from && mask(x, y)) this.set(x, y, to);
    return this;
  }

  /** Removes isolated single cells of `name` (cleanup after procedural passes). */
  clear(mask) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (mask(x, y)) this.set(x, y, null);
    return this;
  }

  /** Builds the artwork JSON; throws on palette rule violations. */
  toSource(meta, colors) {
    const used = new Set(this.px.filter((c) => c !== null));
    for (const name of used) if (!colors[name]) throw new Error(`${meta.id}: color "${name}" has no hex`);
    const names = [...used].sort((a, b) => luminance(colors[a]) - luminance(colors[b]) || colors[a].localeCompare(colors[b]));
    if (names.length > KEYS.length) throw new Error(`${meta.id}: too many colors`);
    const problems = [];
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const d = deltaE(colors[names[i]], colors[names[j]]);
        if (d < 10) problems.push(`${names[i]}(${colors[names[i]]}) ~ ${names[j]}(${colors[names[j]]}) ΔE ${d.toFixed(1)}`);
      }
    if (problems.length) throw new Error(`${meta.id}: palette too close:\n  ${problems.join('\n  ')}`);
    const keyOf = new Map(names.map((n, i) => [n, KEYS[i]]));
    const rows = [];
    for (let y = 0; y < this.h; y++) {
      const vals = [];
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        vals.push(c === null ? '.' : keyOf.get(c));
      }
      rows.push(encodeRow(vals));
    }
    return {
      v: 1,
      id: meta.id,
      album: meta.album,
      title: meta.title,
      w: this.w,
      h: this.h,
      palette: names.map((n) => colors[n].toUpperCase()),
      rows,
      access: meta.access ?? 'free',
      difficulty: meta.difficulty,
    };
  }
}

/** ASCII-map artwork (the starter format): rows, optional mirror and patches. */
export function fromAscii({ rows, mirror = false, patches = [] }) {
  const grid = rows.map((row) => (mirror ? row + [...row].reverse().join('') : row).split(''));
  for (const [x, y, ch] of patches) grid[y][x] = ch;
  const w = grid[0].length;
  const art = new Art(w, grid.length);
  grid.forEach((row, y) => {
    if (row.length !== w) throw new Error(`row ${y} has ${row.length} cells, expected ${w}`);
    row.forEach((ch, x) => art.set(x, y, ch === '.' ? null : ch));
  });
  return art;
}
