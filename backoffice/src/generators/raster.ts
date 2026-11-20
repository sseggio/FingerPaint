/**
 * Integer raster used by the generators: a w×h grid of small integers (0 = empty) with crisp
 * shape primitives (tested at cell centers), 4-connected lines, outlines, mirroring and the
 * cleanup passes that keep artworks pleasant to color (no orphan cells, no tiny specks).
 * `Canvas` adds a color table (value v ↔ colors[v - 1]).
 */
import type { HexColor } from '../artwork-lib';

export type Paint = number | ((x: number, y: number) => number);

const N4X = [1, -1, 0, 0];
const N4Y = [0, 0, 1, -1];

export class Raster {
  readonly data: Uint16Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint16Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : 0;
  }

  set(x: number, y: number, v: number): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = v;
  }

  /** Calls `test(x, y)` on every cell of the clipped box and paints those where it is true. */
  region(x0: number, y0: number, x1: number, y1: number, test: (x: number, y: number) => boolean, paint: Paint): this {
    const ax = Math.max(0, Math.floor(x0));
    const ay = Math.max(0, Math.floor(y0));
    const bx = Math.min(this.w - 1, Math.ceil(x1));
    const by = Math.min(this.h - 1, Math.ceil(y1));
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++) {
        if (!test(x, y)) continue;
        const v = typeof paint === 'number' ? paint : paint(x, y);
        if (v >= 0) this.data[y * this.w + x] = v;
      }
    return this;
  }

  fill(paint: Paint): this {
    return this.region(0, 0, this.w - 1, this.h - 1, () => true, paint);
  }

  rect(x0: number, y0: number, x1: number, y1: number, paint: Paint): this {
    return this.region(x0, y0, x1, y1, () => true, paint);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, paint: Paint, rotDeg = 0): this {
    const a = (rotDeg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r = Math.max(rx, ry);
    return this.region(
      cx - r - 1,
      cy - r - 1,
      cx + r + 1,
      cy + r + 1,
      (x, y) => {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const u = dx * c + dy * s;
        const v = -dx * s + dy * c;
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
      },
      paint,
    );
  }

  disc(cx: number, cy: number, r: number, paint: Paint): this {
    return this.ellipse(cx, cy, r, r, paint);
  }

  ring(cx: number, cy: number, r0: number, r1: number, paint: Paint): this {
    return this.region(
      cx - r1 - 1,
      cy - r1 - 1,
      cx + r1 + 1,
      cy + r1 + 1,
      (x, y) => {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        return d >= r0 && d <= r1;
      },
      paint,
    );
  }

  polygon(pts: readonly (readonly [number, number])[], paint: Paint): this {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return this.region(
      x0 - 1,
      y0 - 1,
      x1 + 1,
      y1 + 1,
      (x, y) => {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      },
      paint,
    );
  }

  /** Thick segment with round caps (radius r, continuous coordinates). */
  capsule(x0: number, y0: number, x1: number, y1: number, r: number, paint: Paint): this {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    return this.region(
      Math.min(x0, x1) - r - 1,
      Math.min(y0, y1) - r - 1,
      Math.max(x0, x1) + r + 1,
      Math.max(y0, y1) + r + 1,
      (x, y) => {
        const px = x + 0.5;
        const py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
        return (px - x0 - t * dx) ** 2 + (py - y0 - t * dy) ** 2 <= r * r;
      },
      paint,
    );
  }

  /** 4-connected Bresenham line (cells share an edge, so a 1-cell line never breaks apart). */
  line4(x0: number, y0: number, x1: number, y1: number, paint: Paint): this {
    let x = Math.floor(x0);
    let y = Math.floor(y0);
    const tx = Math.floor(x1);
    const ty = Math.floor(y1);
    const dx = Math.abs(tx - x);
    const dy = Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    const put = () => {
      if (!this.inside(x, y)) return;
      const v = typeof paint === 'number' ? paint : paint(x, y);
      if (v >= 0) this.data[y * this.w + x] = v;
    };
    put();
    // Step along one axis at a time (never diagonally), following the ideal line.
    for (let ix = 0, iy = 0; ix < dx || iy < dy; ) {
      if ((1 + 2 * ix) * dy < (1 + 2 * iy) * dx) {
        x += sx;
        ix++;
      } else {
        y += sy;
        iy++;
      }
      put();
    }
    return this;
  }

  /** Line of a given width: 4-connected for thin strokes, a capsule otherwise. */
  stroke(x0: number, y0: number, x1: number, y1: number, width: number, paint: Paint): this {
    if (width < 1.6) return this.line4(x0, y0, x1, y1, paint);
    return this.capsule(x0, y0, x1, y1, width / 2, paint);
  }

  /** Copies the left half onto the right half (vertical symmetry axis). */
  mirrorX(): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w >> 1; x++) this.data[y * this.w + this.w - 1 - x] = this.data[y * this.w + x];
    return this;
  }

  /** Cells of `this` (non-zero) on the inner edge: a neighbor (8-neighborhood) is zero. 4-connected result. */
  edges(thickness = 1): Raster {
    const out = new Raster(this.w, this.h);
    let cur: Raster = this;
    for (let t = 0; t < thickness; t++) {
      const next = new Raster(this.w, this.h);
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          if (!cur.data[y * this.w + x]) continue;
          let edge = false;
          for (let dy = -1; dy <= 1 && !edge; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h || !cur.data[ny * this.w + nx]) {
                edge = true;
                break;
              }
            }
          if (edge) out.data[y * this.w + x] = 1;
          else next.data[y * this.w + x] = 1;
        }
      cur = next;
    }
    return out;
  }

  /** Zero cells touching (4-neighborhood) a non-zero cell, `thickness` times: an outer outline. */
  halo(thickness = 1): Raster {
    const out = new Raster(this.w, this.h);
    const filled = Uint8Array.from(this.data, (v) => (v ? 1 : 0));
    for (let t = 0; t < thickness; t++) {
      const add: number[] = [];
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          const i = y * this.w + x;
          if (filled[i]) continue;
          for (let k = 0; k < 4; k++) {
            const nx = x + N4X[k];
            const ny = y + N4Y[k];
            if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && filled[ny * this.w + nx]) {
              add.push(i);
              break;
            }
          }
        }
      for (const i of add) {
        filled[i] = 1;
        out.data[i] = 1;
      }
    }
    return out;
  }

  /** Paints `paint` wherever `mask` is non-zero (paint functions may return -1 to skip). */
  paintMask(mask: Raster, paint: Paint): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (!mask.data[i]) continue;
        const v = typeof paint === 'number' ? paint : paint(x, y);
        if (v >= 0) this.data[i] = v;
      }
    return this;
  }

  /** Non-zero cells of `src` are copied over (layer compositing). */
  over(src: Raster): this {
    for (let i = 0; i < this.data.length; i++) if (src.data[i]) this.data[i] = src.data[i];
    return this;
  }

  /**
   * Merges every 4-connected same-value component smaller than `minSize` cells into the value
   * it shares the longest border with (empty cells count as a value too). Repeated until stable
   * (bounded): no orphan cells, no specks too small to color comfortably.
   */
  cleanSmallRegions(minSize: number, passes = 3): this {
    if (minSize <= 1) return this;
    const { w, h, data } = this;
    const n = w * h;
    const label = new Int32Array(n);
    const queue = new Int32Array(n);
    for (let pass = 0; pass < passes; pass++) {
      label.fill(-1);
      let changed = false;
      for (let start = 0; start < n; start++) {
        if (label[start] >= 0) continue;
        const v = data[start];
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        label[start] = start;
        while (head < tail) {
          const i = queue[head++];
          const x = i % w;
          const y = (i - x) / w;
          for (let k = 0; k < 4; k++) {
            const nx = x + N4X[k];
            const ny = y + N4Y[k];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (label[j] < 0 && data[j] === v) {
              label[j] = start;
              queue[tail++] = j;
            }
          }
        }
        if (tail >= minSize || tail === n) continue;
        // Most common neighboring value along the component's border.
        const border = new Map<number, number>();
        for (let q = 0; q < tail; q++) {
          const i = queue[q];
          const x = i % w;
          const y = (i - x) / w;
          for (let k = 0; k < 4; k++) {
            const nx = x + N4X[k];
            const ny = y + N4Y[k];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const u = data[ny * w + nx];
            if (u !== v) border.set(u, (border.get(u) ?? 0) + 1);
          }
        }
        let best = -1;
        let bestCount = 0;
        for (const [u, c] of border) if (c > bestCount || (c === bestCount && u > best)) [best, bestCount] = [u, c];
        if (best < 0) continue;
        for (let q = 0; q < tail; q++) data[queue[q]] = best;
        changed = true;
      }
      if (!changed) break;
    }
    return this;
  }
}

/** A raster whose values index a color table (0 = empty, non-colorable cell). */
export class Canvas extends Raster {
  private readonly colors: HexColor[] = [];
  private readonly index = new Map<string, number>();

  /** Value of a color (registered on first use). */
  ink(hex: HexColor): number {
    const key = hex.toUpperCase();
    let v = this.index.get(key);
    if (v === undefined) {
      this.colors.push(key as HexColor);
      v = this.colors.length;
      this.index.set(key, v);
    }
    return v;
  }

  colorOf(v: number): HexColor | null {
    return v > 0 ? (this.colors[v - 1] ?? null) : null;
  }

  /** Rows of hex colors (null = empty), the input of the shared quantizer. */
  toGrid(): (HexColor | null)[][] {
    const rows: (HexColor | null)[][] = [];
    for (let y = 0; y < this.h; y++) {
      const row: (HexColor | null)[] = [];
      for (let x = 0; x < this.w; x++) row.push(this.colorOf(this.data[y * this.w + x]));
      rows.push(row);
    }
    return rows;
  }
}
