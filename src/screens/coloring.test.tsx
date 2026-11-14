/**
 * @jest-environment ./jest/skia-environment.js
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import * as registry from '@/features/artwork/registry';
import { getArtwork } from '@/features/artwork/registry';
import { DEFAULT_ENTITLEMENTS } from '@/features/entitlements/can-access';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { bitsetToBase64, createBitset, setBit } from '@/lib/bitset';
import { createEnvelope, StorageKeys } from '@/lib/storage';
import { canvasThemes } from '@/theme';

import { ColoringScreen } from './coloring';

jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);
jest.mock('@/features/coloring/canvas/glyph-atlas', () => ({
  createNumberAtlas: (count: number) => ({ image: { dispose: () => undefined }, count, spritePx: 96, columns: 8 }),
}));
jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    Stack: { Screen: () => null },
    Redirect: ({ href }: { href: unknown }) => <Text testID="redirect">{JSON.stringify(href)}</Text>,
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

async function renderScreen(id: string) {
  await render(
    <GestureHandlerRootView>
      <ColoringScreen artworkId={id} />
    </GestureHandlerRootView>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  useProgressStore.setState({ index: {}, hydrated: true });
});

describe('ColoringScreen', () => {
  it('opens on the first color with the palette', async () => {
    await renderScreen('tabby-cat');
    expect(screen.getByLabelText('Palette')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Color 1, 0 of \d+ cells$/ })).toBeSelected();
    expect(screen.getByLabelText(/0% colored/)).toBeTruthy();
  });

  it('restores saved progress and shows the end screen for a finished artwork', async () => {
    const artwork = getArtwork('tabby-cat')!;
    const bits = createBitset(artwork.cells.length);
    artwork.cells.forEach((v, i) => {
      if (v) setBit(bits, i);
    });
    await AsyncStorage.setItem(
      StorageKeys.progress('tabby-cat'),
      JSON.stringify(createEnvelope({ filled: bitsetToBase64(bits) }, 1, 0)),
    );
    await renderScreen('tabby-cat');
    expect(screen.queryByLabelText('Palette')).toBeNull();
    expect(screen.getByRole('button', { name: 'Color the next artwork' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to the library' })).toBeTruthy();
  });

  it('Find locates a cell of the active color and announces it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await renderScreen('tabby-cat');
    await fireEvent.press(screen.getByRole('button', { name: 'Find a cell of color 1' }));
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/^Cell found: row \d+, column \d+\.$/));
    announce.mockRestore();
  });

  it('shows color names and symbols in colorblind mode', async () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, colorblindSymbols: true } });
    await renderScreen('tabby-cat');
    const first = screen.getByRole('button', { name: /^Color 1, [a-z ]+, 0 of \d+ cells$/ });
    expect(first).toBeSelected();
  });

  it('never opens a locked artwork: redirects to the shop (deep-link guard)', async () => {
    const real = getArtwork('tabby-cat');
    if (!real) throw new Error('fixture missing');
    const spy = jest.spyOn(registry, 'getArtwork').mockImplementation((id) => (id === 'tabby-cat' ? { ...real, access: 'pro' } : undefined));
    useEntitlementsStore.setState({ entitlements: DEFAULT_ENTITLEMENTS });
    await renderScreen('tabby-cat');
    expect(screen.queryByLabelText('Palette')).toBeNull();
    expect(JSON.parse(screen.getByTestId('redirect').props.children)).toEqual({ pathname: '/shop', params: { reason: 'pro' } });

    useEntitlementsStore.setState({ entitlements: { pro: true, packs: [], source: 'mock' } });
    await renderScreen('tabby-cat');
    expect(screen.getByLabelText('Palette')).toBeTruthy();
    spy.mockRestore();
  });

  it('applies the Neon canvas theme when the pack is owned, and not when turned off', async () => {
    const backdrop = () => {
      const style = [screen.getByTestId('pixel-canvas').props.style].flat(3);
      return style.find((s: { backgroundColor?: string } | null) => s?.backgroundColor)?.backgroundColor;
    };
    useEntitlementsStore.setState({ entitlements: DEFAULT_ENTITLEMENTS });
    await renderScreen('tabby-cat');
    expect(backdrop()).toBeUndefined();

    useEntitlementsStore.setState({ entitlements: { pro: false, packs: ['neon'], source: 'mock' } });
    await renderScreen('tabby-cat');
    expect(backdrop()).toBe(canvasThemes.neon.backdrop);

    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, neonTheme: false } });
    await renderScreen('tabby-cat');
    expect(backdrop()).toBeUndefined();
    useEntitlementsStore.setState({ entitlements: DEFAULT_ENTITLEMENTS });
  });
});
