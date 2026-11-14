/** Album "Jardin" (garden): 6 new artworks (+ 2 starters). */
import {
  Art,
  circle,
  ellipse,
  inter,
  line,
  path,
  poly,
  rect,
  ring,
  rng,
  rotEllipse,
  roundRect,
  sphere,
  sym,
  union,
  vgrad,
} from './engine.mjs';

const album = 'garden';

function petalRing(cx, cy, count, dist, rx, ry, phase = 0) {
  return union(
    ...Array.from({ length: count }, (_, k) => {
      const a = ((k * 360) / count + phase) * (Math.PI / 180);
      return rotEllipse(cx + dist * Math.cos(a), cy + dist * Math.sin(a), rx, ry, (k * 360) / count + phase);
    }),
  );
}

const sunflower = {
  id: 'sunflower',
  album,
  title: { fr: 'Tournesol', en: 'Sunflower' },
  difficulty: 1,
  colors: {
    pD: '#C2560E', pO: '#FF9F1C', pY: '#FFD93D',
    cD: '#4A2408', cB: '#8A4A16', cL: '#C47A3A',
    gD: '#1E7A3C', gM: '#3DBE5A', gL: '#9BE870',
  },
  draw() {
    const a = new Art(24, 32);
    const stem = path([[12, 15], [12.6, 23], [12, 31.5]], 1.1);
    a.paint(stem, 'gM', { outline: 'gD' });
    a.paint(rotEllipse(6.5, 23, 5.2, 2.3, -28), 'gM', { outline: 'gD', light: { color: 'gL' } });
    a.paint(rotEllipse(18, 26, 5.2, 2.3, 28), 'gM', { outline: 'gD', light: { color: 'gL' } });
    a.paint(line(3, 25.2, 9, 21.5, 0.45), 'gD');
    a.paint(line(15, 24, 21, 27.5, 0.45), 'gD');
    const petals = petalRing(12, 10, 12, 6.3, 3.4, 1.8);
    a.paint(petals, 'pY', { outline: 'pD', dark: { color: 'pO' } });
    a.paint(circle(12, 10, 4.6), sphere(12, 10, 4.6, 4.6, ['cD', 'cB', 'cL'], { cuts: [0.45, 0.8] }), {
      outline: 'cD',
    });
    for (const [x, y] of [[10, 9], [12, 8], [13, 11], [11, 12], [14, 9]]) a.set(x, y, 'cD');
    return a;
  },
};

const ladybug = {
  id: 'ladybug',
  album,
  title: { fr: 'Coccinelle sur sa feuille', en: 'Ladybug on a leaf' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', rD: '#A3122E', rM: '#F0263F', rL: '#FF8C8C', w: '#FFFFFF',
    gD: '#167A44', gM: '#3CCB6E', gL: '#A8EE90',
  },
  draw() {
    const a = new Art(20, 20);
    const leaf = rotEllipse(10, 10.5, 10, 6.4, -42);
    a.paint(leaf, 'gM', { outline: 'gD', light: { color: 'gL' } });
    a.paint(inter(leaf, line(2, 18, 18, 2, 0.5)), 'gD');
    a.paint(path([[9, 4.5], [7.5, 2.5], [6, 1.5]], 0.5), 'k');
    a.paint(path([[12, 4.5], [13.5, 2.5], [15, 1.5]], 0.5), 'k');
    a.paint(circle(10.5, 7, 3.2), 'k');
    a.set(9, 6, 'w').set(11, 6, 'w');
    const body = circle(10.5, 12.5, 5.6);
    a.paint(body, sphere(10.5, 12.5, 5.6, 5.6, ['rD', 'rM', 'rL'], { cuts: [0.35, 0.86] }), { outline: 'k' });
    a.paint(inter(body, rect(10, 7, 10, 18)), 'k');
    for (const [x, y, r] of [[7.6, 11.4, 1.2], [13.4, 11.4, 1.2], [8, 15, 1.05], [13, 15, 1.05]]) a.paint(circle(x, y, r), 'k');
    return a;
  },
};

const butterfly = {
  id: 'butterfly',
  album,
  title: { fr: 'Papillon arc-en-ciel', en: 'Rainbow butterfly' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', dv: '#4A2381', pk: '#FF4F9A', or: '#FF9A3D', yl: '#FFD84D',
    vi: '#8A6BFF', sk: '#5CC8FF', w: '#FFFFFF',
  },
  draw() {
    const W = 32;
    const a = new Art(W, 24);
    const upper = rotEllipse(9, 8.5, 8.4, 6.2, -24);
    const lower = rotEllipse(10.5, 17, 5.6, 4.6, 28);
    const upperS = sym(inter(upper, (x) => x < 16), W);
    const lowerS = sym(inter(lower, (x) => x < 16), W);
    a.paint(upperS, (x, y) => ['yl', 'or', 'pk', 'pk'][Math.min(3, Math.floor(Math.hypot(x + 0.5 - 16, y + 0.5 - 11) / 4.2))], {
      outline: 'dv',
    });
    a.paint(lowerS, (x, y) => ['sk', 'vi', 'vi'][Math.min(2, Math.floor(Math.hypot(x + 0.5 - 16, y + 0.5 - 13) / 4))], {
      outline: 'dv',
    });
    for (const [x, y, r] of [[4.2, 6.5, 1.3], [7.2, 3.8, 1.05], [8, 19.5, 1.05]]) a.paint(sym(circle(x, y, r), W), 'w');
    a.paint(sym(path([[15.2, 3.5], [13.5, 1.5], [12, 0.8]], 0.5), W), 'k');
    a.paint(roundRect(15, 5, 16, 20, 1), 'k');
    a.paint(circle(16, 4.5, 1.9), 'k');
    return a;
  },
};

const wateringCan = {
  id: 'watering-can',
  album,
  title: { fr: "L'arrosoir", en: 'Watering can' },
  difficulty: 2,
  colors: {
    cD: '#0B6B5C', cS: '#1FA58A', cM: '#36D6AE', cL: '#A6F5DC',
    yd: '#D98A00', yl: '#FFC93C', bl: '#3DB8FF', bL: '#A8E4FF', w: '#FFFFFF',
    gD: '#1F8A3E', gM: '#55CC5A', pk: '#FF4F9A',
  },
  draw() {
    const a = new Art(32, 28);
    // Handle on top, then body.
    a.paint(inter(ring(12.5, 10.5, 4.6, 6.4), (x, y) => y < 10), 'cM', { outline: 'cD' });
    a.paint(line(18.5, 22, 26.5, 10.5, 1.7), 'cM', { outline: 'cD', light: { color: 'cL', dx: 1, dy: 0 } });
    a.paint(rotEllipse(28, 8.8, 1.8, 3.2, 40), 'yl', { outline: 'yd' });
    const body = roundRect(5, 10, 20, 25, 3);
    a.paint(body, 'cM', { outline: 'cD', dark: { color: 'cS', depth: 2 }, light: { color: 'cL' } });
    a.paint(inter(body, rect(6, 13, 19, 14)), 'yl');
    a.paint(ellipse(12.5, 10.5, 6, 1.6), 'cS', { outline: 'cD' });
    // Little flower decal.
    for (const [dx, dy] of [[-2.2, 0], [2.2, 0], [0, -2.2], [0, 2.2]]) a.paint(circle(12.5 + dx, 20 + dy, 1.5), 'pk');
    a.paint(circle(12.5, 20, 1.3), 'yl');
    // Water drops.
    for (const [x, y] of [[30, 11], [27, 14], [31, 15], [29, 18]]) {
      a.set(x, y, 'bL').set(x, y + 1, 'bl').set(x - 1, y + 1, 'bL').set(x, y + 2, 'bl');
    }
    // Grass and a sprout being watered.
    a.paint(rect(0, 26, 31, 27), 'gM');
    for (let x = 0; x < 32; x += 3) a.set(x, 26, 'gD');
    a.paint(line(28.5, 25.5, 28.5, 22, 0.5), 'gD');
    a.set(27, 24, 'gM').set(29, 23, 'gM');
    a.paint(circle(28.5, 21.5, 1.6), 'pk');
    a.set(28, 21, 'yl');
    return a;
  },
};

const beeFlower = {
  id: 'bee-and-flower',
  album,
  title: { fr: 'Abeille et cosmos', en: 'Bee and cosmos' },
  access: 'pro',
  difficulty: 3,
  colors: {
    k: '#1B1A2E', s1: '#8FD8FF', s2: '#B8E7FF', s3: '#DDF4FF', w: '#FFFFFF',
    pO: '#8E1452', pS: '#D63384', pM: '#FF5FA2', pL: '#FFB0D0',
    yD: '#C26A00', yM: '#FFC21A', yL: '#FFE680',
    gD: '#156B3A', gM: '#2FB85C', gL: '#8EE07A',
    wO: '#6E8FB8', ch: '#FF7FA8',
  },
  draw() {
    const a = new Art(48, 48);
    // Stem and leaves.
    a.paint(path([[17, 34], [16, 41], [18, 47.5]], 1.2), 'gM', { outline: 'gD' });
    a.paint(rotEllipse(9.5, 42, 6.5, 2.6, -25), 'gM', { outline: 'gD', light: { color: 'gL' } });
    a.paint(rotEllipse(26, 43.5, 6.5, 2.6, 22), 'gM', { outline: 'gD', light: { color: 'gL' } });
    // Cosmos flower.
    const petals = petalRing(17, 31, 8, 7.2, 5.2, 3.4, 22);
    a.paint(petals, 'pM', { outline: 'pO', dark: { color: 'pS', depth: 1 }, light: { color: 'pL' } });
    a.paint(inter(petals, ring(17, 31, 0, 6)), 'pS');
    a.paint(circle(17, 31, 3.6), sphere(17, 31, 3.6, 3.6, ['yD', 'yM', 'yL']), { outline: 'yD' });
    // Flight trail.
    for (const [x, y] of [[22, 22], [20, 19], [20, 15], [22, 12], [25, 10]]) a.set(x, y, 'w').set(x + 1, y, 'w');
    // Wings (behind the body).
    a.paint(rotEllipse(31, 9, 4.2, 6, -20), 'w', { outline: 'wO', dark: { color: 's2' } });
    a.paint(rotEllipse(37.5, 9.5, 3.6, 5.4, 18), 'w', { outline: 'wO', dark: { color: 's2' } });
    // Bee body with stripes.
    const body = rotEllipse(34, 18, 8, 6, -12);
    const ang = (-12 * Math.PI) / 180;
    a.paint(body, (x, y) => {
      const u = (x + 0.5 - 34) * Math.cos(ang) + (y + 0.5 - 18) * Math.sin(ang);
      if (u > -1.5 && u < 0.7) return 'k';
      if (u > 3 && u < 5.2) return 'k';
      return sphere(34, 18, 8, 6, ['yD', 'yM', 'yL'], { cuts: [0.3, 0.8] })(x, y);
    }, { outline: 'k' });
    a.paint(poly([[42, 19], [45.5, 20.5], [42, 22]]), 'k');
    // Face.
    a.paint(circle(29.5, 17, 1.6), 'k');
    a.set(29, 16, 'w');
    a.set(27, 20, 'ch').set(28, 20, 'ch');
    a.paint(path([[29, 21.2], [30.5, 21.8], [32, 21.2]], 0.45), 'k');
    a.paint(path([[29, 12.5], [27, 8.5], [25.5, 7.5]], 0.5), 'k');
    a.paint(circle(25.5, 7.5, 1), 'k');
    // Sky with soft clouds.
    a.paint(union(circle(7, 9, 3.5), circle(11, 7.5, 4), circle(14.5, 9.5, 3), rect(7, 9, 15, 12)), 'w', {
      clip: (x, y) => a.get(x, y) === null,
      dark: { color: 's3', dx: 0, dy: 1 },
    });
    a.paint(union(circle(42, 33, 2.8), circle(45, 31.5, 3.2), rect(41, 33, 47, 35)), 'w', {
      clip: (x, y) => a.get(x, y) === null,
      dark: { color: 's3', dx: 0, dy: 1 },
    });
    a.background(vgrad(0, 47, ['s1', 's2', 's3']));
    return a;
  },
};

function tulip(a, x, y, color, shade, h) {
  a.paint(line(x + 0.5, y + 3, x + 0.5, y + h, 0.8), 'g1', { outline: 'gD' });
  a.paint(rotEllipse(x - 2, y + h - 4, 4.2, 1.6, -60), 'g1', { outline: 'gD' });
  const cup = union(
    ellipse(x + 0.5, y + 2.5, 4, 4),
    poly([[x - 3.5, y + 2], [x - 3.5, y - 3], [x - 1.2, y - 0.5], [x + 0.5, y - 3.5], [x + 2.2, y - 0.5], [x + 4.5, y - 3], [x + 4.5, y + 2]]),
  );
  a.paint(cup, color, { outline: shade, dark: { color: shade } });
  a.paint(inter(cup, line(x + 0.5, y - 1, x + 0.5, y + 4, 0.5)), shade);
  a.set(x - 2, y + 1, 'w');
}

const flowerGarden = {
  id: 'flower-garden',
  album,
  title: { fr: 'Le jardin en fleurs', en: 'Garden in bloom' },
  access: 'pro',
  difficulty: 3,
  colors: {
    k: '#1B1A2E',
    s1: '#6FCBFF', s2: '#9EDCFF', s3: '#C8ECFF', w: '#FFFFFF',
    sD: '#F08C00', sM: '#FFC21A', yM: '#FFE680',
    h1: '#A6E68F', fO: '#8A86B8',
    g1: '#4CC85E', g2: '#33A852', g3: '#228A44', gD: '#146A34',
    rM: '#FF3D5A', rD: '#B3132F', vM: '#8A6BFF', vD: '#4A2FB8',
    oM: '#FF8A3D', oD: '#C4500E', pk: '#FF6FB5', bD: '#8E5A2B', bM: '#C98A4B',
  },
  draw() {
    const W = 96;
    const a = new Art(W, 96);
    const rand = rng(7);
    // Sun and clouds.
    a.paint(circle(16, 15, 9), sphere(16, 15, 9, 9, ['sD', 'sM', 'yM'], { cuts: [0.3, 0.85] }));
    for (const [cx, cy, s] of [[36, 9, 0.8], [58, 18, 1], [78, 6, 0.7]]) {
      const cloud = union(
        circle(cx, cy, 5 * s),
        circle(cx + 6 * s, cy - 2 * s, 6 * s),
        circle(cx + 12 * s, cy, 4.5 * s),
        rect(Math.round(cx), Math.round(cy), Math.round(cx + 12 * s), Math.round(cy + 4 * s)),
      );
      a.paint(inter(cloud, (x, y) => y <= cy + 4 * s), 'w', { dark: { color: 's3', dx: 0, dy: 1, depth: 1 } });
    }
    // Hills.
    a.paint(ellipse(22, 60, 44, 15), 'h1', { clip: (x, y) => y < 66 });
    a.paint(ellipse(84, 63, 36, 12), 'g1', { clip: (x, y) => y < 66 && a.get(x, y) === null });
    a.background(vgrad(0, 52, ['s1', 's2', 's3']), (x, y) => y < 66);
    // Birdhouse on a pole.
    a.paint(rect(82, 38, 83, 66), 'bD');
    a.paint(rect(77, 30, 88, 41), 'bM', { outline: 'bD' });
    a.paint(poly([[75, 31], [82.5, 23], [91, 31]]), 'rM', { outline: 'rD' });
    a.paint(circle(82.5, 35, 2), 'k');
    a.paint(rect(81, 38, 84, 38), 'bD');
    // Picket fence.
    a.paint(rect(0, 51, W - 1, 53), 'w', { outline: 'fO' });
    a.paint(rect(0, 60, W - 1, 62), 'w', { outline: 'fO' });
    for (let x = 1; x < W; x += 8) {
      const picket = union(rect(x, 48, x + 4, 66), poly([[x, 48.5], [x + 2.5, 45], [x + 5, 48.5]]));
      a.paint(picket, 'w', { outline: 'fO', dark: { color: 's3', dx: 1, dy: 0 } });
    }
    // Lawn.
    a.paint(rect(0, 66, W - 1, 95), vgrad(66, 95, ['g1', 'g2', 'g3']));
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rand() * W);
      const y = 70 + Math.floor(rand() * 25);
      a.set(x, y, 'gD').set(x, y - 1, 'gD');
    }
    // Flowering bushes along the fence.
    for (let i = 0, x = 6; x < W + 6; x += 16, i++) {
      const bush = union(ellipse(x, 65, 9, 6.5), ellipse(x + 6, 63, 6, 5.5));
      a.paint(bush, 'g2', { outline: 'gD', light: { color: 'g1' }, dark: { color: 'g3' } });
      for (let k = 0; k < 6; k++) {
        const fx = Math.round(x - 6 + rand() * 14);
        const fy = Math.round(60 + rand() * 7);
        if (bush(fx, fy) && bush(fx + 1, fy + 1)) {
          const c = ['pk', 'yM', 'w'][(i + k) % 3];
          a.set(fx, fy, c).set(fx + 1, fy, c).set(fx, fy + 1, c).set(fx + 1, fy + 1, c);
        }
      }
    }
    // Tulips.
    const colorsOf = [['rM', 'rD'], ['vM', 'vD'], ['oM', 'oD'], ['pk', 'rD'], ['yM', 'sD']];
    for (let i = 0, x = 7; x < W - 4; x += 12, i++) {
      const [c, d] = colorsOf[i % colorsOf.length];
      tulip(a, x, 77 + (i % 2) * 5, c, d, 15);
    }
    // A butterfly.
    a.paint(sym(inter(rotEllipse(26, 38, 3.4, 2.6, -25), (x) => x < 29), 58), 'pk', { outline: 'vD' });
    a.paint(sym(inter(rotEllipse(27, 42.5, 2.2, 2, 25), (x) => x < 29), 58), 'yM', { outline: 'vD' });
    a.paint(rect(29, 37, 29, 44), 'k');
    return a;
  },
};

export const GARDEN = [sunflower, ladybug, butterfly, wateringCan, beeFlower, flowerGarden];
