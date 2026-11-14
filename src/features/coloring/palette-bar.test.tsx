/**
 * @jest-environment ./jest/skia-environment.js
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { createTranslator } from '@/features/i18n';

import { tinyArtwork } from './__fixtures__/tiny-artwork';
import { PaletteBar, swatchLabel, swatchScrollOffset } from './palette-bar';

const mockLocales = jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US' }]);
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);

const artwork = tinyArtwork();

function Subject({
  active = 1,
  onSelect = jest.fn(),
  colorblind = false,
  leftHanded = false,
}: {
  active?: number;
  onSelect?: (i: number) => void;
  colorblind?: boolean;
  leftHanded?: boolean;
}) {
  return (
    <PaletteBar
      colorblind={colorblind}
      leftHanded={leftHanded}
      colors={artwork.palette.colors}
      colorCounts={artwork.colorCounts}
      colorFilled={[20, 3, 0]}
      revision={0}
      activeColor={active}
      onSelect={onSelect}
    />
  );
}

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  jest.clearAllMocks();
});

describe('PaletteBar', () => {
  it('labels every swatch with its number and progress, finished colors as done', async () => {
    await render(<Subject />);
    expect(screen.getByRole('button', { name: 'Color 1, done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Color 2, 3 of 32 cells' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Color 3, 0 of 4 cells' })).toBeTruthy();
    expect(screen.getByLabelText('Palette')).toBeTruthy();
  });

  it('marks the active swatch as selected and shows a check on finished colors', async () => {
    await render(<Subject active={1} />);
    expect(screen.getByRole('button', { name: 'Color 2, 3 of 32 cells' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Color 3, 0 of 4 cells' })).not.toBeSelected();
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('selects a color on press, with a selection haptic only when enabled', async () => {
    const onSelect = jest.fn();
    await render(<Subject onSelect={onSelect} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Color 3, 0 of 4 cells' }));
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    // The generic press impact is replaced by the selection haptic.
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, haptics: false } });
    await fireEvent.press(screen.getByRole('button', { name: 'Color 1, done' }));
    expect(onSelect).toHaveBeenLastCalledWith(0);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('names the colors in colorblind mode (labels and active color caption)', async () => {
    await render(<Subject colorblind active={1} />);
    expect(screen.getByRole('button', { name: 'Color 1, dark blue, done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Color 2, pink, 3 of 32 cells' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Color 3, yellow, 0 of 4 cells' })).toBeTruthy();
    expect(screen.getByText('Color 2: pink', { includeHiddenElements: true })).toBeTruthy();
    // Symbols replace the numbers.
    expect(screen.queryByText('2')).toBeNull();
  });

  it('lays the swatches out from the right in left-handed mode', async () => {
    await render(<Subject leftHanded />);
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string);
    expect(names).toEqual(['Color 3, 0 of 4 cells', 'Color 2, 3 of 32 cells', 'Color 1, done']);
  });

  it('is translated into French', async () => {
    mockLocales.mockReturnValue([{ languageCode: 'fr', languageTag: 'fr-FR' }]);
    await render(<Subject />);
    expect(screen.getByRole('button', { name: 'Couleur 2, 3 cases sur 32' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Couleur 1, terminée' })).toBeTruthy();
    mockLocales.mockReturnValue([{ languageCode: 'en', languageTag: 'en-US' }]);
  });
});

describe('swatch helpers', () => {
  it('builds labels and centers the active swatch', () => {
    const t = createTranslator('en');
    expect(swatchLabel(t, 4, 10, 10)).toBe('Color 4, done');
    expect(swatchLabel(t, 4, 2, 10)).toBe('Color 4, 2 of 10 cells');
    expect(swatchLabel(t, 4, 2, 10, 'light blue')).toBe('Color 4, light blue, 2 of 10 cells');
    expect(swatchLabel(createTranslator('fr'), 4, 10, 10, 'bleu clair')).toBe('Couleur 4, bleu clair, terminée');
    expect(swatchScrollOffset(0, 400)).toBe(0);
    expect(swatchScrollOffset(10, 400)).toBeGreaterThan(swatchScrollOffset(9, 400));
    // Reversed: the last color sits in the first slot.
    expect(swatchScrollOffset(39, 400, true, 40)).toBe(0);
    expect(swatchScrollOffset(0, 400, true, 40)).toBe(swatchScrollOffset(39, 400));
  });
});
