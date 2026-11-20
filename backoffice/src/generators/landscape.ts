/**
 * Landscape: quantized sky gradient (staggered "crenel" dithering that stays colorable), sun
 * or moon with halo, stars, puffy clouds, layered mountains and hills from fractal value noise
 * (atmospheric perspective, lit facets, snow caps, pine silhouettes), and water reflecting the
 * scene with ripples.
 */
import type { HexColor } from '../artwork-lib';
import { hexToOklch, mix, oklchToHex, withLightness } from './color';
import { clamp, lerp } from './common';
import { ValueNoise } from './noise';
import { bool, commonSpecs, num, str } from './params';
import type { Rng } from './prng';
import { Canvas, Raster } from './raster';
import type { GeneratorDef } from './types';

type Sky = 'day' | 'sunset' | 'night';

/** Palette key whose hue is closest to `hue` (degrees), among reasonably saturated ones. */
function nearestHue(keys: readonly HexColor[], hue: number): HexColor {
  let best = keys[0];
  let bestD = Infinity;
  for (const k of keys) {
    const o = hexToOklch(k);
    if (o.c < 0.04) continue;
    const d = Math.abs(((o.h - hue + 540) % 360) - 180);
    if (d < bestD) [best, bestD] = [k, d];
  }
  return best;
}

/** Same hue as `key`, pulled toward `hue` by `t` (keeps the palette's flavor, reads as the right thing). */
function tint(key: string, hue: number, t: number, l: number, c?: number): HexColor {
  const o = hexToOklch(key);
  const d = ((hue - o.h + 540) % 360) - 180;
  return oklchToHex({ l, c: c ?? Math.max(0.05, o.c), h: (o.h + d * t + 360) % 360 });
}

function cloudMask(r: Raster, rng: Rng, cx: number, cy: number, size: number) {
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const ex = cx + (t - 0.5) * size * 2.2;
    const bump = Math.sin(t * Math.PI);
    const rx = size * rng.range(0.45, 0.7) * (0.6 + 0.4 * bump);
    const ry = size * rng.range(0.35, 0.5) * (0.5 + 0.6 * bump);
    r.region(ex - rx - 1, cy - ry * 2 - 1, ex + rx + 1, cy + 1, (x, y) => ((x + 0.5 - ex) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 && y + 0.5 <= cy + ry * 0.25, 1);
  }
}

export const landscape: GeneratorDef = {
  id: 'landscape',
  name: { fr: 'Paysage', en: 'Landscape' },
  description: 'Ciel en dégradé, montagnes et collines, soleil ou lune, nuages, étoiles et reflets dans l’eau.',
  clean: true,
  params: [
    ...commonSpecs({ colors: 14 }),
    {
      key: 'sky',
      kind: 'enum',
      label: 'Ciel',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'day', label: 'Jour' },
        { value: 'sunset', label: 'Couchant' },
        { value: 'night', label: 'Nuit' },
      ],
      default: 'auto',
    },
    { key: 'layers', kind: 'int', label: 'Plans de relief', min: 1, max: 5, default: 3 },
    { key: 'water', kind: 'bool', label: 'Eau et reflets', default: true },
    { key: 'clouds', kind: 'bool', label: 'Nuages', default: true },
    { key: 'dither', kind: 'bool', label: 'Tramage du ciel', default: true },
  ],
  draw(ctx) {
    const { rng, w, h, keys, detail } = ctx;
    const p = ctx.params;
    const cv = new Canvas(w, h);
    const s = Math.min(w, h);
    const skyChoice = str(p, 'sky');
    const sky: Sky = skyChoice === 'auto' ? rng.pick(['day', 'sunset', 'sunset', 'night'] as Sky[]) : (skyChoice as Sky);
    const layers = num(p, 'layers');
    const water = bool(p, 'water');
    const clouds = bool(p, 'clouds') && sky !== 'night';
    const dither = bool(p, 'dither');
    const noise = new ValueNoise(rng.fork('noise'));
    const C = ctx.colors;

    // ---------------------------------------------------------------- color budget
    const waterN = water ? (C >= 10 ? 3 : 2) : 0;
    const cloudN = clouds ? (C >= 9 ? 2 : 1) : 0;
    const orbN = C >= 10 ? 2 : 1;
    const layerShade = C - waterN - cloudN - orbN - 2 >= layers * 2 + 1;
    const snow = C >= 12 && layers >= 2;
    const used = waterN + cloudN + orbN + layers * (layerShade ? 2 : 1) + (snow ? 1 : 0);
    const skyN = clamp(C - used, 2, detail === 1 ? 3 : 5);

    const blue = nearestHue(keys, 235);
    const warm = nearestHue(keys, 50);
    const purple = nearestHue(keys, 300);
    const green = nearestHue(keys, 140);
    let skyTop: HexColor;
    let skyBottom: HexColor;
    if (sky === 'day') {
      skyTop = tint(blue, 240, 0.85, 0.6, 0.14);
      skyBottom = tint(blue, 215, 0.85, 0.94, 0.05);
    } else if (sky === 'sunset') {
      skyTop = tint(purple, 290, 0.5, 0.42, 0.12);
      skyBottom = tint(warm, 65, 0.5, 0.86, 0.14);
    } else {
      skyTop = tint(blue, 265, 0.7, 0.2, 0.06);
      skyBottom = tint(purple, 280, 0.5, 0.42, 0.1);
    }
    const skyCols = Array.from({ length: skyN }, (_, i) => cv.ink(mix(skyTop, skyBottom, skyN === 1 ? 0 : i / (skyN - 1))));
    const orbColor = sky === 'night' ? tint(warm, 90, 0.7, 0.95, 0.06) : sky === 'sunset' ? tint(warm, 75, 0.6, 0.93, 0.13) : tint(warm, 95, 0.6, 0.95, 0.12);
    const orb = cv.ink(orbColor);
    const halo = orbN > 1 ? cv.ink(mix(orbColor, skyBottom, sky === 'night' ? 0.75 : 0.45)) : -1;

    // ---------------------------------------------------------------- geometry
    const horizon = water ? Math.round(h * rng.range(0.6, 0.7)) : h;
    const groundBottom = horizon;
    // Bands span the visible sky (down to the far mountains), so every band shows.
    const skyDepth = horizon * (water ? 0.62 : 0.58);
    const bands = (y: number) => clamp(Math.floor((y / Math.max(1, skyDepth)) * skyN), 0, skyN - 1);
    const run = Math.max(2, Math.round(s / 24));
    // Sky with staggered band edges: runs of `run` cells always touch their own band.
    for (let y = 0; y < horizon; y++) {
      const b = bands(y);
      const prevB = y > 0 ? bands(y - 1) : b;
      for (let x = 0; x < w; x++) {
        let v = skyCols[b];
        if (dither && b !== prevB && Math.floor((x + (b % 2) * (run >> 1)) / run) % 2 === 0) v = skyCols[prevB];
        cv.data[y * w + x] = v;
      }
    }
    ctx.check();

    // Sun / moon (+ halo), placed in the upper sky; sunsets sit low.
    const orbR = Math.max(2.2, s * rng.range(0.06, 0.1));
    const ox = w * rng.range(0.2, 0.8);
    const oy = sky === 'sunset' ? horizon * rng.range(0.5, 0.62) : horizon * rng.range(0.2, 0.35);
    if (halo >= 0 && sky !== 'night') cv.disc(ox, oy, orbR * 1.55, halo);
    if (sky === 'night') {
      if (halo >= 0) cv.disc(ox, oy, orbR * 1.5, halo);
      const off = orbR * 0.45;
      cv.region(ox - orbR - 1, oy - orbR - 1, ox + orbR + 1, oy + orbR + 1, (x, y) => {
        const a = Math.hypot(x + 0.5 - ox, y + 0.5 - oy) <= orbR;
        const b = Math.hypot(x + 0.5 - ox - off, y + 0.5 - oy + off * 0.4) <= orbR * 0.85;
        return a && !b;
      }, orb);
      // Stars: little "+" shapes (5 cells, never orphans), away from the moon.
      const n = Math.round((w * horizon) / (detail === 1 ? 500 : 280));
      const arm = s >= 160 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const sx = rng.int(2, w - 3);
        const sy = rng.int(2, Math.max(3, Math.floor(horizon * 0.7)));
        if (Math.hypot(sx - ox, sy - oy) < orbR * 2.2) continue;
        cv.rect(sx - arm, sy, sx + arm, sy, orb);
        cv.rect(sx, sy - arm, sx, sy + arm, orb);
      }
    } else {
      cv.disc(ox, oy, orbR, orb);
    }

    // Clouds.
    if (clouds) {
      const light = cv.ink(sky === 'day' ? tint(blue, 230, 0.3, 0.98, 0.01) : tint(warm, 30, 0.5, 0.9, 0.06));
      const shade = cloudN > 1 ? cv.ink(sky === 'day' ? tint(blue, 240, 0.5, 0.86, 0.04) : tint(purple, 330, 0.5, 0.72, 0.09)) : light;
      const count = Math.max(1, Math.round(w / Math.max(40, s * 0.45)) + rng.int(0, 1));
      for (let i = 0; i < count; i++) {
        const m = new Raster(w, h);
        const size = s * rng.range(0.07, 0.12);
        const cx = w * ((i + rng.range(0.15, 0.85)) / count);
        const cy = horizon * rng.range(0.15, 0.45);
        cloudMask(m, rng, cx, cy, size);
        const bottom = cy - size * 0.1;
        cv.paintMask(m, (x, y) => (y + 0.5 > bottom ? shade : light));
      }
    }
    ctx.check();

    // ---------------------------------------------------------------- relief layers (far → near)
    const relief = new Raster(w, h);
    const mountainHue = sky === 'night' ? 260 : sky === 'sunset' ? 300 : 230;
    const horizonSky = mix(skyBottom, skyTop, 0.2);
    for (let i = 0; i < layers; i++) {
      const t = layers === 1 ? 1 : i / (layers - 1);
      const far = 1 - t;
      const isHill = t > 0.6 && layers > 1;
      const baseKey = isHill ? green : nearestHue(keys, mountainHue);
      const night = sky === 'night' ? 0.55 : 1;
      const l = lerp(isHill ? 0.48 : 0.4, 0.74, far) * night + (sky === 'night' ? 0.06 : 0);
      const solid = mix(tint(baseKey, isHill ? 140 : mountainHue, 0.35, l, isHill ? 0.11 : 0.07), horizonSky, far * 0.45);
      const body = cv.ink(solid);
      const lit = layerShade ? cv.ink(withLightness(solid, Math.min(0.92, hexToOklch(solid).l + 0.1))) : body;
      const snowC = snow && i === 0 && !isHill ? cv.ink(tint(blue, 230, 0.4, 0.97, 0.015)) : -1;
      const top = horizon * lerp(water ? 0.4 : 0.36, water ? 0.86 : 0.74, t);
      const amp = horizon * (isHill ? 0.07 : lerp(0.34, 0.16, t));
      const freq = (isHill ? 1.4 : 2.0) / Math.max(1, w);
      const off = rng.range(0, 1000);
      const ridge = new Float64Array(w);
      for (let x = 0; x < w; x++) {
        const n = noise.fbm1(x * freq * 4 + off, isHill ? 3 : 4, isHill ? 0.45 : 0.5);
        ridge[x] = top + amp * (1 - n) * 1.4 - amp * 0.2;
      }
      const peak = Math.min(...ridge);
      const sunLeft = ox < w / 2;
      // Peaks (local ridge minima) split the mountains into lit and shaded facets along tilted lines.
      const peaks: { x: number; y: number; tilt: number }[] = [];
      const win = Math.max(3, Math.round(w / 14));
      for (let x = 0; x < w; x++) {
        let isPeak = true;
        for (let d = -win; d <= win && isPeak; d++) if (d !== 0 && x + d >= 0 && x + d < w && ridge[x + d] < ridge[x]) isPeak = false;
        if (isPeak && (peaks.length === 0 || x - peaks[peaks.length - 1].x > win)) peaks.push({ x, y: ridge[x], tilt: rng.range(-0.35, 0.35) });
      }
      for (let x = 0; x < w; x++) {
        const y0 = Math.max(0, Math.floor(ridge[x]));
        let pk = peaks[0];
        for (const q of peaks) if (Math.abs(q.x - x) < Math.abs(pk.x - x)) pk = q;
        for (let y = y0; y < groundBottom; y++) {
          let v = body;
          if (!isHill && pk) {
            const div = pk.x + (y - pk.y) * pk.tilt;
            if ((sunLeft ? x < div : x > div) && y < pk.y + amp * 1.1) v = lit;
          } else if (isHill && y - ridge[x] < Math.max(1.5, amp * 0.3)) v = lit;
          const snowLine = peak + amp * 0.35;
          if (snowC >= 0 && ridge[x] < snowLine && y < ridge[x] + (snowLine - ridge[x]) * 0.7 + amp * 0.06 * noise.noise1(x * 0.4 + 5)) v = snowC;
          cv.data[y * w + x] = v;
          relief.data[y * w + x] = i + 1;
        }
      }
      // Pines along the nearest hill line.
      if (isHill && i === layers - 1 && s >= 64 && detail >= 2) {
        const pine = cv.ink(withLightness(solid, Math.max(0.2, hexToOklch(solid).l - 0.16)));
        const ph = s * rng.range(0.06, 0.1);
        for (let x = rng.int(2, 8); x < w - 2; x += Math.round(ph * rng.range(0.8, 1.6))) {
          if (rng.chance(0.35)) continue;
          const base = ridge[clamp(Math.round(x), 0, w - 1)] + 1;
          const hh = ph * rng.range(0.8, 1.3);
          cv.polygon([[x, base - hh], [x + hh * 0.38, base + 1], [x - hh * 0.38, base + 1]], pine);
        }
      }
      ctx.check();
    }

    // ---------------------------------------------------------------- water + reflections
    if (water) {
      const wb = mix(skyBottom, nearestHue(keys, 220), 0.45);
      const waterMid = cv.ink(withLightness(wb, clamp(hexToOklch(wb).l - 0.12, 0.3, 0.75)));
      const waterDark = cv.ink(withLightness(wb, clamp(hexToOklch(wb).l - 0.3, 0.2, 0.55)));
      const glint = waterN > 2 ? cv.ink(mix(orbColor, wb, 0.25)) : orb;
      const amp = Math.max(1, s / 64);
      for (let y = horizon; y < h; y++) {
        const depth = (y - horizon) / Math.max(1, h - horizon);
        const wob = Math.round(Math.sin(y * 0.9) * amp * (0.3 + depth));
        for (let x = 0; x < w; x++) {
          const sy = horizon - 1 - Math.floor((y - horizon) * 1.8);
          const sx = clamp(x + wob, 0, w - 1);
          let v = waterMid;
          if (sy >= 0 && relief.data[sy * w + sx]) v = waterDark;
          cv.data[y * w + x] = v;
        }
      }
      // Ripples: short horizontal dashes (≥ 3 cells), fewer near the horizon.
      const gap = Math.max(3, Math.round(s / 18));
      for (let y = horizon + 2; y < h - 1; y += gap) {
        for (let x = rng.int(0, gap * 2); x < w; x += rng.int(gap * 2, gap * 5)) {
          const len = rng.int(3, Math.max(3, Math.round(s / 12)));
          const under = cv.data[y * w + clamp(x, 0, w - 1)];
          cv.rect(x, y, x + len - 1, y, under === waterDark ? waterMid : glint);
        }
      }
      // Glint: a column of light dashes under the sun / moon.
      for (let y = horizon + 1; y < h - 1; y += Math.max(2, Math.round(gap * 0.6))) {
        const spread = orbR * (0.6 + ((y - horizon) / Math.max(1, h - horizon)) * 0.9);
        const len = Math.max(3, Math.round(spread * rng.range(0.6, 1.4)));
        const x0 = Math.round(ox - len / 2 + rng.range(-spread, spread) * 0.4);
        cv.rect(x0, y, x0 + len - 1, y, glint);
      }
    }
    return cv;
  },
};
