import { colors } from '@/theme/tokens';

import { contrastRatio, hexToRgb, readableTextOn } from './color';

describe('color utils', () => {
  it('parses hex colors', () => {
    expect(hexToRgb('#FF3D7F')).toEqual([255, 61, 127]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(() => hexToRgb('nope')).toThrow();
  });

  it('computes contrast ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('picks readable text color', () => {
    expect(readableTextOn('#FFC93C')).toBe('#000000');
    expect(readableTextOn('#1B1A2E')).toBe('#FFFFFF');
  });

  it.each(['light', 'dark'] as const)('%s theme ink passes WCAG AA on background', (scheme) => {
    const c = colors[scheme];
    expect(contrastRatio(c.ink, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.ink, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.inkSecondary, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.primaryText, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.primaryText, c.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
