/** Album "Animaux" (animals): 7 new artworks (+ the tabby cat starter). */
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
  rotEllipse,
  roundRect,
  sphere,
  sym,
  taper,
  union,
} from './engine.mjs';

const album = 'animals';

const fox = {
  id: 'fox',
  album,
  title: { fr: 'Renard malicieux', en: 'Clever fox' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', oD: '#B8400A', oM: '#FF7A1C', oL: '#FFB15C', w: '#FFFFFF', cr: '#F2D9C8', pk: '#FF8FA3',
  },
  draw() {
    const W = 24;
    const a = new Art(W, 24);
    a.paint(sym(poly([[1.5, 0.5], [10, 6], [3, 12]]), W), 'oM', { outline: 'oD' });
    a.paint(sym(poly([[3.2, 3.5], [7.5, 6.5], [4, 9.5]]), W), 'k');
    const head = union(ellipse(12, 11.5, 9.2, 6.5), poly([[1, 12], [12, 23.5], [23, 12], [12, 6]]));
    a.paint(head, 'oM', { outline: 'oD', light: { color: 'oL' } });
    const muzzle = poly([[1.5, 12.5], [8, 13.5], [12, 16.5], [16, 13.5], [22.5, 12.5], [12, 23]]);
    a.paint(inter(head, muzzle), 'w', { clip: (x, y) => a.get(x, y) !== 'oD' });
    a.paint(inter(head, muzzle, (x, y) => !muzzle(x, y + 1) || !muzzle(x - 1, y) || !muzzle(x + 1, y)), 'cr', {
      clip: (x, y) => a.get(x, y) === 'w' && y > 13,
    });
    a.set(7, 11, 'k').set(7, 12, 'k').set(16, 11, 'k').set(16, 12, 'k');
    a.set(5, 14, 'pk').set(18, 14, 'pk');
    a.paint(rect(11, 20, 12, 21), 'k');
    return a;
  },
};

const penguin = {
  id: 'penguin',
  album,
  title: { fr: 'Pingouin en écharpe', en: 'Penguin in a scarf' },
  difficulty: 1,
  colors: {
    nD: '#1B1F4A', nM: '#3A4A8C', w: '#FFFFFF', bS: '#D2DAF0', oM: '#FFA21C', oD: '#C2600A',
    rD: '#A3122E', rM: '#F0263F', pk: '#FF8FB0',
  },
  draw() {
    const W = 24;
    const a = new Art(W, 32);
    a.paint(sym(roundRect(6, 29, 10, 31, 1), W), 'oM', { outline: 'oD' });
    a.paint(sym(rotEllipse(3.5, 19, 2.2, 6, 18), W), 'nM', { outline: 'nD' });
    const body = union(ellipse(12, 19, 8.6, 11), ellipse(12, 9, 7.4, 7.2));
    a.paint(body, 'nM', { outline: 'nD' });
    a.paint(union(ellipse(12, 21, 6, 8.2), sym(ellipse(9.5, 10, 3, 3.6), W)), 'w', { dark: { color: 'bS' } });
    a.paint(rect(5, 15, 18, 17), 'rM', { outline: 'rD' });
    a.paint(roundRect(14, 15, 17, 22, 1), 'rM', { outline: 'rD' });
    for (const x of [7, 10, 13, 16]) if (a.get(x, 16) === 'rM') a.set(x, 16, 'w');
    a.set(15, 19, 'w');
    a.paint(sym(ellipse(9.5, 10, 1, 1.4), W), 'nD');
    a.set(9, 9, 'w').set(14, 9, 'w');
    a.paint(poly([[10, 12], [14, 12], [12, 14.5]]), 'oM', { outline: 'oD' });
    a.set(7, 13, 'pk').set(16, 13, 'pk');
    return a;
  },
};

const frog = {
  id: 'frog',
  album,
  title: { fr: 'Grenouille sur son nénuphar', en: 'Frog on a lily pad' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', gD: '#2F6B12', gM: '#7ED957', gL: '#C2F28A', bY: '#F2F7B0', w: '#FFFFFF',
    lD: '#0F5E4A', lM: '#22A884', pk: '#FF6FA5', pL: '#FFC2DA',
  },
  draw() {
    const W = 24;
    const a = new Art(W, 20);
    a.paint(diff(ellipse(12, 16.5, 11.6, 3.4), poly([[12, 16.5], [24, 13], [24, 16.5]])), 'lM', { outline: 'lD' });
    a.paint(sym(ellipse(5.5, 15.5, 3, 1.4), W), 'gM', { outline: 'gD' });
    const body = union(ellipse(12, 11, 9, 5.6), sym(circle(7, 5.5, 3.6), W));
    a.paint(body, 'gM', { outline: 'gD', light: { color: 'gL' } });
    a.paint(ellipse(12, 13, 5, 2.8), 'bY', { clip: (x, y) => a.get(x, y) === 'gM' });
    a.paint(sym(circle(7, 5.5, 2.2), W), 'w');
    a.paint(sym(rect(7, 5, 8, 6), W), 'k');
    a.set(7, 5, 'w').set(16, 5, 'w');
    a.paint(path([[7, 9.5], [9, 11], [15, 11], [17, 9.5]], 0.45), 'k');
    a.set(5, 10, 'pk').set(18, 10, 'pk');
    a.paint(circle(20.5, 15.3, 1.7), 'pL', { outline: 'pk' });
    return a;
  },
};

const owl = {
  id: 'owl',
  album,
  title: { fr: 'Chouette sur sa branche', en: 'Owl on a branch' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', bD: '#4F2C14', bM: '#9A5E30', bL: '#D08E52', cr: '#FFE6BF', cS: '#E8B57A',
    w: '#FFFFFF', oM: '#FFA21C', yl: '#FFD23F', tr: '#6E4A9E', gD: '#1E7A3C', gM: '#4CC85E',
  },
  draw() {
    const W = 32;
    const a = new Art(W, 32);
    a.paint(taper([[0, 27.5], [16, 28], [32, 26.5]], [1.8, 2, 1.6]), 'tr', { outline: 'k' });
    a.paint(rotEllipse(28, 23.5, 3, 1.5, -30), 'gM', { outline: 'gD' });
    a.paint(rotEllipse(3, 24.5, 3, 1.5, 30), 'gM', { outline: 'gD' });
    a.paint(sym(poly([[5.5, 1.5], [11.5, 5.5], [6.5, 8.5]]), W), 'bM', { outline: 'bD' });
    const body = union(ellipse(16, 17.5, 10.6, 10), ellipse(16, 11, 10, 7.5));
    a.paint(body, 'bM', { outline: 'bD', light: { color: 'bL' } });
    a.paint(sym(rotEllipse(7.5, 19, 3, 7, 12), W), 'bL', { outline: 'bD' });
    const belly = ellipse(16, 21, 6.2, 6.5);
    a.paint(belly, (x, y) => ((y % 3 === 0 && (x + Math.floor(y / 3)) % 3 === 0) ? 'cS' : 'cr'), { clip: body });
    a.paint(sym(circle(11.5, 11, 4.2), W), 'w', { outline: 'bD' });
    a.paint(sym(circle(12, 11.5, 2.2), W), 'oM');
    a.paint(sym(rect(11, 11, 12, 12), W), 'k');
    a.set(11, 10, 'w').set(19, 10, 'w');
    a.paint(poly([[14.5, 14], [17.5, 14], [16, 17.5]]), 'yl', { outline: 'bD' });
    a.paint(sym(rect(12, 27, 13, 28), W), 'yl');
    return a;
  },
};

const bunny = {
  id: 'bunny',
  album,
  title: { fr: 'Lapin et sa carotte', en: 'Bunny with a carrot' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', gO: '#7E78A6', gS: '#D8D3EA', w: '#FFFFFF', pk: '#FFB3C9', pD: '#FF6F9C',
    oD: '#C2500E', oM: '#FF8A1C', lD: '#1E7A3C', lM: '#4CC85E',
  },
  draw() {
    const W = 24;
    const a = new Art(W, 32);
    a.paint(sym(rotEllipse(8, 6.5, 2.6, 6.8, -10), W), 'w', { outline: 'gO' });
    a.paint(sym(rotEllipse(8.1, 7, 1.1, 5, -10), W), 'pk');
    a.paint(ellipse(12, 24.5, 8, 7.2), 'w', { outline: 'gO', dark: { color: 'gS' } });
    a.paint(sym(ellipse(7, 30, 3.2, 1.8), W), 'w', { outline: 'gO' });
    a.paint(ellipse(12, 15, 7.6, 6.4), 'w', { outline: 'gO', dark: { color: 'gS' } });
    a.paint(sym(rect(8, 14, 8, 15), W), 'k');
    a.set(8, 14, 'w').set(15, 14, 'w');
    a.set(8, 14, 'k').set(15, 14, 'k');
    a.set(6, 17, 'pk').set(17, 17, 'pk');
    a.paint(rect(11, 16, 12, 16), 'pD');
    a.set(11, 18, 'gO').set(12, 18, 'gO');
    // Carrot held in the paws.
    a.paint(poly([[9, 21.5], [14.5, 20.5], [16, 29.5]]), 'oM', { outline: 'oD' });
    a.paint(path([[11, 21], [9.5, 18.5]], 0.5), 'lM');
    a.paint(path([[12.5, 20.8], [13.5, 18]], 0.5), 'lD');
    a.paint(sym(circle(8.5, 23.5, 1.8), W), 'w', { outline: 'gO' });
    return a;
  },
};

const panda = {
  id: 'panda',
  album,
  title: { fr: 'Panda gourmand', en: 'Hungry panda' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', kL: '#4A4766', w: '#FFFFFF', gS: '#D9D6EA', pk: '#FF9FBF',
    gD: '#1E7A3C', gM: '#4CC85E', gL: '#B5EE7A',
  },
  draw() {
    const W = 32;
    const a = new Art(W, 32);
    a.paint(sym(circle(6.5, 6.5, 4), W), 'k', { light: { color: 'kL' } });
    a.paint(ellipse(16, 27, 11, 7), 'w', { outline: 'k', dark: { color: 'gS' } });
    a.paint(ellipse(16, 14.5, 11.5, 10), 'w', { outline: 'k', dark: { color: 'gS' } });
    a.paint(sym(rotEllipse(11, 14, 2.8, 3.8, 35), W), 'k');
    a.paint(sym(rect(11, 13, 11, 14), W), 'w');
    a.paint(ellipse(16, 19.5, 2, 1.3), 'k');
    a.paint(path([[14, 21.5], [16, 22.5], [18, 21.5]], 0.45), 'k');
    a.paint(sym(rect(7, 19, 8, 19), W), 'pk');
    // Bamboo stalk with leaves, held in the paws.
    a.paint(rect(22, 13, 24, 31), (x, y) => (y % 6 === 0 ? 'gD' : x === 22 ? 'gL' : 'gM'), { outline: 'gD' });
    a.paint(rotEllipse(27.5, 14, 4.2, 1.6, -30), 'gM', { outline: 'gD' });
    a.paint(rotEllipse(18.5, 12.5, 3.8, 1.5, 25), 'gM', { outline: 'gD', clip: (x, y) => a.get(x, y) !== 'k' && y < 13 });
    a.paint(sym(ellipse(8.5, 26, 3.5, 3), W), 'k', { light: { color: 'kL' } });
    return a;
  },
};

const parrot = {
  id: 'parrot',
  album,
  title: { fr: 'Perroquet des tropiques', en: 'Tropical parrot' },
  access: 'pro',
  difficulty: 3,
  colors: {
    k: '#1B1A2E',
    rD: '#8E0F2A', rM: '#E8243C', rL: '#FF7A7A',
    bD: '#1E3A8A', bM: '#2F6FE6', bL: '#7FB0FF',
    yD: '#D99A00', yM: '#FFD23F', gO: '#2E7D32', w: '#FFFFFF', bk: '#F2E6D2', bkD: '#B8A68A',
    tD: '#5A3418', tM: '#9A5E30', fD: '#126B3E', fM: '#2FB866', fL: '#9BE57A', ft: '#7E78A6', pk: '#FF9AB8',
  },
  draw() {
    const W = 48;
    const a = new Art(W, 64);
    // Tropical leaves behind.
    for (const [cx, cy, rx, ry, deg] of [[8, 18, 13, 4.5, -55], [41, 24, 12, 4.2, 50], [6, 50, 12, 4, 30], [42, 54, 11, 4, -35]]) {
      const leaf = rotEllipse(cx, cy, rx, ry, deg);
      a.paint(leaf, 'fM', { outline: 'fD', light: { color: 'fL' } });
      const ang = (deg * Math.PI) / 180;
      a.paint(inter(leaf, line(cx - rx * Math.cos(ang), cy - rx * Math.sin(ang), cx + rx * Math.cos(ang), cy + rx * Math.sin(ang), 0.5)), 'fD');
    }
    // Tail feathers.
    a.paint(taper([[23, 44], [21, 54], [18, 63.5]], [3.4, 2.8, 1.5]), 'bM', { outline: 'bD' });
    a.paint(taper([[25, 44], [25, 54], [24, 63.5]], [3.2, 2.6, 1.4]), 'rM', { outline: 'rD', light: { color: 'rL' } });
    // Branch.
    a.paint(taper([[0, 45], [24, 46.5], [48, 44]], [2.6, 2.8, 2.2]), 'tM', { outline: 'tD' });
    // Body and head.
    const body = rotEllipse(25, 32, 8.5, 13, 8);
    a.paint(body, sphere(25, 32, 8.5, 13, ['rD', 'rM', 'rL'], { cuts: [0.25, 0.88] }), { outline: 'rD' });
    a.paint(circle(23.5, 16, 8), sphere(23.5, 16, 8, 8, ['rD', 'rM', 'rL'], { cuts: [0.25, 0.85] }), { outline: 'rD' });
    // Wing: yellow coverts, green band, blue flight feathers.
    const wing = rotEllipse(21.5, 33, 6.4, 12.5, 14);
    a.paint(wing, (x, y) => (y < 27 ? 'yM' : y < 30 ? 'gO' : (x + y) % 5 === 0 ? 'bL' : 'bM'), { outline: 'bD' });
    a.paint(inter(wing, (x, y) => y >= 30 && y % 4 === 0), 'bD');
    a.paint(inter(wing, (x, y) => y < 27 && (x + y) % 4 === 0), 'yD');
    // Face patch, eye, beak.
    a.paint(ellipse(27, 15.5, 4, 3.4), 'w', { outline: 'bkD' });
    a.paint(circle(27, 15, 1.5), 'k');
    a.set(26, 14, 'w');
    a.set(25, 19, 'pk');
    a.paint(poly([[29.5, 12.5], [35, 14], [36, 18.5], [34.5, 21.5], [33, 18.5], [29.5, 20]]), 'bk', { outline: 'bkD' });
    a.paint(poly([[29.5, 19], [33, 19.5], [31, 22.5]]), 'k');
    // Feet gripping the branch.
    for (const x of [23, 27]) {
      a.paint(roundRect(x, 43, x + 2, 46, 1), 'ft', { outline: 'k' });
    }
    return a;
  },
};

export const ANIMALS = [fox, penguin, frog, owl, bunny, panda, parrot];
