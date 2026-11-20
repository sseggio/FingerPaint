/**
 * Large artworks (F33: grids up to 256×256). Two original scenes, difficulty 3:
 * - `sunset-island` (album ocean, free, 192×192);
 * - `star-voyage` (album space, Pro, 256×256).
 * Both are drawn back to front: every paint overwrites what is under it.
 */
import {
  Art,
  above,
  circle,
  ellipse,
  inter,
  path,
  poly,
  rect,
  rgrad,
  rng,
  roundRect,
  star,
  taper,
  union,
  vgrad,
} from './engine.mjs';

/** Mask in a rotated frame: `fn(u, v)` gets continuous coordinates around (cx, cy), v along the axis. */
const rotated = (fn, cx, cy, deg) => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return fn(dx * c + dy * s, -dx * s + dy * c);
  };
};

/** Paint in a rotated frame (same convention as `rotated`). */
const rotatedPaint = (fn, cx, cy, deg) => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return fn(dx * c + dy * s, -dx * s + dy * c);
  };
};

/** Fluffy cloud: a row of overlapping ellipses with a flat-ish bottom. */
function cloudMask(cx, cy, s) {
  return inter(
    union(
      ellipse(cx - 14 * s, cy + 2 * s, 10 * s, 6 * s),
      ellipse(cx - 3 * s, cy - 3 * s, 11 * s, 9 * s),
      ellipse(cx + 9 * s, cy - 1 * s, 10 * s, 7 * s),
      ellipse(cx + 19 * s, cy + 3 * s, 8 * s, 5 * s),
    ),
    (x, y) => y + 0.5 <= cy + 6 * s,
  );
}

/** A palm tree: curved trunk with rings, fronds as tapered arcs, coconuts. */
function palm(a, x0, y0, x1, y1, scale, lean) {
  const mid = [(x0 + x1) / 2 + lean, (y0 + y1) / 2];
  const trunk = [[x0, y0], mid, [x1, y1]];
  a.paint(taper(trunk, [3.2 * scale, 2.6 * scale, 1.9 * scale]), (x, y) => ((y + Math.floor(x / 3)) % 4 === 0 ? 'trD' : 'tr'), {
    outline: 'trD',
  });
  const fronds = [
    [-150, 1], [-120, 0.9], [-75, 0.8], [-40, 0.95], [-10, 1], [-170, 0.85], [25, 0.8], [155, 0.75],
  ];
  for (const [deg, len] of fronds) {
    const r = 26 * scale * len;
    const pts = Array.from({ length: 6 }, (_, i) => {
      const t = i / 5;
      const ang = (deg * Math.PI) / 180;
      // Arc that droops with gravity.
      return [x1 + Math.cos(ang) * r * t, y1 + Math.sin(ang) * r * t + 10 * scale * t * t];
    });
    a.paint(taper(pts, [2.6 * scale, 3.2 * scale, 3 * scale, 2.4 * scale, 1.4 * scale, 0.6 * scale]), (x, y) =>
      (x + y) % 5 === 0 ? 'g1' : 'g2', { outline: 'g1' });
  }
  for (const [dx, dy] of [[-2, 2], [2, 3], [0, 5]]) a.paint(circle(x1 + dx * scale, y1 + dy * scale, 2 * scale), 'trD', { light: { color: 'tr' } });
}

const sunsetIsland = {
  id: 'sunset-island',
  album: 'ocean',
  title: { fr: 'L’île au soleil couchant', en: 'Sunset island' },
  access: 'free',
  difficulty: 3,
  colors: {
    k: '#1E1440',
    s1: '#3A1F6B', s2: '#6B2A8C', s3: '#B0328A', s4: '#E8506E', s5: '#FF8A3D', s6: '#FFC24A',
    su: '#FFE98A', sw: '#FFF8D6',
    cl: '#FFB3C7', cv: '#C77DB5',
    sea1: '#24307A', sea2: '#2E64C0', sea3: '#3DB8FF', fo: '#BDEBFF',
    sand: '#F2C98A', sandD: '#C98E4E',
    g1: '#145A3A', g2: '#2ED3A0', g3: '#9BE36A',
    tr: '#8A5A34', trD: '#4A2A1A',
    sail: '#FFFFFF', hull: '#E01F66',
  },
  draw() {
    const W = 192;
    const H = 192;
    const HZ = 112;
    const a = new Art(W, H);
    const rand = rng(1933);

    // Sky: dithered sunset gradient, a few early stars at the top.
    a.paint(rect(0, 0, W - 1, HZ - 1), vgrad(0, HZ - 1, ['s1', 's2', 's3', 's4', 's5', 's6'], { dither: true }));
    for (let i = 0; i < 55; i++) {
      const x = Math.floor(rand() * W);
      const y = Math.floor(rand() * 34);
      a.set(x, y, rand() < 0.7 ? 'sw' : 'su');
    }
    a.twinkle(28, 12, 'sw', { force: true }).twinkle(160, 20, 'sw', { force: true }).twinkle(118, 7, 'su', { force: true });

    // Sun sinking behind the horizon, with a soft halo.
    a.paint(inter(circle(96, HZ, 44), above(HZ)), 's6', { clip: (x, y) => ['s5', 's4', 's6'].includes(a.get(x, y)) });
    a.paint(inter(circle(96, HZ, 34), above(HZ)), rgrad(96, HZ - 6, 34, ['sw', 'su', 'su', 's6']));
    for (const y of [HZ - 8, HZ - 15, HZ - 21]) a.paint(rect(60, y, 132, y), 's5', { clip: circle(96, HZ, 34) });

    // Clouds lit from below.
    for (const [cx, cy, s] of [[42, 46, 1], [150, 34, 1.2], [104, 70, 0.7], [178, 78, 0.6], [12, 86, 0.55]]) {
      a.paint(cloudMask(cx, cy, s), 'cl', { outline: 'cv', dark: { color: 'cv', dx: 0, dy: 1, depth: 2 }, light: { color: 'sw', dx: 0, dy: 1 } });
    }
    // Birds.
    for (const [bx, by, s] of [[70, 28, 1], [80, 22, 0.8], [88, 31, 0.7], [128, 52, 0.9]]) {
      a.paint(union(path([[bx - 5 * s, by - 2 * s], [bx - 2 * s, by - 1], [bx, by]], 0.6), path([[bx, by], [bx + 2 * s, by - 1], [bx + 5 * s, by - 2 * s]], 0.6)), 'k');
    }

    // Sea: lighter at the horizon, rippled.
    a.paint(rect(0, HZ, W - 1, H - 1), vgrad(HZ, H - 1, ['sea3', 'sea2', 'sea2', 'sea1', 'sea1'], { dither: true }));
    a.paint(
      (x, y) => y > HZ + 2 && y % 3 === 0 && (x + Math.floor(9 * Math.sin(y * 0.9))) % (14 + (y % 7)) < 3 + (y - HZ) / 30,
      (x, y) => (y < HZ + 30 ? 'fo' : 'sea3'),
    );
    // Sun reflection: broken golden bands narrowing towards the viewer.
    a.paint((x, y) => {
      if (y <= HZ || y % 3 === 2) return false;
      const t = (y - HZ) / (H - HZ);
      const hw = 34 * (1 - t) ** 0.8 + 3;
      return Math.abs(x + 0.5 - 96) < hw * (0.55 + 0.45 * Math.sin(y * 1.7));
    }, (x, y) => (Math.abs(x + 0.5 - 96) < 6 + (y - HZ) / 12 ? 'su' : y < HZ + 40 ? 's6' : 's5'));

    // Island: sandy shore, green hill, two palm trees.
    a.paint(inter(ellipse(150, HZ + 9, 46, 11), (x, y) => y < HZ + 14), 'sand', { dark: { color: 'sandD', dx: 0, dy: 1, depth: 2 } });
    a.paint(inter(ellipse(148, HZ + 4, 32, 20), above(HZ + 5)), (x, y) => ((x * 7 + y * 3) % 11 === 0 ? 'g3' : 'g1'), {
      light: { color: 'g2', dx: 1, dy: 1, depth: 2 },
    });
    a.paint(inter(ellipse(122, HZ + 6, 12, 8), above(HZ + 6)), 'g1', { light: { color: 'g3', dx: 1, dy: 1 } });
    for (const [x, y] of [[126, HZ + 10], [176, HZ + 11], [160, HZ + 12]]) a.paint(ellipse(x, y, 3, 1.6), 'sandD');
    palm(a, 156, HZ + 6, 138, HZ - 48, 1, 6);
    palm(a, 170, HZ + 8, 182, HZ - 26, 0.7, -3);
    // Shore foam.
    a.paint(ellipse(150, HZ + 11, 50, 4.5), 'fo', {
      clip: (x, y) => y >= HZ + 11 && ['sea1', 'sea2', 'sea3', 'fo'].includes(a.get(x, y)),
    });

    // Sailboat and its reflection.
    const wl = HZ + 22;
    a.paint(path([[46, wl - 2], [46, wl - 52]], 0.7), 'trD');
    a.paint(poly([[47.5, wl - 50], [47.5, wl - 6], [70, wl - 6]]), 'sail', { outline: 'cv' });
    a.paint(poly([[44.5, wl - 46], [44.5, wl - 6], [27, wl - 6]]), 'cl', { outline: 'cv' });
    a.paint(rect(52, wl - 30, 60, wl - 28), 'hull', { clip: poly([[47.5, wl - 50], [47.5, wl - 6], [70, wl - 6]]) });
    a.paint(poly([[24, wl - 5], [72, wl - 5], [64, wl + 2], [31, wl + 2]]), 'hull', { outline: 'k' });
    a.paint(rect(30, wl - 3, 66, wl - 3), 'sw', { clip: poly([[24, wl - 5], [72, wl - 5], [64, wl + 2], [31, wl + 2]]) });
    a.paint((x, y) => y > wl + 3 && y < wl + 14 && y % 2 === 0 && x > 30 + (y - wl) && x < 66 - (y - wl) / 2, 'hull');
    a.paint(path([[45, wl + 4], [44, wl + 22]], 0.5), 'trD', { clip: (x, y) => y % 2 === 0 });

    // Foreground beach with shells and a starfish.
    const beach = (x, y) => y + 0.5 >= 172 + 6 * Math.sin(x / 17) + 3 * Math.sin(x / 7 + 1);
    a.paint(inter(beach, (x) => x < 120 || x > 150), (x, y) => ((x * 13 + y * 7) % 17 === 0 ? 'sandD' : 'sand'), {
      light: { color: 'fo', dx: 0, dy: 1, depth: 1 },
    });
    a.paint(inter(beach, (x) => x >= 120 && x <= 150), (x, y) => ((x * 13 + y * 7) % 17 === 0 ? 'sandD' : 'sand'), {
      light: { color: 'fo', dx: 0, dy: 1, depth: 1 },
    });
    a.paint(star(30, 182, 7, 3, 5, -80), 'hull', { outline: 'k', light: { color: 'cl' } });
    for (const [x, y] of [[62, 184], [100, 186], [170, 183]]) {
      a.paint(ellipse(x, y, 3.5, 2.5), 'sw', { outline: 'sandD' });
    }
    return a;
  },
};

const starVoyage = {
  id: 'star-voyage',
  album: 'space',
  title: { fr: 'Le grand voyage étoilé', en: 'The great star voyage' },
  access: 'pro',
  difficulty: 3,
  colors: {
    k: '#0B0820', n1: '#171248', n2: '#2A1B6E', n3: '#4B2A8F',
    nb: '#8E3FB8', np: '#E0408F', nl: '#FF9ED2',
    w: '#FFFFFF', st: '#FFE98A', cy: '#6FE3FF',
    pO: '#FF8A3D', pD: '#B0441A', pL: '#FFC88A',
    rg: '#C9B8FF', rD: '#7B5CFF',
    mo: '#B4B0C8', mD: '#6E6A85',
    rr: '#E01F66', fl: '#FFC93C',
    g1: '#0E6B5E', g2: '#2ED3A0', g3: '#A8F5D6', dome: '#3DA0FF',
  },
  draw() {
    const W = 256;
    const H = 256;
    const a = new Art(W, H);
    const rand = rng(256);
    const isSky = (x, y) => ['k', 'n1', 'n2', 'n3', null].includes(a.get(x, y));

    // Deep space gradient.
    a.paint(rect(0, 0, W - 1, H - 1), vgrad(0, H - 1, ['k', 'n1', 'n1', 'n2', 'n3'], { dither: true }));
    // Nebula: a wavy diagonal band in three intensities.
    a.paint((x, y) => {
      const d = (x - y * 0.9 - 10) / 70;
      const n = Math.sin(x * 0.045 + y * 0.03) + 0.6 * Math.sin(x * 0.11 - y * 0.07 + 1) + 0.35 * Math.sin((x + y) * 0.21);
      return n - 2.2 * d * d > -0.2;
    }, (x, y) => {
      const d = (x - y * 0.9 - 10) / 70;
      const n = Math.sin(x * 0.045 + y * 0.03) + 0.6 * Math.sin(x * 0.11 - y * 0.07 + 1) + 0.35 * Math.sin((x + y) * 0.21) - 2.2 * d * d;
      if (n > 1.05) return (x + y) % 2 === 0 ? 'nl' : 'np';
      if (n > 0.7) return 'np';
      if (n > 0.3) return (x + y) % 2 === 0 ? 'np' : 'nb';
      if (n > 0.05) return 'nb';
      return (x + y) % 2 === 0 ? 'nb' : 'n3';
    });
    // Stars, some twinkling.
    for (let i = 0; i < 520; i++) {
      const x = Math.floor(rand() * W);
      const y = Math.floor(rand() * 220);
      const r = rand();
      a.set(x, y, r < 0.6 ? 'w' : r < 0.82 ? 'st' : 'cy');
    }
    for (const [x, y, c, s] of [[22, 100, 'w', 2], [120, 24, 'st', 2], [240, 150, 'cy', 1], [150, 130, 'w', 1], [90, 60, 'st', 1], [210, 200, 'w', 2], [12, 170, 'cy', 1]]) {
      a.twinkle(x, y, c, { force: true, size: s });
    }

    // Ringed planet: back half of the ring, the sphere, then the front half.
    const PX = 186;
    const PY = 66;
    const PR = 38;
    const ring = (front) =>
      rotated((u, v) => {
        const outer = (u / 74) ** 2 + (v / 17) ** 2 <= 1;
        const inner = (u / 52) ** 2 + (v / 10) ** 2 <= 1;
        return outer && !inner && (front ? v >= 0 : v < 0);
      }, PX, PY, -18);
    const ringPaint = rotatedPaint((u, v) => {
      const r = Math.hypot(u / 74, v / 17);
      return r > 0.93 ? 'rD' : r > 0.84 ? 'rg' : r > 0.78 ? 'rD' : 'rg';
    }, PX, PY, -18);
    a.paint(ring(false), ringPaint);
    a.paint(circle(PX, PY, PR), (x, y) => {
      const nx = (x + 0.5 - PX) / PR;
      const ny = (y + 0.5 - PY) / PR;
      const shade = -0.55 * nx - 0.65 * ny + 0.55 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const band = Math.floor((y - PY + 40 + 3 * Math.sin(x * 0.15)) / 7) % 3;
      if (shade < 0.12) return 'pD';
      if (shade > 0.75) return band === 1 ? 'pO' : 'pL';
      return band === 0 ? 'pD' : 'pO';
    }, { outline: 'k' });
    a.paint(ring(true), ringPaint);
    // A little moon of the planet.
    a.paint(circle(124, 96, 6), (x, y) => (x + y < 124 + 96 - 2 ? 'pL' : 'pO'), { outline: 'pD' });

    // Cratered moon.
    a.paint(circle(48, 46, 24), rgrad(41, 39, 34, ['w', 'mo', 'mo', 'mD']), { outline: 'k' });
    for (const [cx, cy, r] of [[40, 40, 5], [56, 54, 7], [36, 58, 3.5], [58, 34, 3], [46, 28, 2.5]]) {
      a.paint(circle(cx, cy, r), 'mD', { clip: circle(48, 46, 23), light: { color: 'w', dx: -1, dy: -1 } });
    }

    // Comet with a long tail towards the upper left.
    a.paint(taper([[64, 170], [36, 152], [6, 138]], [3.2, 6, 9]), (x, y) => ((x + y) % 2 === 0 ? 'cy' : 'nb'), { clip: isSky });
    a.paint(taper([[64, 170], [40, 156], [14, 144]], [2, 3.5, 4]), (x, y) => ((x + 2 * y) % 3 === 0 ? 'w' : 'cy'), { clip: (x, y) => isSky(x, y) || ['cy', 'nb'].includes(a.get(x, y)) });
    a.paint(circle(66, 171, 5), 'w', { outline: 'cy' });

    // Rocket flying up and to the right, flame first (behind the body).
    const RX = 128;
    const RY = 150;
    const RA = 38;
    a.paint(rotated((u, v) => v > 22 && v < 68 && Math.abs(u) < 9 * (1 - (v - 22) / 50) + 1.5 * Math.sin(v * 0.6), RX, RY, RA),
      rotatedPaint((u, v) => (v < 36 && Math.abs(u) < 4 ? 'w' : v < 44 ? 'fl' : v < 56 ? 'pO' : 'np'), RX, RY, RA));
    const body = (u, v) => {
      if (v < -38 || v > 26) return false;
      const half = v < 0 ? 13 * Math.sqrt(1 - (v / 38) ** 2) : 13 - v * 0.12;
      return Math.abs(u) <= half;
    };
    a.paint(rotated((u, v) => v > 6 && v < 30 && Math.abs(u) < 24 - (30 - v) * 0.5 && Math.abs(u) > 8, RX, RY, RA), 'rr', { outline: 'k' });
    a.paint(rotated(body, RX, RY, RA), rotatedPaint((u, v) => (v < -24 ? 'rr' : v > 12 && v < 17 ? 'rr' : u > 6 ? 'mo' : 'w'), RX, RY, RA), { outline: 'k' });
    a.paint(rotated((u, v) => Math.hypot(u, v + 8) <= 7.5, RX, RY, RA), 'rD');
    a.paint(rotated((u, v) => Math.hypot(u, v + 8) <= 5.5, RX, RY, RA), rotatedPaint((u, v) => (Math.hypot(u + 2, v + 10) < 2.2 ? 'w' : 'dome'), RX, RY, RA));
    a.paint(rotated((u, v) => v > 18 && v < 30 && Math.abs(u) < 2.5, RX, RY, RA), 'rr', { outline: 'k' });

    // Foreground planet: banded mint world with craters, an observatory and a flag.
    const ground = circle(128, 480, 262);
    a.paint(ground, (x, y) => {
      const d = Math.hypot(x + 0.5 - 128, y + 0.5 - 480);
      return d > 258 ? 'g3' : d > 248 ? 'g2' : (x + Math.floor(y / 2)) % 9 === 0 ? 'g2' : 'g1';
    });
    for (const [cx, cy, rx, ry] of [[60, 236, 12, 4], [150, 246, 16, 5], [220, 238, 9, 3], [100, 252, 10, 3], [30, 250, 7, 2.5]]) {
      a.paint(ellipse(cx, cy, rx, ry), 'k', { clip: ground, outline: 'g3' });
      a.paint(ellipse(cx + 1, cy + 1, rx - 3, ry - 1.5), 'g1', { clip: ground });
    }
    // Observatory.
    a.paint(rect(180, 214, 214, 226), 'mo', { outline: 'k', dark: { color: 'mD', dx: 1, dy: 0, depth: 3 } });
    a.paint(inter(circle(197, 214, 15), above(214)), (x, y) => (x + y < 197 + 214 - 14 ? 'w' : 'dome'), { outline: 'k' });
    a.paint(path([[199, 205], [214, 190]], 2.2), 'mD', { outline: 'k' });
    a.paint(rect(193, 219, 199, 226), 'st', { outline: 'k' });
    for (const x of [184, 205]) a.paint(rect(x, 218, x + 3, 221), 'cy', { outline: 'k' });
    // Flag and a waving astronaut.
    const fx = 34;
    const ax = 52;
    a.paint(path([[fx, 226], [fx, 194]], 0.6), 'w');
    a.paint(poly([[fx + 1, 194], [fx + 18, 198], [fx + 1, 204]]), 'rr', { outline: 'k' });
    a.paint(star(fx + 7, 199, 2.6, 1.1), 'st');
    a.paint(roundRect(ax - 5, 212, ax + 5, 226, 3), 'w', { outline: 'k', dark: { color: 'mo', depth: 1 } });
    a.paint(circle(ax, 207, 6), 'w', { outline: 'k' });
    a.paint(ellipse(ax + 1, 207, 4, 3), 'dome');
    a.set(ax - 1, 206, 'w');
    a.paint(path([[ax + 5, 215], [ax + 10, 208]], 1.2), 'w', { outline: 'k' });
    a.paint(rect(ax - 3, 216, ax, 219), 'cy');
    a.paint(rect(ax - 5, 227, ax - 2, 230), 'mo', { outline: 'k' });
    a.paint(rect(ax + 2, 227, ax + 5, 230), 'mo', { outline: 'k' });

    // Shooting stars.
    for (const [x0, y0, x1, y1] of [[150, 150, 176, 138], [20, 200, 34, 194]]) {
      a.paint(taper([[x0, y0], [x1, y1]], [0.4, 1.1]), 'st', { clip: isSky });
      a.set(Math.round(x1), Math.round(y1), 'w');
    }
    return a;
  },
};

export const GRAND = [sunsetIsland, starVoyage];
