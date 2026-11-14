/** Album "Cuisine" (kitchen): 7 new artworks (+ the strawberry starter). */
import {
  Art,
  circle,
  diff,
  ellipse,
  inter,
  path,
  poly,
  rect,
  rng,
  rotEllipse,
  roundRect,
  sphere,
  taper,
  union,
} from './engine.mjs';

const album = 'kitchen';

const cupcake = {
  id: 'cupcake',
  album,
  title: { fr: 'Cupcake à la cerise', en: 'Cherry cupcake' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', wD: '#B5306B', wM: '#FF5FA2', wL: '#FF9CC8',
    fD: '#D98AA8', fM: '#FFD6E6', w: '#FFFFFF',
    cD: '#8E0F2A', cM: '#F0263F', gS: '#3A8A3A', sk: '#3DB8FF', yl: '#FFC93C', mi: '#2ED3A0',
  },
  draw() {
    const W = 24;
    const a = new Art(W, 24);
    const wrapper = poly([[4, 13], [20, 13], [17.5, 23.5], [6.5, 23.5]]);
    a.paint(wrapper, (x) => (x % 3 === 0 ? 'wD' : 'wM'), { outline: 'wD', light: { color: 'wL', dx: 1, dy: 0 } });
    const frosting = union(ellipse(12, 12.5, 9.5, 3.2), ellipse(12, 9.5, 7.5, 3), ellipse(12, 6.8, 5, 2.6), ellipse(12, 4.8, 2.6, 2));
    a.paint(frosting, 'fM', { outline: 'fD', light: { color: 'w' } });
    for (const [y, rx] of [[12.5, 9.5], [9.5, 7.5], [6.8, 5]]) {
      a.paint(inter(frosting, (x, yy) => yy === Math.round(y + 1.6) && Math.abs(x + 0.5 - 12) < rx - 2), 'fD');
    }
    const sprinkles = [[7, 11, 'sk'], [16, 10, 'yl'], [10, 8, 'mi'], [14, 7, 'wM'], [9, 12, 'yl'], [15, 12, 'sk'], [12, 10, 'wM'], [18, 12, 'mi']];
    for (const [x, y, c] of sprinkles) if (a.get(x, y) === 'fM') a.set(x, y, c);
    a.paint(path([[12.5, 2], [14, 0.5]], 0.45), 'gS');
    a.paint(circle(11.5, 3, 2.2), 'cM', { outline: 'cD' });
    a.set(11, 2, 'w');
    return a;
  },
};

const avocado = {
  id: 'avocado',
  album,
  title: { fr: 'Avocat souriant', en: 'Smiling avocado' },
  difficulty: 1,
  colors: {
    k: '#1B1A2E', sD: '#1F4D1A', sM: '#3F8A2E', fM: '#C8EB6A', fL: '#F2FAB0',
    pD: '#5A2E12', pM: '#9A5A2A', pL: '#D08A4E', pk: '#FF8FA8',
  },
  draw() {
    const a = new Art(20, 24);
    const shape = union(ellipse(10, 15.5, 8.6, 8), ellipse(10, 7.5, 5.6, 6.8));
    a.paint(shape, 'sM', { outline: 'sD' });
    const flesh = union(ellipse(10, 15.5, 7, 6.6), ellipse(10, 7.8, 4.2, 5.6));
    a.paint(flesh, 'fM', { light: { color: 'fL', depth: 1 } });
    a.paint(circle(10, 16, 3.8), sphere(10, 16, 3.8, 3.8, ['pD', 'pM', 'pL'], { cuts: [0.35, 0.85] }), { outline: 'pD' });
    a.set(8, 8, 'k').set(8, 9, 'k').set(11, 8, 'k').set(11, 9, 'k');
    a.set(7, 10, 'pk').set(12, 10, 'pk');
    a.set(9, 11, 'k').set(10, 11, 'k');
    return a;
  },
};

const donut = {
  id: 'donut',
  album,
  title: { fr: 'Beignet glacé', en: 'Glazed donut' },
  difficulty: 1,
  colors: {
    dD: '#8A4A1A', dM: '#E09A52', dL: '#F7C98A', iD: '#C2185B', iM: '#FF5FA2', iL: '#FFB0D0',
    w: '#FFFFFF', yl: '#FFD23F', sk: '#3DB8FF', mi: '#2ED3A0', vi: '#7B5CFF',
  },
  draw() {
    const a = new Art(24, 24);
    const dough = diff(ellipse(12, 12.5, 11, 10), ellipse(12, 11.5, 3.4, 3));
    a.paint(dough, sphere(12, 12.5, 11, 10, ['dD', 'dM', 'dL'], { cuts: [0.25, 0.8] }), { outline: 'dD' });
    const icing = (x, y) => {
      const ang = Math.atan2(y + 0.5 - 12, x + 0.5 - 12);
      const r = Math.hypot((x + 0.5 - 12) / 1.08, y + 0.5 - 11.5);
      return r >= 3.6 && r <= 8.4 + 0.9 * Math.sin(ang * 6) + (y > 15 ? 0.6 : 0);
    };
    a.paint(icing, 'iM', { outline: 'iD', light: { color: 'iL' } });
    const rand = rng(3);
    const cs = ['w', 'yl', 'sk', 'mi', 'vi'];
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rand() * 24);
      const y = Math.floor(rand() * 24);
      if (a.get(x, y) === 'iM' && a.get(x + 1, y) === 'iM' && (x + y) % 2 === 0) a.set(x, y, cs[i % cs.length]);
    }
    return a;
  },
};

const teapot = {
  id: 'teapot',
  album,
  title: { fr: 'Théière à pois', en: 'Polka-dot teapot' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', tD: '#2E3FA8', tM: '#5C7CFA', tL: '#A9BCFF', w: '#FFFFFF',
    gD: '#C98A00', yl: '#FFC93C', st: '#D5DCF0', cD: '#B5306B', cM: '#FF6FA5',
  },
  draw() {
    const a = new Art(32, 28);
    // Steam.
    a.paint(path([[15, 5], [14, 3.5], [15.5, 2], [14.5, 0.5]], 0.5), 'st');
    a.paint(path([[27, 8], [26, 6.5], [27.5, 5], [26.5, 3.5]], 0.5), 'st');
    // Handle and spout behind the body.
    a.paint(diff(ellipse(5.5, 15.5, 4.5, 5.5), ellipse(5.5, 15.5, 2.2, 3.2)), 'tM', { outline: 'tD' });
    a.paint(taper([[22, 18], [26, 14], [28.5, 10]], [2.6, 1.8, 1.5]), 'tM', { outline: 'tD', light: { color: 'tL' } });
    const body = ellipse(14.5, 17.5, 9.5, 8);
    a.paint(body, sphere(14.5, 17.5, 9.5, 8, ['tD', 'tM', 'tL'], { cuts: [0.2, 0.86] }), { outline: 'tD' });
    for (const [x, y] of [[9, 14], [14, 12], [19, 15], [11, 19], [17, 20], [7, 18], [14, 23], [21, 21]]) {
      if (body(x - 1, y) && body(x + 2, y)) a.set(x, y, 'w').set(x + 1, y, 'w').set(x, y + 1, 'w').set(x + 1, y + 1, 'w');
    }
    a.paint(rect(7, 9, 22, 10), 'yl', { outline: 'gD' });
    a.paint(ellipse(14.5, 8.5, 5.5, 2.4), 'tM', { outline: 'tD', clip: (x, y) => y < 9 });
    a.paint(circle(14.5, 6, 1.7), 'yl', { outline: 'gD' });
    a.paint(rect(8, 24, 21, 25), 'yl', { outline: 'gD' });
    // A little cup.
    a.paint(roundRect(24, 21, 30, 26, 2), 'cM', { outline: 'cD' });
    a.paint(rect(25, 22, 29, 22), 'w');
    a.paint(rect(23, 27, 31, 27), 'cD');
    return a;
  },
};

const iceCream = {
  id: 'ice-cream',
  album,
  title: { fr: 'Cornet deux boules', en: 'Double scoop cone' },
  difficulty: 2,
  colors: {
    k: '#1B1A2E', cD: '#9A5A1A', cM: '#F0B060', cL: '#FFD89A',
    mD: '#1E9E7A', mM: '#5BE3B8', mL: '#B8F7E2', pD: '#C2185B', pM: '#FF6FA5', pL: '#FFB8D4',
    rD: '#8E0F2A', rM: '#F0263F', w: '#FFFFFF', ch: '#5A2E12',
  },
  draw() {
    const W = 20;
    const a = new Art(W, 32);
    const cone = poly([[4, 18], [16, 18], [10, 31.8]]);
    a.paint(cone, (x, y) => ((x + y) % 3 === 0 || (x - y + 60) % 3 === 0 ? 'cD' : 'cM'), {
      outline: 'cD',
      light: { color: 'cL', dx: 1, dy: 0 },
    });
    const scoop = (cy, r, rimY, color, out, light) => {
      const rim = union(...[-5.25, -1.75, 1.75, 5.25].map((dx) => circle(10 + dx, rimY, 1.9)), ellipse(10, rimY - 1.6, 7, 2.2));
      a.paint(union(circle(10, cy, r), rim), color, { outline: out, light: { color: light } });
    };
    scoop(14, 5.8, 18.6, 'mM', 'mD', 'mL');
    scoop(7.6, 5.2, 11.8, 'pM', 'pD', 'pL');
    for (const [x, y] of [[7, 7], [12, 9], [9, 11], [12, 6]]) a.set(x, y, 'ch');
    a.paint(path([[10.5, 2], [12.5, 0.5]], 0.45), 'ch');
    a.paint(circle(9.5, 2.8, 2), 'rM', { outline: 'rD' });
    a.set(9, 2, 'w');
    return a;
  },
};

const pancakes = {
  id: 'pancake-stack',
  album,
  title: { fr: 'Pile de crêpes épaisses', en: 'Pancake stack' },
  access: 'pro',
  difficulty: 3,
  colors: {
    k: '#1B1A2E',
    t1: '#FF8FA8', t2: '#FFD6DE',
    pS: '#B8C0E0', pO: '#7A84B8',
    cD: '#8A4A12', cM: '#D98A3A', cL: '#F5C27A', cY: '#FFE3A8',
    sD: '#7A2E05', sM: '#E8820E', bu: '#FFE45C', bS: '#E8B820',
    bD: '#2A2A7A', bM: '#4F5CD8', rD: '#9E1530', rM: '#F0263F', gM: '#2FB85C', w: '#FFFFFF',
  },
  draw() {
    const a = new Art(48, 48);
    // Plate.
    a.paint(ellipse(24, 38, 22, 8.5), 'w', { outline: 'pO', dark: { color: 'pS', dx: 0, dy: 1, depth: 2 } });
    // Pancakes from bottom to top: each one a thick disc, the next one covers its top.
    for (let i = 0; i < 4; i++) {
      const cy = 33 - i * 5;
      const disc = union(ellipse(24, cy, 15.5 - (i % 2), 4.4), ellipse(24, cy - 3, 15.5 - (i % 2), 4.4), rect(9 + (i % 2), cy - 3, 39 - (i % 2), cy));
      a.paint(disc, 'cM', { outline: 'sD', dark: { color: 'cD', dx: 0, dy: 1 } });
    }
    const top = ellipse(24, 15, 15.5, 4.4);
    a.paint(top, 'cL', { outline: 'sD', light: { color: 'cY' } });
    // Syrup.
    const syrup = union(
      ellipse(24, 15.5, 8, 2.4),
      roundRect(14, 15, 16, 24, 1),
      roundRect(21, 16, 23, 30, 1),
      roundRect(30, 16, 32, 21, 1),
      roundRect(35, 15, 36, 26, 0.9),
    );
    a.paint(syrup, 'sM', { outline: 'sD', clip: (x, y) => a.get(x, y) !== null });
    a.set(18, 14, 'cY').set(19, 14, 'cY').set(22, 22, 'cY');
    // Butter.
    a.paint(roundRect(21, 10, 27, 14, 1), 'bu', { outline: 'bS' });
    a.paint(rect(22, 10, 26, 10), 'w');
    // Blueberries and strawberries on the plate.
    for (const [x, y] of [[8, 37], [11, 40], [40, 39], [37, 41]]) {
      a.paint(circle(x, y, 1.9), 'bM', { outline: 'bD' });
      a.set(x - 1, y - 1, 'w');
    }
    for (const [x, y] of [[44, 35], [5, 33]]) {
      a.paint(union(circle(x, y + 0.5, 2.2), poly([[x - 2, y + 1], [x + 2, y + 1], [x, y + 4.5]])), 'rM', { outline: 'rD' });
      a.paint(rect(x - 1.5, y - 2, x + 0.5, y - 2), 'gM');
    }
    // Gingham tablecloth.
    a.background((x, y) => {
      const cx = Math.floor(x / 4) % 2;
      const cy = Math.floor(y / 4) % 2;
      return cx && cy ? 't1' : cx || cy ? 't2' : 'w';
    });
    return a;
  },
};

const fruitBowl = {
  id: 'fruit-bowl',
  album,
  title: { fr: 'Corbeille de fruits', en: 'Fruit bowl' },
  access: 'pro',
  difficulty: 3,
  colors: {
    k: '#1B1A2E',
    bD: '#1E3A8A', bM: '#3D6BE6', bL: '#8FB0FF', w: '#FFFFFF',
    oD: '#C2500E', oM: '#FF8A1C', oL: '#FFC27A',
    aD: '#8E0F2A', aM: '#E8243C', aL: '#FF8A8A',
    yD: '#C29A00', yM: '#FFDD33', yL: '#FFF3A0',
    gD: '#4A1E7A', gM: '#8A4FD8', gL: '#C2A3FF',
    lD: '#1E6B2E', lM: '#46B84A', pM: '#B8DC4A', st: '#6B3A12',
  },
  draw() {
    const a = new Art(48, 40);
    // Grapes (back, left).
    const grapes = [[9, 16], [12.5, 15], [16, 16], [10.5, 19.5], [14, 19], [12, 22.5], [7, 19.5]];
    for (const [x, y] of grapes) a.paint(circle(x, y, 2.4), sphere(x, y, 2.4, 2.4, ['gD', 'gM', 'gL'], { cuts: [0.3, 0.85] }), { outline: 'gD' });
    a.paint(path([[12, 13], [13, 10], [15, 8.5]], 0.6), 'st');
    a.paint(rotEllipse(17.5, 10.5, 3.2, 1.6, -20), 'lM', { outline: 'lD' });
    // Banana (back, right).
    const banana = taper([[22, 17], [28, 12.5], [35, 11.5], [41, 14], [44, 18]], [1.2, 2.6, 3, 2.6, 1.2]);
    a.paint(banana, 'yM', { outline: 'yD', light: { color: 'yL', dx: 0, dy: 1 } });
    a.paint(rect(44, 18, 45, 19), 'st');
    a.paint(rect(21, 17, 22, 18), 'st');
    // Pear.
    a.paint(union(circle(34, 21, 5.2), circle(33.5, 15.5, 3.2)), 'pM', { outline: 'lD', light: { color: 'yL' } });
    a.paint(path([[33.5, 12.5], [34.5, 10]], 0.5), 'st');
    // Apple and orange in front.
    a.paint(circle(16, 24, 6.2), sphere(16, 24, 6.2, 6.2, ['aD', 'aM', 'aL'], { cuts: [0.3, 0.85] }), { outline: 'aD' });
    a.paint(path([[16, 18.5], [17, 16.5]], 0.5), 'st');
    a.paint(rotEllipse(19.5, 17.5, 2.6, 1.3, -20), 'lM', { outline: 'lD' });
    a.paint(circle(26, 24.5, 6.8), sphere(26, 24.5, 6.8, 6.8, ['oD', 'oM', 'oL'], { cuts: [0.3, 0.85] }), { outline: 'oD' });
    a.set(26, 18, 'lD').set(27, 18, 'lM');
    // Bowl.
    const bowl = inter(ellipse(24, 26, 21, 13), (x, y) => y >= 26);
    a.paint(bowl, 'bM', { outline: 'bD', light: { color: 'bL', depth: 2 } });
    a.paint(ellipse(24, 26.5, 21, 2), 'bL', { outline: 'bD', clip: (x, y) => y >= 26 });
    a.paint(rect(16, 38, 32, 39), 'bD');
    for (const x of [12, 19, 26, 33]) a.paint(inter(bowl, circle(x + 1, 32, 1.6)), 'w');
    return a;
  },
};

export const KITCHEN = [cupcake, avocado, donut, teapot, iceCream, pancakes, fruitBowl];
