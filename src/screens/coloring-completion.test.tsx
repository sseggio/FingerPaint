/**
 * @jest-environment ./jest/skia-environment.js
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { VIEWPORT_PADDING } from '@/features/coloring/canvas/use-viewport';
import { getArtwork } from '@/features/artwork/registry';
import { useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';
import { bitsetToBase64, createBitset, setBit } from '@/lib/bitset';
import { fitViewport } from '@/lib/geometry';
import { REPLAY_DURATION_MS, REPLAY_POP_MS } from '@/lib/replay';
import { createEnvelope, StorageKeys } from '@/lib/storage';

import { ColoringScreen } from './coloring';

jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);
jest.mock('@/features/coloring/canvas/glyph-atlas', () => ({
  createNumberAtlas: (count: number) => ({ image: { dispose: () => undefined }, count, spritePx: 96, columns: 8 }),
}));
const mockReducedMotion = jest.fn(() => false);
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => mockReducedMotion() };
});
jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  Redirect: () => null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

const ID = 'tabby-cat';
const artwork = getArtwork(ID)!;
const VIEW = { width: 390, height: 600 };
/** The one cell left to color. */
const LAST = artwork.cells.findIndex((v) => v !== 0);

/** Stores the artwork with every cell filled but `LAST` (or all of them). */
async function storeProgress(complete: boolean) {
  const bits = createBitset(artwork.cells.length);
  artwork.cells.forEach((v, i) => {
    if (v && (complete || i !== LAST)) setBit(bits, i);
  });
  await AsyncStorage.setItem(StorageKeys.progress(ID), JSON.stringify(createEnvelope({ filled: bitsetToBase64(bits) }, 1, 0)));
}

/** Fake timers throughout: the replay runs on requestAnimationFrame and Date.now. */
async function flush() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function open(replay?: string) {
  await render(
    <GestureHandlerRootView>
      <ColoringScreen artworkId={ID} replay={replay} />
    </GestureHandlerRootView>,
  );
  await flush();
  await act(async () => {
    await fireEvent(screen.getByTestId('pixel-canvas'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...VIEW } } });
  });
}

/** Taps the last cell (view fitted on the grid). */
async function fillLastCell() {
  const fit = fitViewport(artwork, VIEW, VIEWPORT_PADDING);
  const p = {
    x: fit.tx + ((LAST % artwork.width) + 0.5) * fit.scale,
    y: fit.ty + (Math.floor(LAST / artwork.width) + 0.5) * fit.scale,
  };
  fireGestureHandler(getByGestureTestId('fill-tap'), [
    { state: State.BEGAN, ...p },
    { state: State.ACTIVE, ...p },
    { state: State.END, ...p },
  ]);
  await flush();
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const skipButton = () => screen.queryByRole('button', { name: 'Skip the animation' });
const card = () => screen.queryByRole('button', { name: 'Back to the library' });
const confetti = () => screen.queryByTestId('confetti', { includeHiddenElements: true });

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockReducedMotion.mockReturnValue(false);
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
  useProgressStore.setState({ index: {}, hydrated: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('completion replay (F18)', () => {
  it('replays the coloring, then pops, plays the success haptic once, drops confetti and shows the card', async () => {
    await storeProgress(false);
    await open();
    await fillLastCell();
    // Replay running: no card, no confetti, no haptic yet; a tap anywhere skips it.
    expect(skipButton()).toBeTruthy();
    expect(card()).toBeNull();
    expect(confetti()).toBeNull();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Palette')).toBeNull();

    await advance(REPLAY_DURATION_MS + 50);
    expect(skipButton()).toBeTruthy(); // the pop is still running
    await advance(REPLAY_POP_MS + 50);
    expect(skipButton()).toBeNull();
    expect(card()).toBeTruthy();
    expect(confetti()).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');

    // Nothing starts again afterwards.
    await advance(10_000);
    expect(skipButton()).toBeNull();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('a tap during the replay skips it: finished at once, then the celebration', async () => {
    await storeProgress(false);
    await open();
    await fillLastCell();
    await fireEvent.press(skipButton()!);
    expect(skipButton()).toBeNull();
    expect(card()).toBeTruthy();
    expect(confetti()).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('with reduce motion: no replay, the finished image and the card right away (no confetti)', async () => {
    mockReducedMotion.mockReturnValue(true);
    await storeProgress(false);
    await open();
    await fillLastCell();
    expect(skipButton()).toBeNull();
    expect(card()).toBeTruthy();
    expect(confetti()).toBeNull();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    // Nothing to watch again without motion.
    expect(screen.queryByRole('button', { name: 'Watch the coloring of this artwork again' })).toBeNull();
  });

  it('"Watch again" replays a finished artwork without confetti or haptic', async () => {
    await storeProgress(true);
    await open();
    expect(card()).toBeTruthy();
    expect(skipButton()).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Watch the coloring of this artwork again' }));
    expect(skipButton()).toBeTruthy();
    expect(card()).toBeNull();
    await fireEvent.press(skipButton()!);
    expect(card()).toBeTruthy();
    expect(confetti()).toBeNull();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('opens a finished artwork straight into its replay when asked from "My artworks"', async () => {
    await storeProgress(true);
    await open('1');
    expect(skipButton()).toBeTruthy();
    await advance(REPLAY_DURATION_MS + 50);
    // No pop for a replay asked later: it ends with the replay itself.
    expect(skipButton()).toBeNull();
    expect(card()).toBeTruthy();
    expect(confetti()).toBeNull();
  });
});
