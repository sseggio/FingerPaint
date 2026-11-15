/**
 * @jest-environment ./jest/skia-environment.js
 */
import { render, screen } from '@testing-library/react-native';
import { withSequence, withSpring } from 'react-native-reanimated';

import { createTranslator } from '@/features/i18n';
import type { PaletteColor } from '@/lib/artwork/types';

import { ColorProgress, colorProgressLabel, colorRatio, COLOR_DONE_HOLD_MS } from './color-progress';

const mockLocales = jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US' }]);
jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales() }));
const mockReducedMotion = jest.fn(() => false);
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useReducedMotion: () => mockReducedMotion(),
    withSpring: jest.fn(actual.withSpring),
    withSequence: jest.fn(actual.withSequence),
  };
});

const color: PaletteColor = { number: 3, hex: '#2ED3A0', rgb: [46, 211, 160], symbol: 'circle' };

function Subject({ filled, total = 40, name }: { filled: number; total?: number; name?: string }) {
  return <ColorProgress color={color} filled={filled} total={total} name={name} />;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReducedMotion.mockReturnValue(false);
});

describe('ColorProgress (F23)', () => {
  it('shows the active color, its counter and percent, exposed as a progress bar', async () => {
    await render(<Subject filled={12} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityLabel).toBe('Color 3 progress, 12 of 40 cells');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 40, now: 12 });
    expect(screen.getByText('Color 3')).toBeTruthy();
    expect(screen.getByText('12 / 40 · 30%')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('names the color in colorblind mode', async () => {
    await render(<Subject filled={12} name="mint green" />);
    expect(screen.getByText('Color 3 · mint green')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('Color 3 progress, mint green, 12 of 40 cells');
    // The symbol replaces the number in the dot.
    expect(screen.queryByText('3')).toBeNull();
  });

  it('springs the bar forward with each batch', async () => {
    const { rerender } = await render(<Subject filled={12} />);
    jest.mocked(withSpring).mockClear();
    await rerender(<Subject filled={20} />);
    expect(withSpring).toHaveBeenCalledWith(0.5, expect.any(Object));
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 40, now: 20 });
  });

  it('reaching 100 %: check, "Done!" and a pop of the bar', async () => {
    const { rerender } = await render(<Subject filled={39} />);
    expect(withSequence).not.toHaveBeenCalled();
    await rerender(<Subject filled={40} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityLabel).toBe('Color 3 done, 40 of 40 cells');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 40, now: 40 });
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.getByText('Done!')).toBeTruthy();
    expect(withSequence).toHaveBeenCalledTimes(1);
  });

  it('does not pop for a color that was already finished when shown', async () => {
    await render(<Subject filled={40} />);
    expect(screen.getByText('Done!')).toBeTruthy();
    expect(withSequence).not.toHaveBeenCalled();
  });

  it('with reduce motion: the bar jumps to its value, no spring, no pop', async () => {
    mockReducedMotion.mockReturnValue(true);
    const { rerender } = await render(<Subject filled={10} />);
    await rerender(<Subject filled={40} />);
    expect(withSpring).not.toHaveBeenCalled();
    expect(withSequence).not.toHaveBeenCalled();
    expect(screen.getByText('Done!')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 40, now: 40 });
  });

  it('is translated into French', async () => {
    mockLocales.mockReturnValue([{ languageCode: 'fr', languageTag: 'fr-FR' }]);
    await render(<Subject filled={12} />);
    expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('Progression de la couleur 3, 12 cases sur 40');
    expect(screen.getByText('12 / 40 · 30 %')).toBeTruthy();
    mockLocales.mockReturnValue([{ languageCode: 'en', languageTag: 'en-US' }]);
  });
});

describe('color progress helpers', () => {
  it('clamps the ratio and builds labels', () => {
    expect(colorRatio(0, 0)).toBe(1);
    expect(colorRatio(50, 40)).toBe(1);
    expect(colorRatio(10, 40)).toBe(0.25);
    const fr = createTranslator('fr');
    expect(colorProgressLabel(fr, 2, 5, 5, 'rose')).toBe('Couleur 2 terminée, rose, 5 cases sur 5');
    expect(COLOR_DONE_HOLD_MS).toBeGreaterThanOrEqual(500);
    expect(COLOR_DONE_HOLD_MS).toBeLessThanOrEqual(800);
  });
});
