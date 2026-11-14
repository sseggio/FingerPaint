/**
 * @jest-environment ./jest/skia-environment.js
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { getArtwork } from '@/features/artwork/registry';
import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { bitsetToBase64, createBitset, setBit } from '@/lib/bitset';
import { createEnvelope, StorageKeys } from '@/lib/storage';

import { ColoringScreen } from './coloring';

jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);
jest.mock('@/features/coloring/canvas/glyph-atlas', () => ({
  createNumberAtlas: (count: number) => ({ image: {}, count, spritePx: 96, columns: 8 }),
}));
jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));
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
});
