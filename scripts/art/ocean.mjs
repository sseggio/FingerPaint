/** Album "Océan" (ocean): 7 new artworks (+ the tropical fish starter). */
import {
  arcPoints,
  Art,
  circle,
  diff,
  ellipse,
  inter,
  line,
  path,
  poly,
  rect,
  rotEllipse,
  sphere,
  star,
  sym,
  taper,
  union,
  vgrad,
  wave,
} from './engine.mjs';

const album = 'ocean';

const crab = {
  id: 'crab',
  album,
  title: { fr: 'Crabe rigolo', en: 'Cheerful crab' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', oD: '#B3260E', oM: '#FF5A36', oL: '#FFA27A', w: '#FFFFFF',
    sd: '#FFE3A8', sD: '#E8B060',
  },
  draw() {
    const W = 24;
    const a = new Art(W, 20);
    a.paint(inter(ellipse(12, 21.5, 14, 4), (x, y) => y >= 17), 'sd', { dark: { color: 'sD', dx: 0, dy: -1 } });
    for (const [y0, y1, x1] of [[12, 15, 2.5], [14, 17.5, 3.5], [15.5, 19, 5.5]]) {
      a.paint(sym(path([[7, y0], [x1 + 1, y0 + 1.5], [x1, y1]], 0.6), W), 'oD');
    }
    a.paint(sym(path([[7, 10.5], [4.5, 7.5]], 0.9), W), 'oM', { outline: 'oD' });
    a.paint(sym(diff(circle(4, 5, 3.4), poly([[4.5, 5], [2.5, 0], [7.5, 1.5]])), W), 'oM', {
      outline: 'oD',
      light: { color: 'oL' },
    });
    a.paint(sym(line(9.5, 8.5, 9.5, 5, 0.5), W), 'oD');
    a.paint(ellipse(12, 12.5, 7.6, 5.2), sphere(12, 12.5, 7.6, 5.2, ['oD', 'oM', 'oL'], { cuts: [0.2, 0.82] }), {
      outline: 'oD',
    });
    a.paint(sym(circle(9.5, 4.2, 2.3), W), 'w', { outline: 'oD' });
    a.set(10, 4, 'k').set(10, 5, 'k').set(13, 4, 'k').set(13, 5, 'k');
    a.paint(path([[9.5, 13.6], [12, 15], [14.5, 13.6]], 0.45), 'k');
    return a;
  },
};

const starfish = {
  id: 'starfish',
  album,
  title: { fr: 'Étoile de mer', en: 'Starfish' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', sD: '#B8380A', sS: '#F0641C', sM: '#FF9A3D', sL: '#FFD9A0', pk: '#FF6F9C',
  },
  draw() {
    const a = new Art(20, 20);
    const body = star(10, 10.8, 9.8, 4.6);
    a.paint(body, 'sM', { outline: 'sD', dark: { color: 'sS' } });
    for (const [x, y] of [[10, 3], [10, 5], [4, 8], [16, 8], [5, 16], [15, 16], [7, 14], [13, 14], [3, 9], [17, 9]])
      if (body(x, y) && a.get(x, y) === 'sM') a.set(x, y, 'sL');
    a.set(8, 10, 'k').set(8, 11, 'k').set(11, 10, 'k').set(11, 11, 'k');
    a.set(7, 12, 'pk').set(12, 12, 'pk');
    a.set(9, 13, 'k').set(10, 13, 'k');
    return a;
  },
};

const seaTurtle = {
  id: 'sea-turtle',
  album,
  title: { fr: 'Tortue de mer', en: 'Sea turtle' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', h0: '#1B5E36', h1: '#3BAA4A', h2: '#93DE5C',
    t0: '#0B6F78', t1: '#35C2BC', t2: '#A2EEE4', w: '#FFFFFF',
  },
  draw() {
    const W = 32;
    const a = new Art(W, 32);
    const skin = { outline: 't0', light: { color: 't2' } };
    a.paint(sym(rotEllipse(8.5, 10.5, 6, 2.5, -35), W), 't1', skin);
    a.paint(sym(rotEllipse(10, 24, 4, 2.1, 35), W), 't1', skin);
    a.paint(poly([[14.5, 25], [17.5, 25], [16, 29.5]]), 't1', { outline: 't0' });
    a.paint(ellipse(16, 5.5, 3.4, 4), 't1', skin);
    a.set(14, 5, 'k').set(17, 5, 'k');
    a.set(15, 7, 't0').set(16, 7, 't0');
    for (const [x, y] of [[6, 9], [9, 11], [24, 9], [21, 11], [10, 24], [21, 24]]) a.set(x, y, 't2');
    const shell = ellipse(16, 16.5, 8.4, 9.6);
    const seeds = [[16, 16.5], [16, 10.5], [16, 22.5], [10.5, 13.5], [21.5, 13.5], [10.5, 19.5], [21.5, 19.5]];
    a.paint(shell, (x, y) => {
      const d = seeds.map(([sx, sy]) => Math.hypot(x + 0.5 - sx, y + 0.5 - sy)).sort((p, q) => p - q);
      if (d[1] - d[0] < 0.95) return 'h0';
      return sphere(16, 16.5, 8.4, 9.6, ['h1', 'h1', 'h2'], { cuts: [0.5, 0.82] })(x, y);
    }, { outline: 'h0' });
    for (const [x, y] of [[26, 3], [28, 1], [27, 6], [4, 27], [3, 29]]) a.set(x, y, 'w');
    return a;
  },
};

const octopus = {
  id: 'octopus',
  album,
  title: { fr: 'Poulpe câlin', en: 'Cuddly octopus' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', vD: '#4B2385', vS: '#7A4FE0', vM: '#A07BFF', vL: '#D4C4FF', w: '#FFFFFF',
    pk: '#FF8FC0', bl: '#8FDFFF',
  },
  draw() {
    const W = 32;
    const a = new Art(W, 32);
    const tentacles = [
      taper([[9, 17], [5.5, 20], [3.5, 24], [4.5, 27.5], [7.5, 27.5]], [2.3, 2, 1.6, 1.2, 0.9]),
      taper([[11.5, 18], [9.5, 23], [8.5, 27], [10, 30]], [2.3, 1.9, 1.4, 0.9]),
      taper([[14.5, 18.5], [14, 24], [13, 28], [14.5, 30.8]], [2.2, 1.8, 1.3, 0.8]),
    ];
    for (const t of tentacles) a.paint(sym(t, W), 'vM', { outline: 'vD', dark: { color: 'vS' } });
    for (const [x, y] of [[5, 22], [4, 24], [9, 24], [9, 26], [13, 25], [13, 27]]) {
      if (a.get(x, y) === 'vM' || a.get(x, y) === 'vS') a.set(x, y, 'pk').set(W - 1 - x, y, 'pk');
    }
    a.paint(ellipse(16, 11, 9.6, 9), 'vM', { outline: 'vD', light: { color: 'vL', depth: 2 }, dark: { color: 'vS' } });
    a.paint(sym(ellipse(12, 12, 1.5, 2.1), W), 'k');
    a.set(11, 11, 'w').set(19, 11, 'w');
    a.paint(sym(rect(8, 15, 9, 15), W), 'pk');
    a.set(14, 16, 'k').set(15, 17, 'k').set(16, 17, 'k').set(17, 16, 'k');
    for (const [x, y] of [[27, 4], [29, 2], [28, 7], [3, 3], [2, 6]]) a.set(x, y, 'bl');
    return a;
  },
};

const sailboat = {
  id: 'sailboat',
  album,
  title: { fr: 'Petit voilier', en: 'Little sailboat' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', s1: '#7FD4FF', s2: '#BDEBFF', yl: '#FFD84D', yd: '#E08A00',
    e1: '#1F6FD0', e2: '#3DB8FF', w: '#FFFFFF', so: '#7F8FB5',
    rM: '#FF3D5A', rD: '#9E1530', bD: '#7A4A1E',
  },
  draw() {
    const a = new Art(32, 32);
    a.paint(circle(25.5, 6.5, 3.6), 'yl', { outline: 'yd' });
    a.paint(rect(16, 3, 16, 20), 'bD');
    a.paint(poly([[16.2, 2], [16.2, 4.6], [20, 3.3]]), 'rM');
    a.paint(poly([[17, 4], [17, 19], [27, 19]]), 'w', { outline: 'so' });
    a.paint(poly([[15, 6], [15, 19], [7, 19]]), 'yl', { outline: 'yd' });
    a.paint(poly([[6, 19.5], [27, 19.5], [23.5, 24.5], [9.5, 24.5]]), 'rM', { outline: 'rD' });
    a.paint(rect(9, 21, 23, 21), 'w');
    a.paint(path([[4, 8], [5, 7], [6, 8], [7, 7], [8, 8]], 0.45), 'k');
    a.background(vgrad(0, 21, ['s1', 's2']), (x, y) => y < 22);
    const sea = (x, y) => (wave(22.5, 0.8, 0.9)(x, y) ? (wave(27, 0.9, 0.7, 2)(x, y) ? 'e1' : 'e2') : null);
    a.paint(wave(22.5, 0.8, 0.9), (x, y) => sea(x, y), { clip: (x, y) => y >= 21 && (a.get(x, y) === null || y >= 24) });
    a.paint(wave(22.5, 0.8, 0.9), 'w', { clip: (x, y) => !wave(22.5, 0.8, 0.9)(x, y - 1) && y >= 21 });
    a.paint(wave(27, 0.9, 0.7, 2), 'w', { clip: (x, y) => !wave(27, 0.9, 0.7, 2)(x, y - 1) && x % 5 < 3 });
    a.background('s2');
    return a;
  },
};

const lighthouse = {
  id: 'lighthouse',
  album,
  title: { fr: 'Phare au couchant', en: 'Lighthouse at sunset' },
  access: 'pro',
  difficulty: 3,
  colors: {
    t1: '#4A3BB0', t2: '#8B4FD0', t3: '#E8559E', t4: '#FF8A5C', t5: '#FFC45C',
    sun: '#FFE9A0', bm: '#FFF5D6',
    e1: '#24307E', e2: '#2D62C8', e3: '#6A6FE0',
    r0: '#2E2440', r1: '#5E4C78', r2: '#8C7AA8', gr: '#2FA860',
    rM: '#F0263F', rD: '#9E1530', w: '#FFFFFF', wS: '#D0C8EA', yl: '#FFD23F',
  },
  draw() {
    const W = 48;
    const H = 64;
    const a = new Art(W, H);
    // Lighthouse.
    const tower = poly([[29.5, 51], [38.5, 51], [37, 19.5], [31, 19.5]]);
    a.paint(tower, (x, y) => (Math.floor((y - 20) / 6) % 2 === 0 ? 'w' : 'rM'), {
      outline: 'r0',
    });
    a.paint(inter(tower, (x, y) => Math.floor((y - 20) / 6) % 2 === 0 && tower(x + 1, y) && !tower(x + 3, y)), 'wS');
    a.paint(inter(tower, (x, y) => Math.floor((y - 20) / 6) % 2 !== 0 && tower(x + 1, y) && !tower(x + 3, y)), 'rD');
    a.paint(rect(33, 44, 35, 50), 'r0');
    a.paint(rect(33, 29, 34, 30), 'r0');
    a.paint(rect(28, 17, 40, 19), 'r1', { outline: 'r0' });
    a.paint(rect(31, 11, 37, 16), 'yl', { outline: 'r0' });
    a.paint(rect(33, 12, 35, 15), 'bm');
    a.paint(poly([[29.5, 11.5], [34, 5.5], [38.5, 11.5]]), 'rM', { outline: 'rD' });
    a.paint(rect(34, 3, 34, 5), 'r0');
    // Rocky island.
    a.paint(union(ellipse(33, 57, 16, 7), ellipse(22, 59, 8, 4)), 'r1', {
      clip: (x, y) => a.get(x, y) === null,
      outline: 'r0',
      light: { color: 'r2', depth: 2 },
    });
    a.paint(inter(ellipse(34, 50.5, 11, 2.2), (x, y) => a.get(x, y) === null || a.get(x, y) === 'r1' || a.get(x, y) === 'r2'), 'gr');
    // Light beams.
    a.paint(poly([[31, 13.5], [0, 5], [0, 22]]), 'bm', { clip: (x, y) => a.get(x, y) === null });
    a.paint(poly([[37, 13.5], [48, 9], [48, 18]]), 'bm', { clip: (x, y) => a.get(x, y) === null });
    // Setting sun and sky.
    a.paint(circle(12, 42, 7.5), 'sun', { clip: (x, y) => y < 42 && a.get(x, y) === null });
    for (const [x, y] of [[4, 3], [12, 2], [22, 4], [44, 3], [27, 7], [8, 30]]) if (a.get(x, y) === null) a.set(x, y, 'w');
    a.paint(path([[17, 27], [18.5, 26], [20, 27], [21.5, 26], [23, 27]], 0.45), 'r0');
    a.paint(path([[9, 33], [10, 32.3], [11, 33], [12, 32.3], [13, 33]], 0.4), 'r0');
    a.background(vgrad(0, 41, ['t1', 't2', 't3', 't4', 't5']), (x, y) => y < 42);
    // Sea with the sun's reflection.
    a.background((x, y) => {
      const glint = Math.abs(x - 12) < 7 - (y - 42) * 0.35 && (y + Math.floor(x / 3)) % 3 === 0;
      if (glint && y < 56) return 'sun';
      return y < 46 ? 'e3' : y < 54 ? 'e2' : 'e1';
    });
    return a;
  },
};

const dolphin = {
  id: 'dolphin',
  album,
  title: { fr: 'Saut de dauphin', en: 'Leaping dolphin' },
  access: 'pro',
  difficulty: 3,
  colors: {
    k: '#1B1A2E', s1: '#5CC8FF', s2: '#9EDCFF', s3: '#D4F1FF', yl: '#FFD84D', yo: '#FFA62B',
    e1: '#135FB0', e2: '#1F8FE0', w: '#FFFFFF',
    dd: '#26408F', dm: '#4F74D8', dL: '#86A6F0', dl: '#C4D0FF', pk: '#FF8FB4',
  },
  draw() {
    const a = new Art(48, 48);
    const C = [24, 36];
    const R = 15;
    const spine = [...arcPoints(C[0], C[1], R, 200, 335, 8), [40.5, 33]];
    const body = taper(spine, [0.9, 2.2, 3.6, 4.6, 4.9, 4.6, 3.8, 2.4, 1.1]);
    const fin = poly([[19, 18], [26, 17.5], [19.5, 12]]);
    const flukes = union(rotEllipse(8.5, 33, 3.6, 1.5, 70), rotEllipse(7, 29.5, 3.6, 1.5, -15));
    const pectoral = poly([[27, 26], [31, 25.5], [26.5, 30]]);
    a.paint(union(fin, flukes), 'dm', { outline: 'dd' });
    a.paint(body, (x, y) => (Math.hypot(x + 0.5 - C[0], y + 0.5 - C[1]) < R - 1.4 ? 'dl' : 'dm'), {
      outline: 'dd',
      light: { color: 'dL', dx: 0, dy: 1 },
      skipOutlineAt: () => false,
    });
    a.paint(pectoral, 'dm', { outline: 'dd' });
    a.paint(circle(35.2, 25.6, 1.1), 'k');
    a.set(35, 25, 'w');
    a.set(33, 28, 'pk');
    a.paint(path([[36, 29.5], [38, 30.5], [40, 31.2]], 0.42), 'dd');
    // Sun and sky.
    a.paint(circle(39, 8, 5), sphere(39, 8, 5, 5, ['yo', 'yl'], { cuts: [0.3] }), { clip: (x, y) => a.get(x, y) === null });
    a.paint(union(circle(8, 8, 3), circle(12, 6.5, 3.6), circle(15.5, 8.5, 2.6), rect(8, 8, 16, 10)), 'w', {
      clip: (x, y) => a.get(x, y) === null && y <= 10,
      dark: { color: 's3', dx: 0, dy: 1 },
    });
    a.background(vgrad(0, 33, ['s1', 's2', 's3']), (x, y) => y < 34);
    // Sea, with splashes where the dolphin dives in.
    const top = wave(34, 0.8, 0.8);
    a.background((x, y) => (wave(40, 0.8, 0.7, 1.5)(x, y) ? (wave(44.5, 0.6, 0.9, 3)(x, y) ? 'e1' : 'e2') : 's1'), top);
    a.paint(top, 'w', { clip: (x, y) => !top(x, y - 1) && a.get(x, y) !== 'dd' && a.get(x, y) !== 'dm' && a.get(x, y) !== 'dl' });
    for (const [x, y] of [[5, 32], [6, 30], [11, 32], [3, 31], [39, 34], [42, 32], [44, 33], [37, 32]]) a.set(x, y, 'w');
    a.background('s3');
    return a;
  },
};

export const OCEAN = [crab, starfish, seaTurtle, octopus, sailboat, lighthouse, dolphin];
