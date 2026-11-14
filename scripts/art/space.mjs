/** Album "Espace" (space): 7 new artworks (+ the little rocket starter). */
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
  star,
  sym,
  taper,
  union,
  vgrad,
} from './engine.mjs';

const album = 'space';

function sprinkleStars(a, seed, count, colors, mask = () => true) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * a.w);
    const y = Math.floor(rand() * a.h);
    if (a.get(x, y) === null && mask(x, y)) a.set(x, y, colors[i % colors.length]);
  }
}

const moon = {
  id: 'sleepy-moon',
  album,
  title: { fr: 'Lune endormie', en: 'Sleepy moon' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', yD: '#D98A00', yM: '#FFD23F', yL: '#FFF0A0', pk: '#FF9AB0', sk: '#8FD8FF',
  },
  draw() {
    const a = new Art(24, 24);
    const crescent = diff(circle(11, 12, 10), circle(16.5, 9.5, 8.2));
    a.paint(crescent, 'yM', { outline: 'yD', light: { color: 'yL' } });
    for (const [x, y] of [[5, 15], [6, 10], [9, 19]]) if (a.get(x, y) === 'yM') a.set(x, y, 'yD');
    a.paint(path([[6.5, 12.6], [7.5, 13.4], [8.5, 12.6]], 0.42), 'k');
    a.set(9, 15, 'pk');
    a.paint(path([[7.5, 16.5], [9, 17.2], [10, 16.5]], 0.4), 'k');
    a.paint(star(17.5, 10.5, 3.6, 1.6), 'yM', { outline: 'yD' });
    for (const [x, y] of [[20, 3], [22, 7], [15, 21], [21, 21]]) a.set(x, y, 'sk');
    return a;
  },
};

const alien = {
  id: 'friendly-alien',
  album,
  title: { fr: 'Petit extraterrestre', en: 'Friendly alien' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', gD: '#1E7A3C', gM: '#5BE36A', gL: '#C2F7A0', w: '#FFFFFF',
    vD: '#4B2385', vM: '#9B6BFF', pk: '#FF7FB0', yl: '#FFD23F',
  },
  draw() {
    const W = 24;
    const a = new Art(W, 24);
    a.paint(sym(path([[8.5, 5], [6.5, 2.5]], 0.5), W), 'gD');
    a.paint(sym(circle(6, 2, 1.6), W), 'yl', { outline: 'vD' });
    a.paint(roundRect(7, 15, 16, 22, 3), 'vM', { outline: 'vD' });
    a.paint(sym(roundRect(7, 21, 9, 23, 1), W), 'gM', { outline: 'gD' });
    a.paint(sym(rotEllipse(5.5, 17.5, 1.5, 3, -30), W), 'gM', { outline: 'gD' });
    a.paint(ellipse(12, 10, 8.6, 7), 'gM', { outline: 'gD', light: { color: 'gL' } });
    a.paint(sym(ellipse(8.8, 9.5, 2.2, 2.8), W), 'k');
    a.set(8, 8, 'w').set(14, 8, 'w');
    a.set(5, 12, 'pk').set(18, 12, 'pk');
    a.paint(path([[10, 13], [12, 14], [14, 13]], 0.42), 'k');
    a.paint(star(12, 18.5, 2.2, 1), 'yl');
    return a;
  },
};

const ufo = {
  id: 'flying-saucer',
  album,
  title: { fr: 'Soucoupe volante', en: 'Flying saucer' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', sD: '#4A3F8A', sM: '#8E86C8', sL: '#C9C4F0', cy: '#7FE7FF', cL: '#D6F8FF',
    gM: '#5BE36A', yl: '#FFD23F', yP: '#FFF3B0', pk: '#FF5FA2',
  },
  draw() {
    const W = 32;
    const a = new Art(W, 24);
    a.paint(poly([[11, 13], [21, 13], [27, 23.5], [5, 23.5]]), (x, y) => (y % 3 === 0 ? 'yl' : 'yP'));
    a.paint(ellipse(16, 8.5, 7, 6.5), 'cy', { outline: 'sD', light: { color: 'cL', depth: 2 }, clip: (x, y) => y < 10 });
    a.paint(circle(16, 7.5, 2.6), 'gM', { clip: (x, y) => y < 10 });
    a.set(15, 7, 'k').set(17, 7, 'k');
    a.paint(path([[16, 5], [16, 3.5]], 0.4), 'gM');
    a.paint(ellipse(16, 12, 15.5, 4.2), 'sM', { outline: 'sD', light: { color: 'sL' } });
    for (const x of [5, 10, 15, 20, 25]) a.paint(rect(x + 1, 12, x + 2, 13), x % 2 ? 'pk' : 'yl');
    return a;
  },
};

const comet = {
  id: 'comet',
  album,
  title: { fr: 'Comète filante', en: 'Shooting comet' },
  difficulty: 1,
  colors: {
    n1: '#1E1A4A', n2: '#2E2A6E', w: '#FFFFFF', yl: '#FFE14D', or: '#FF9A3D', pk: '#FF5FA2', vi: '#9B6BFF', sk: '#8FD8FF',
  },
  draw() {
    const a = new Art(32, 24);
    const tail = taper([[3, 21.5], [12, 15], [23, 7.5]], [0.6, 2.6, 4.6]);
    a.paint(tail, (x, y) => {
      const d = Math.hypot(x + 0.5 - 24, y + 0.5 - 7);
      return d < 7 ? 'yl' : d < 12 ? 'or' : d < 17 ? 'pk' : 'vi';
    });
    a.paint(circle(24.5, 7, 3.6), 'w', { outline: 'yl' });
    for (const [x, y] of [[4, 4], [9, 2], [14, 6], [28, 16], [20, 20], [29, 22], [6, 12], [16, 22]]) {
      a.set(x, y, 'sk');
    }
    a.twinkle(27, 19, 'yl');
    a.twinkle(7, 7, 'w');
    a.background(rgrad(22, 8, 30, ['n2', 'n1']));
    return a;
  },
};

const ringedPlanet = {
  id: 'ringed-planet',
  album,
  title: { fr: 'Planète à anneaux', en: 'Ringed planet' },
  difficulty: 2,
  colors: {
    n1: '#16133A', n2: '#2A2468', w: '#FFFFFF', yl: '#FFE14D',
    pD: '#B83A6E', pM: '#FF6F9C', pO: '#FFA25C', pY: '#FFD98A',
    rD: '#3A6FD8', rM: '#7FC8FF', rL: '#C8EEFF',
  },
  draw() {
    const a = new Art(32, 32);
    const ringOuter = rotEllipse(16, 16, 15.5, 4.6, -18);
    const ringInner = rotEllipse(16, 16, 11.6, 2.4, -18);
    const ringBand = diff(ringOuter, ringInner);
    const ang = (-18 * Math.PI) / 180;
    const front = (x, y) => -(x + 0.5 - 16) * Math.sin(ang) + (y + 0.5 - 16) * Math.cos(ang) > 0;
    const ringPaint = (x, y) => {
      const u = (x + 0.5 - 16) * Math.cos(ang) + (y + 0.5 - 16) * Math.sin(ang);
      const v = -(x + 0.5 - 16) * Math.sin(ang) + (y + 0.5 - 16) * Math.cos(ang);
      const r = Math.hypot(u / 15.5, v / 4.6);
      return r > 0.9 ? 'rD' : r > 0.82 ? 'rL' : 'rM';
    };
    a.paint(inter(ringBand, (x, y) => !front(x, y)), ringPaint);
    const planet = circle(16, 16, 9);
    const shade = sphere(16, 16, 9, 9, [0, 1, 2], { cuts: [0.25, 0.85] });
    a.paint(planet, (x, y) => {
      const band = Math.floor((y + 0.5 - 7 + 1.5 * Math.sin(x / 3)) / 3.2);
      const base = ['pY', 'pO', 'pM', 'pO', 'pM', 'pO'][Math.max(0, Math.min(5, band))];
      const s = shade(x, y);
      if (s === 0) return 'pD';
      if (s === 2 && base !== 'pY') return 'pY';
      return base;
    }, { outline: 'pD' });
    a.paint(inter(ringBand, front), ringPaint);
    sprinkleStars(a, 11, 26, ['w', 'yl', 'rM']);
    a.twinkle(4, 5, 'yl');
    a.twinkle(27, 27, 'w');
    a.background(rgrad(16, 16, 23, ['n2', 'n1']));
    return a;
  },
};

const astronaut = {
  id: 'astronaut',
  album,
  title: { fr: 'Astronaute en apesanteur', en: 'Floating astronaut' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', gO: '#5E5A86', gS: '#C9C6DE', w: '#FFFFFF', vD: '#1E2A6E', vM: '#3352C8', vL: '#8FB8FF',
    oM: '#FF8A3D', pk: '#FF5FA2', yl: '#FFD23F', sk: '#7FD8FF',
  },
  draw() {
    const a = new Art(32, 32);
    // Tether.
    a.paint(path([[3, 30], [6, 26], [5, 22], [8, 19]], 0.5), 'gO');
    a.paint(roundRect(5, 11, 9, 21, 2), 'gS', { outline: 'gO' });
    // Legs and arms.
    a.paint(taper([[12, 22], [10, 27], [8.5, 29.5]], [2.6, 2.4, 2.4]), 'w', { outline: 'gO', dark: { color: 'gS' } });
    a.paint(taper([[18, 22], [20.5, 26.5], [23, 28.5]], [2.6, 2.4, 2.4]), 'w', { outline: 'gO', dark: { color: 'gS' } });
    a.paint(circle(8, 29.5, 2), 'oM', { outline: 'gO' });
    a.paint(circle(23.5, 29, 2), 'oM', { outline: 'gO' });
    a.paint(taper([[20, 16], [24.5, 14], [27, 10.5]], [2.4, 2.2, 2.2]), 'w', { outline: 'gO', dark: { color: 'gS' } });
    a.paint(circle(27.5, 9.5, 2), 'oM', { outline: 'gO' });
    a.paint(roundRect(9, 15, 21, 25, 4), 'w', { outline: 'gO', dark: { color: 'gS' } });
    a.paint(roundRect(12, 18, 17, 21, 1), 'gS', { outline: 'gO' });
    a.set(13, 19, 'pk').set(14, 19, 'yl').set(15, 19, 'sk');
    // Helmet.
    a.paint(circle(15, 9.5, 8), 'w', { outline: 'gO', dark: { color: 'gS' } });
    const visor = roundRect(9, 5, 20, 13, 3.5);
    a.paint(visor, (x, y) => (y < 8 ? 'vM' : 'vD'), { outline: 'k', light: { color: 'vL' } });
    a.set(17, 6, 'w').set(18, 7, 'w');
    a.paint(path([[12, 10.5], [13.5, 11.3], [15, 10.5]], 0.42), 'sk');
    a.set(12, 8, 'sk').set(15, 8, 'sk');
    for (const [x, y] of [[2, 3], [27, 2], [29, 20], [24, 23], [3, 7]]) a.set(x, y, 'yl');
    return a;
  },
};

const moonBase = {
  id: 'moon-base',
  album,
  title: { fr: 'La base lunaire', en: 'Moon base' },
  access: 'pro',
  difficulty: 3,
  colors: {
    n1: '#120F33', n2: '#1E1A4F', n3: '#2E2770', w: '#FFFFFF', yl: '#FFE14D',
    eD: '#1F4FB8', eM: '#3D8BFF', eG: '#3CCB6E', eL: '#BDE6FF',
    m0: '#3A3658', m1: '#6E6990', m2: '#A49FC2', m3: '#D6D2EA',
    cy: '#7FE7FF', rM: '#F0263F', rD: '#9E1530', oM: '#FF9A3D', vM: '#8E6BFF', k: '#1B1A2E',
  },
  draw() {
    const W = 64;
    const a = new Art(W, 64);
    const ground = (x, y) => y + 0.5 >= 44 + 2.2 * Math.sin(x / 9) + 1.2 * Math.sin(x / 3.3);
    // Rocket on its pad.
    const body = union(roundRect(44, 19, 53, 40, 4), poly([[44, 23], [48.5, 8.5], [53, 23]]));
    a.paint(body, 'w', { outline: 'k', dark: { color: 'm3', dx: 1, dy: 0, depth: 2 } });
    a.paint(inter(body, (x, y) => y < 18), 'rM', { clip: (x, y) => a.get(x, y) !== 'k' });
    a.paint(circle(48.5, 25, 3), 'cy', { outline: 'k' });
    a.set(47, 24, 'w');
    a.paint(poly([[44, 31], [39.5, 41], [44, 39]]), 'rM', { outline: 'rD' });
    a.paint(poly([[53, 31], [57.5, 41], [53, 39]]), 'rM', { outline: 'rD' });
    a.paint(rect(45, 35, 52, 36), 'vM');
    a.paint(rect(40, 42, 57, 43), 'm1', { outline: 'm0' });
    // Dome habitat.
    a.paint(inter(ellipse(18, 46, 11, 10), (x, y) => y <= 46), 'eL', { outline: 'm0', light: { color: 'w', depth: 2 } });
    for (const x of [11, 25]) a.paint(roundRect(x - 1, 40, x + 1, 42, 1), 'cy', { outline: 'm0' });
    a.paint(roundRect(16, 42, 20, 46, 1), 'm1', { outline: 'm0' });
    a.paint(rect(29, 44, 37, 45), 'm2', { outline: 'm0' });
    // Ground with craters.
    a.paint(ground, (x, y) => (y < 50 ? 'm2' : y < 57 ? 'm1' : 'm1'), { clip: (x, y) => a.get(x, y) === null });
    a.paint(ground, 'm3', { clip: (x, y) => !ground(x, y - 1) });
    for (const [cx, cy, rx] of [[8, 56, 5], [30, 52, 3.5], [44, 59, 6], [58, 50, 3], [20, 61, 3]]) {
      a.paint(ellipse(cx, cy, rx, rx * 0.45), 'm0', { clip: ground });
      a.paint(inter(ellipse(cx, cy, rx, rx * 0.45), (x, y) => y > cy), 'm2', { clip: ground });
    }
    // Little astronaut waving.
    a.paint(rect(36, 27, 36, 43), 'm0');
    a.paint(rect(37, 27, 40, 29), 'oM');
    a.paint(roundRect(28, 36, 35, 43, 2), 'w', { outline: 'k', dark: { color: 'm3', dx: 1, dy: 0 } });
    a.paint(rect(29, 43, 31, 44), 'k');
    a.paint(rect(32, 43, 34, 44), 'k');
    a.paint(line(35, 38.5, 36.5, 36.5, 0.9), 'w');
    a.paint(circle(31.5, 32.5, 3.8), 'w', { outline: 'k' });
    a.paint(roundRect(31, 31, 34, 33, 1), 'eD');
    a.set(33, 31, 'cy');
    // Planet in the sky.
    const planet = circle(14, 14, 9);
    a.paint(planet, (x, y) => {
      const land = Math.sin(x * 0.7) + Math.cos(y * 0.9 + x * 0.3) > 0.9;
      const s = sphere(14, 14, 9, 9, [0, 1, 2], { cuts: [0.3, 0.85] })(x, y);
      if (s === 2) return land ? 'eG' : 'eL';
      if (s === 0) return 'eD';
      return land ? 'eG' : 'eM';
    }, { outline: 'eD' });
    sprinkleStars(a, 5, 60, ['w', 'yl', 'cy', 'w'], (x, y) => y < 40);
    a.twinkle(56, 6, 'yl', { size: 2 });
    a.twinkle(30, 22, 'w');
    a.background(vgrad(0, 46, ['n1', 'n2', 'n3']));
    return a;
  },
};

export const SPACE = [moon, alien, ufo, comet, ringedPlanet, astronaut, moonBase];
