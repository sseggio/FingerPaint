import { colorName, hexToHsl } from './color-name';

describe('colorName', () => {
  it.each([
    ['#000000', 'black', 'noir'],
    ['#FFFFFF', 'white', 'blanc'],
    ['#808080', 'gray', 'gris'],
    ['#D0D0D0', 'light gray', 'gris clair'],
    ['#FF0000', 'red', 'rouge'],
    ['#8B0000', 'dark red', 'rouge foncé'],
    ['#FF8A3D', 'orange', 'orange'],
    ['#FFC93C', 'yellow', 'jaune'],
    ['#2ED3A0', 'green', 'vert'],
    ['#006400', 'dark green', 'vert foncé'],
    ['#3DB8FF', 'blue', 'bleu'],
    ['#ADD8E6', 'light blue', 'bleu clair'],
    ['#000080', 'dark blue', 'bleu foncé'],
    ['#7B5CFF', 'indigo', 'indigo'],
    ['#FF3D7F', 'pink', 'rose'],
    ['#FFB6C1', 'light pink', 'rose clair'],
    ['#8B4513', 'brown', 'marron'],
    ['#F5DEB3', 'beige', 'beige'],
    ['#40E0D0', 'turquoise', 'turquoise'],
    ['#800080', 'dark purple', 'pourpre foncé'],
  ])('%s → %s / %s', (hex, en, fr) => {
    expect(colorName(hex, 'en')).toBe(en);
    expect(colorName(hex, 'fr')).toBe(fr);
  });

  it('accepts short and lowercase hex, rejects invalid input', () => {
    expect(colorName('#f00', 'en')).toBe('red');
    expect(() => colorName('nope', 'en')).toThrow();
  });

  it('computes HSL', () => {
    expect(hexToHsl('#FF0000')).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(hexToHsl('#00FF00').h).toBe(120);
    expect(hexToHsl('#0000FF').h).toBe(240);
    expect(hexToHsl('#808080').s).toBe(0);
  });
});
