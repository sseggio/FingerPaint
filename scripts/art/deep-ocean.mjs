/** Album "Océan profond" (deep-ocean, pack `ocean`): 8 artworks. */
import {
  Art,
  circle,
  diff,
  ellipse,
  inter,
  line,
  path,
  poly,
  rect,
  rgrad,
  rng,
  rotEllipse,
  roundRect,
  sphere,
  sym,
  taper,
  union,
  vgrad,
} from './engine.mjs';

const album = 'deep-ocean';
const access = { pack: 'ocean' };

/** Deep-water backdrop colors shared by the pack (each artwork picks what it uses). */
const DEEP = { d1: '#0B1745', d2: '#15287A', d3: '#22409E' };

function particles(a, seed, count, colors, mask = () => true) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * a.w);
    const y = Math.floor(rand() * a.h);
    if (a.get(x, y) === null && mask(x, y)) a.set(x, y, colors[i % colors.length]);
  }
}

function bubbles(a, list, c) {
  for (const [x, y, r] of list) {
    if (r <= 1) a.set(x, y, c);
    else a.paint(diff(circle(x, y, r), circle(x - 0.4, y - 0.4, r - 1)), c, { clip: (px, py) => a.get(px, py) === null });
  }
}

const jellyfish = {
  id: 'jellyfish',
  album,
  title: { fr: 'Méduse lumineuse', en: 'Glowing jellyfish' },
  access,
  difficulty: 1,
  colors: { ...DEEP, jD: '#8E2A9E', jM: '#E85FD8', jL: '#FFB8F4', k: '#120A1E', cy: '#6FF0FF', pk: '#FF7FB0' },
  draw() {
    const W = 24;
    const a = new Art(W, 32);
    for (const [x0, ph] of [[7, 0], [10.5, 2], [13.5, 1], [17, 3]]) {
      const pts = Array.from({ length: 8 }, (_, i) => [x0 + 1.4 * Math.sin(i * 0.9 + ph), 13 + i * 2.4]);
      a.paint(path(pts, 0.55), i0(x0) ? 'jM' : 'jL');
    }
    const bell = union(inter(ellipse(12, 10.5, 9.5, 8.5), (x, y) => y < 11), ...[4, 8, 12, 16, 20].map((x) => circle(x, 11, 2.1)));
    a.paint(bell, 'jM', { outline: 'jD', light: { color: 'jL', depth: 2 } });
    a.paint(sym(rect(8, 7, 8, 8), W), 'k');
    a.paint(sym(rect(6, 9, 7, 9), W), 'pk');
    a.set(11, 10, 'k').set(12, 10, 'k');
    particles(a, 4, 18, ['cy', 'jL']);
    a.background(vgrad(0, 31, ['d3', 'd2', 'd1']));
    return a;
  },
};

function i0(x) {
  return Math.round(x) % 2 === 1;
}

const anglerfish = {
  id: 'anglerfish',
  album,
  title: { fr: 'Baudroie et sa lanterne', en: 'Anglerfish and its lantern' },
  access,
  difficulty: 2,
  colors: {
    ...DEEP, fD: '#43204F', fM: '#82509E', fL: '#B890DD', k: '#120A1E', w: '#FFFFFF',
    yl: '#FFE14D', gl: '#FFF6B8', g2: '#3F6FD8', pk: '#FF6F9C', cy: '#6FF0FF',
  },
  draw() {
    const a = new Art(32, 32);
    // Glow around the lure.
    a.paint(circle(26, 9, 4.5), 'g2');
    a.paint(path([[13, 10], [16, 4.5], [22, 4], [25.5, 7.5]], 0.5), 'fL');
    a.paint(poly([[3, 14], [0.5, 9.5], [0.5, 24], [3, 20]]), 'fM', { outline: 'fD' });
    a.paint(poly([[12, 10], [16, 7], [18, 10.5]]), 'fM', { outline: 'fD' });
    const body = ellipse(14.5, 18, 11.5, 9);
    a.paint(body, sphere(14.5, 18, 11.5, 9, ['fD', 'fM', 'fL'], { cuts: [0.25, 0.85] }), { outline: 'fD' });
    const mouth = rotEllipse(23, 21, 5.5, 3.2, -10);
    a.paint(inter(body, mouth), 'k');
    for (const x of [19, 21, 23, 25]) {
      if (mouth(x, 18)) a.set(x, 18, 'w');
      else if (mouth(x, 19)) a.set(x, 19, 'w');
    }
    for (const x of [20, 22, 24]) for (const y of [24, 23]) if (mouth(x, y) && !mouth(x, y + 1)) a.set(x, y, 'w');
    a.paint(circle(19, 13.5, 2.4), 'w', { outline: 'fD' });
    a.paint(rect(19, 13, 20, 14), 'k');
    a.set(15, 16, 'pk');
    a.paint(rotEllipse(10, 21, 3.2, 1.6, 30), 'fL', { outline: 'fD' });
    a.paint(circle(26, 9, 2.2), 'yl');
    a.set(25, 8, 'gl').set(26, 8, 'gl');
    particles(a, 9, 16, ['cy', 'g2']);
    a.background(rgrad(26, 9, 30, ['d3', 'd2', 'd1']));
    return a;
  },
};

const seahorse = {
  id: 'seahorse',
  album,
  title: { fr: 'Hippocampe', en: 'Seahorse' },
  access,
  difficulty: 2,
  colors: {
    ...DEEP, hD: '#A3360A', hM: '#FF8A1C', hL: '#FFC85C', k: '#120A1E', w: '#FFFFFF',
    sD: '#0E6B5E', sM: '#22B89A', pk: '#FF6F9C', cy: '#6FF0FF',
  },
  draw() {
    const a = new Art(24, 32);
    // Seaweed.
    for (const [x0, ph, h] of [[3, 0, 16], [20, 2, 12]]) {
      const pts = Array.from({ length: 7 }, (_, i) => [x0 + 1.5 * Math.sin(i * 1.1 + ph), 31.5 - (i * h) / 6]);
      a.paint(taper(pts, [1.6, 1.5, 1.3, 1.1, 0.9, 0.7, 0.5]), 'sM', { outline: 'sD' });
    }
    // Dorsal fin.
    a.paint(rotEllipse(16.5, 15, 1.8, 3.6, -15), 'hL', { outline: 'hD' });
    const body = taper(
      [[12, 7], [13.5, 11], [13.2, 16], [11.5, 20.5], [11.5, 24.5], [14, 27.5], [16.5, 26], [15.5, 23.5], [14, 24]],
      [3.2, 3.8, 3.8, 3.1, 2.3, 1.7, 1.3, 1, 0.8],
    );
    a.paint(body, 'hM', { outline: 'hD', light: { color: 'hL' } });
    a.paint(inter(body, (x, y) => y > 10 && y < 21 && y % 2 === 0 && x <= 11), 'hL');
    // Head, crest, snout.
    a.paint(path([[10, 6], [4.5, 7.5]], 1.2), 'hM', { outline: 'hD' });
    a.paint(ellipse(11.5, 5.5, 3.8, 3.4), 'hM', { outline: 'hD', light: { color: 'hL' } });
    for (const [x, y] of [[11, 1], [13, 1], [14, 2]]) a.set(x, y, 'hD');
    a.paint(circle(12, 5, 1.2), 'k');
    a.set(11, 4, 'w');
    a.set(10, 8, 'pk');
    bubbles(a, [[5, 3, 1.6], [7, 11, 1], [19, 6, 1], [20, 3, 1]], 'cy');
    a.background(vgrad(0, 31, ['d3', 'd2', 'd1']));
    return a;
  },
};

const submarine = {
  id: 'submarine',
  album,
  title: { fr: "Sous-marin d'exploration", en: 'Explorer submarine' },
  access,
  difficulty: 2,
  colors: {
    ...DEEP, oD: '#A3360A', oM: '#FF6B3D', oL: '#FFA27A', k: '#120A1E', gO: '#5E5A86', gM: '#A6A2C8',
    cy: '#6FF0FF', cL: '#D2FBFF', bm: '#2A4FA0', yl: '#FFE14D', pk: '#FF5FA2',
  },
  draw() {
    const a = new Art(40, 32);
    // Headlight beam.
    a.paint(poly([[34, 18], [40, 12], [40, 27]]), 'bm');
    // Propeller.
    a.paint(rect(3, 16, 5, 18), 'gO');
    a.paint(rotEllipse(2, 13.5, 1.2, 3, -10), 'gM', { outline: 'gO' });
    a.paint(rotEllipse(2, 21, 1.2, 3, 10), 'gM', { outline: 'gO' });
    // Periscope and tower.
    a.paint(path([[21, 9], [21, 4], [25, 4]], 0.7), 'gM');
    a.paint(roundRect(14, 7, 24, 13, 2), 'oM', { outline: 'oD', light: { color: 'oL' } });
    const hull = union(ellipse(19.5, 17.5, 14.5, 7), roundRect(5, 13, 10, 22, 2));
    a.paint(hull, sphere(19.5, 17.5, 14.5, 7, ['oD', 'oM', 'oL'], { cuts: [0.2, 0.86] }), { outline: 'oD' });
    for (const x of [14, 20, 26]) {
      a.paint(circle(x + 0.5, 17, 2.4), 'cy', { outline: 'gO' });
      a.set(x - 1, 16, 'cL');
    }
    a.paint(rect(6, 21, 32, 21), 'oD');
    a.paint(circle(34, 18, 1.4), 'yl');
    // Small fish and bubbles.
    a.paint(ellipse(33, 26, 2.2, 1.3), 'pk');
    a.paint(poly([[30.5, 26], [29, 24.5], [29, 27.5]]), 'pk');
    a.set(34, 26, 'k');
    bubbles(a, [[8, 8, 1.6], [11, 4, 1], [6, 3, 1.2], [27, 8, 1]], 'cy');
    particles(a, 21, 14, ['cy']);
    a.background(vgrad(0, 31, ['d3', 'd2', 'd1']));
    return a;
  },
};

const manta = {
  id: 'manta-ray',
  album,
  title: { fr: 'Raie manta', en: 'Manta ray' },
  access,
  difficulty: 2,
  colors: {
    ...DEEP, mM: '#7A5CE0', mL: '#B9A6FF', w: '#FFFFFF', k: '#120A1E',
    cy: '#6FF0FF', yl: '#FFE14D',
  },
  draw() {
    const W = 48;
    const a = new Art(W, 32);
    a.paint(path([[24, 22], [24.5, 27], [26, 31.5]], 0.5), 'k');
    const wings = sym(poly([[24, 6.5], [15, 8.5], [6, 12], [1, 17], [8, 19.5], [17, 22], [24, 24]]), W);
    a.paint(wings, 'mM', { outline: 'k', light: { color: 'mL' } });
    a.paint(inter(wings, sym(ellipse(18.5, 13, 3, 1.4), W)), 'w');
    a.paint(ellipse(24, 15.5, 5, 7.5), 'mM', { outline: 'k', light: { color: 'mL' } });
    a.paint(sym(poly([[20, 9.5], [21.5, 5.5], [22.5, 9]]), W), 'mM', { outline: 'k' });
    a.paint(sym(rect(20, 11, 20, 12), W), 'k');
    for (const [x, y] of [[23, 15], [25, 17], [23, 19]]) a.set(x, y, 'mL');
    particles(a, 5, 22, ['cy', 'yl', 'cy']);
    a.background(vgrad(0, 31, ['d3', 'd2', 'd1']));
    return a;
  },
};

const whale = {
  id: 'blue-whale',
  album,
  title: { fr: 'La grande baleine', en: 'The great whale' },
  access,
  difficulty: 2,
  colors: {
    ...DEEP, bM: '#4F86E8', bL: '#9CC4FF', be: '#DCE8FF', k: '#120A1E', w: '#FFFFFF',
    cy: '#6FF0FF', yl: '#FFD23F', or: '#FF9A3D',
  },
  draw() {
    const a = new Art(64, 40);
    // Tail fluke.
    a.paint(union(rotEllipse(5.5, 12.5, 5.5, 2.2, -60), rotEllipse(6, 26, 5.5, 2.2, 55)), 'bM', { outline: 'k' });
    const spine = [[9, 19.5], [16, 20], [28, 20.5], [42, 19.5], [53, 19.5], [60.5, 21.5]];
    const body = taper(spine, [2, 4.5, 9, 10.5, 9.5, 5.5]);
    a.paint(body, (x, y) => (y > 21 + (x > 20 ? 0.05 * (x - 20) : 0) ? 'be' : 'bM'), {
      outline: 'k',
      light: { color: 'bL', dx: 0, dy: 1, depth: 2 },
    });
    a.paint(inter(body, (x, y) => y > 24 && x > 32 && x < 58 && y % 2 === 1), 'bL');
    a.paint(inter(body, (x, y) => y < 18 && (x * 7 + y * 13) % 23 === 0), 'd3');
    a.paint(rotEllipse(36, 29, 6, 2, 35), 'bM', { outline: 'k' });
    a.paint(path([[47, 24], [53, 25], [59.5, 23]], 0.45), 'k');
    a.paint(circle(51, 20, 1.2), 'k');
    a.set(51, 19, 'w');
    a.paint(poly([[25, 11.5], [29, 7.5], [31, 11]]), 'bM', { outline: 'k' });
    // School of small fish.
    for (const [x, y, c] of [[44, 34, 'yl'], [49, 36, 'or'], [54, 33, 'yl'], [40, 37, 'or'], [58, 37, 'yl']]) {
      a.paint(ellipse(x, y, 1.8, 1.1), c);
      a.set(x - 2, y - 1, c).set(x - 2, y + 0, c);
    }
    particles(a, 13, 30, ['cy', 'be']);
    a.background(vgrad(0, 39, ['d3', 'd2', 'd1']));
    return a;
  },
};

const squid = {
  id: 'giant-squid',
  album,
  title: { fr: 'Calmar géant', en: 'Giant squid' },
  access,
  difficulty: 3,
  colors: {
    ...DEEP, sD: '#7A0F3A', sM: '#E0305E', sL: '#FF8AA8', sp: '#FFC2D2', k: '#120A1E', w: '#FFFFFF',
    yl: '#FFE14D', cy: '#6FF0FF', vi: '#8E6BFF',
  },
  draw() {
    const W = 48;
    const a = new Art(W, 48);
    // Arms (behind) then the two long tentacles.
    const arms = [];
    for (let i = 0; i < 4; i++) {
      const x0 = 18.5 + i * 1.8;
      const dir = -1 + i * 0.35;
      const pts = Array.from({ length: 7 }, (_, k) => [x0 + dir * k * 2 + 1.6 * Math.sin(k * 0.9 + i), 26 + k * 2.6]);
      arms.push(taper(pts, [2, 1.8, 1.6, 1.3, 1.1, 0.9, 0.7]));
    }
    for (const arm of arms) a.paint(sym(arm, W), 'sM', { outline: 'sD' });
    a.paint(sym(taper([[21, 28], [14, 36], [8, 40], [4, 37], [6, 34]], [1.2, 1, 1, 1.6, 1.2]), W), 'sM', { outline: 'sD' });
    // Suckers.
    for (let y = 30; y < 46; y += 3) for (let x = 14; x < 34; x += 3) if (a.get(x, y) === 'sM') a.set(x, y, 'sp');
    // Mantle with fins.
    a.paint(sym(poly([[24, 1], [15, 7], [19.5, 10]]), W), 'sM', { outline: 'sD', light: { color: 'sL' } });
    const mantle = taper([[24, 3], [24, 12], [24, 22], [24, 27]], [2.5, 7, 7.5, 6.5]);
    a.paint(mantle, sphere(24, 15, 7.5, 13, ['sD', 'sM', 'sL'], { cuts: [0.25, 0.85] }), { outline: 'sD' });
    for (const [x, y] of [[22, 10], [26, 13], [21, 17], [27, 19], [24, 7]]) a.set(x, y, 'sp');
    a.paint(sym(circle(20.5, 24, 2.6), W), 'w', { outline: 'sD' });
    a.paint(sym(rect(20, 24, 21, 25), W), 'k');
    a.set(20, 23, 'w').set(26, 23, 'w');
    particles(a, 33, 40, ['cy', 'vi', 'yl']);
    a.background(rgrad(24, 18, 34, ['d3', 'd2', 'd1']));
    return a;
  },
};

function coralBranch(a, rand, x, y, len, ang, r, color, out, depth) {
  const x1 = x + Math.cos(ang) * len;
  const y1 = y + Math.sin(ang) * len;
  a.paint(line(x, y, x1, y1, r), color, { outline: out });
  if (depth <= 0) {
    a.paint(circle(x1, y1, r + 0.4), color, { outline: out });
    return;
  }
  const spread = 0.45 + rand() * 0.3;
  coralBranch(a, rand, x1, y1, len * 0.72, ang - spread, Math.max(0.9, r * 0.8), color, out, depth - 1);
  coralBranch(a, rand, x1, y1, len * 0.72, ang + spread, Math.max(0.9, r * 0.8), color, out, depth - 1);
}

const abyssReef = {
  id: 'abyss-reef',
  album,
  title: { fr: 'Le récif des abysses', en: 'The abyssal reef' },
  access,
  difficulty: 3,
  colors: {
    ...DEEP, l1: '#3060D0',
    sa: '#5A4A8A', sD: '#3A2C66',
    cD: '#9E1B5E', cM: '#FF4F9A', oD: '#B8500E', oM: '#FF9A3D', vD: '#4A2FA0', vM: '#9B7BFF',
    gD: '#0E6B5E', gM: '#22C49A', yl: '#FFE14D', cy: '#6FF0FF', cL: '#D2FBFF',
    jM: '#E85FD8', jL: '#FFB8F4', w: '#FFFFFF', k: '#120A1E', bG: '#C9A0FF',
  },
  draw() {
    const W = 96;
    const a = new Art(W, 96);
    const rand = rng(42);
    const floor = (x, y) => y + 0.5 >= 82 + 3 * Math.sin(x / 11) + 1.5 * Math.sin(x / 4);
    // Coral forest.
    coralBranch(a, rand, 14, 86, 11, -Math.PI / 2 - 0.15, 2.2, 'cM', 'cD', 3);
    coralBranch(a, rand, 78, 86, 12, -Math.PI / 2 + 0.1, 2.3, 'vM', 'vD', 3);
    coralBranch(a, rand, 50, 88, 8, -Math.PI / 2, 1.8, 'oM', 'oD', 3);
    // Tube sponges.
    for (const [x, h] of [[30, 16], [34, 22], [38, 13]]) {
      a.paint(roundRect(x - 1, 86 - h, x + 2, 88, 1), 'oM', { outline: 'oD' });
      a.paint(rect(x, 86 - h + 1, x + 1, 86 - h + 2), 'oD');
    }
    // Brain coral and anemones.
    a.paint(inter(ellipse(64, 86, 8, 6), (x, y) => y < 87), (x, y) => ((x + y * 2) % 5 === 0 ? 'gD' : 'gM'), { outline: 'gD' });
    for (const x0 of [24, 88, 6]) {
      for (let k = -3; k <= 3; k++) a.paint(path([[x0, 87], [x0 + k * 1.2, 80], [x0 + k * 1.8 + Math.sin(k) , 76]], 0.55), 'jM');
      a.paint(inter(ellipse(x0, 88, 3.5, 3), (x, y) => y < 88), 'jL', { outline: 'jM' });
    }
    // Sea floor.
    a.paint(floor, (x, y) => (y > 90 ? 'sD' : 'sa'), { clip: (x, y) => a.get(x, y) === null });
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(rand() * W);
      const y = 85 + Math.floor(rand() * 11);
      if (a.get(x, y) === 'sa' || a.get(x, y) === 'sD') a.set(x, y, 'vD');
    }
    // Seaweed.
    for (const [x0, ph, h] of [[42, 0, 30], [44, 1.6, 22], [92, 0.7, 34], [58, 2.5, 18]]) {
      const pts = Array.from({ length: 9 }, (_, i) => [x0 + 2 * Math.sin(i * 0.9 + ph), 90 - (i * h) / 8]);
      a.paint(taper(pts, [1.8, 1.7, 1.6, 1.4, 1.2, 1, 0.9, 0.7, 0.5]), 'gM', { outline: 'gD', clip: (x, y) => a.get(x, y) === null || a.get(x, y) === 'sa' });
    }
    // Two jellyfish.
    for (const [cx, cy, s] of [[24, 30, 1], [70, 18, 0.75]]) {
      for (let k = -2; k <= 2; k++) {
        const pts = Array.from({ length: 7 }, (_, i) => [cx + k * 2 * s + 1.2 * Math.sin(i + k), cy + 2 + i * 2.6 * s]);
        a.paint(path(pts, 0.5), k % 2 ? 'jL' : 'jM', { clip: (x, y) => a.get(x, y) === null });
      }
      const bell = inter(ellipse(cx, cy + 1, 7 * s, 6.5 * s), (x, y) => y < cy + 2);
      a.paint(bell, 'jM', { outline: 'cD', light: { color: 'jL', depth: 2 } });
    }
    // Little anglerfish with its lantern.
    a.paint(path([[56, 46], [58, 40], [63, 39.5]], 0.5), 'vM');
    a.paint(circle(63.5, 39.5, 3.4), 'l1', { clip: (x, y) => a.get(x, y) === null });
    a.paint(circle(63.5, 39.5, 1.6), 'yl');
    a.paint(poly([[46, 50], [43, 46], [43, 55]]), 'vM', { outline: 'vD' });
    a.paint(ellipse(54, 50, 8, 6), 'vM', { outline: 'vD', light: { color: 'bG' } });
    a.paint(inter(ellipse(54, 50, 8, 6), rotEllipse(60, 52, 3.4, 2, -10)), 'k');
    a.set(58, 50, 'w').set(60, 50, 'w').set(59, 54, 'w');
    a.paint(circle(56.5, 47.5, 1.5), 'w', { outline: 'vD' });
    a.set(57, 47, 'k');
    // Bubbles and glowing plankton.
    bubbles(a, [[84, 60, 2], [87, 52, 1.5], [83, 46, 1.2], [12, 58, 1.6], [15, 50, 1]], 'cy');
    particles(a, 77, 70, ['cy', 'cL', 'yl', 'bG'], (x, y) => y < 80);
    // Light rays and depth gradient.
    for (const x0 of [14, 46, 76]) {
      a.paint(poly([[x0, 0], [x0 + 9, 0], [x0 + 2, 60], [x0 - 10, 60]]), 'l1', { clip: (x, y) => a.get(x, y) === null && y < 32 });
    }
    a.background(vgrad(0, 95, ['d3', 'd2', 'd1']));
    return a;
  },
};

export const DEEP_OCEAN = [jellyfish, anglerfish, seahorse, submarine, manta, whale, squid, abyssReef];
