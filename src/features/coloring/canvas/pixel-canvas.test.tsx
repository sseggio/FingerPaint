/**
 * @jest-environment ./jest/skia-environment.js
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { toArtwork } from '@/lib/artwork/codec';
import { REPLAY_DURATION_MS, REPLAY_POP_MS } from '@/lib/replay';

import { createPerfArtworkSource } from './__fixtures__/perf-artwork';
import { createColorPixels } from './layers';
import { createRef } from 'react';

import { PixelCanvas, type PixelCanvasHandle, type ReplayRequest } from './pixel-canvas';

jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);
// CanvasKit has no system fonts: stand in for the pre-rendered number texture.
const mockAtlasDispose = jest.fn();
jest.mock('./glyph-atlas', () => ({
  createNumberAtlas: (count: number) => ({ image: { dispose: mockAtlasDispose }, count, spritePx: 96, columns: 8 }),
}));

const artwork = toArtwork(createPerfArtworkSource());

/** Host element types in the rendered tree (Skia nodes render as `sk*` hosts under the mock). */
function hostTypes(): string[] {
  const types: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const { type, children } = node as { type?: unknown; children?: unknown[] | null };
    if (typeof type === 'string') types.push(type);
    children?.forEach(walk);
  };
  const json = screen.toJSON();
  (Array.isArray(json) ? json : json ? [json] : []).forEach(walk);
  return types;
}

function Subject({
  revision = 0,
  activeColor = null,
  largeNumbers = false,
}: {
  revision?: number;
  activeColor?: number | null;
  largeNumbers?: boolean;
}) {
  return (
    <GestureHandlerRootView>
      <PixelCanvas
        artwork={artwork}
        colorPixels={createColorPixels(artwork.width, artwork.height)}
        colorRevision={revision}
        activeColor={activeColor}
        largeNumbers={largeNumbers}
        onFill={activeColor === null ? undefined : () => undefined}
        accessibilityLabel="Artwork"
      />
    </GestureHandlerRootView>
  );
}

describe('PixelCanvas (Skia mock)', () => {
  it('renders the 256×256 fixture once measured: two layers, grid and numbers', async () => {
    const { rerender } = await render(<Subject />);
    const canvas = screen.getByLabelText('Artwork');
    // Nothing is drawn before the size is known.
    expect(hostTypes()).not.toContain('skImage');

    await act(async () => {
      await fireEvent(canvas, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } });
    });
    const types = hostTypes();
    expect(types.filter((t) => t === 'skImage')).toHaveLength(2);
    expect(types).toEqual(expect.arrayContaining(['skGroup', 'skPath', 'skAtlas']));

    await rerender(<Subject revision={1} />);
    expect(screen.getByLabelText('Artwork')).toBeTruthy();
  });

  it('disposes the previous glyph atlas when it is rebuilt, and the last one on unmount', async () => {
    mockAtlasDispose.mockClear();
    const { rerender, unmount } = await render(<Subject />);
    await rerender(<Subject revision={1} />);
    expect(mockAtlasDispose).not.toHaveBeenCalled();
    await rerender(<Subject largeNumbers />);
    expect(mockAtlasDispose).toHaveBeenCalledTimes(1);
    await unmount();
    expect(mockAtlasDispose).toHaveBeenCalledTimes(2);
  });

  it('adds the active-color highlight and the drag preview when coloring', async () => {
    await render(<Subject activeColor={3} />);
    await act(async () => {
      await fireEvent(screen.getByLabelText('Artwork'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
      });
    });
    const types = hostTypes();
    // Background, highlight mask, color layer.
    expect(types.filter((t) => t === 'skImage')).toHaveLength(3);
    // Fill preview (the active color only: nothing else is pending) + grid.
    expect(types.filter((t) => t === 'skPath')).toHaveLength(2);
  });

  it('hides the numbers at the overview and shows them once zoomed in by "Find" (F17)', async () => {
    const ref = createRef<PixelCanvasHandle>();
    await render(
      <GestureHandlerRootView>
        <PixelCanvas
          ref={ref}
          artwork={artwork}
          colorPixels={createColorPixels(artwork.width, artwork.height)}
          colorRevision={0}
          activeColor={0}
          onFill={() => undefined}
          accessibilityLabel="Artwork"
        />
      </GestureHandlerRootView>,
    );
    await act(async () => {
      await fireEvent(screen.getByLabelText('Artwork'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
      });
    });
    /** Opacity of the group wrapping the number atlas. */
    const numbersOpacity = () => {
      const found: number[] = [];
      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const n = node as { type?: unknown; props?: { opacity?: { value: number } }; children?: unknown[] | null };
        if (n.type === 'skGroup' && n.children?.some((c) => (c as { type?: unknown }).type === 'skAtlas')) {
          found.push(n.props?.opacity?.value ?? -1);
        }
        n.children?.forEach(walk);
      };
      const json = screen.toJSON();
      (Array.isArray(json) ? json : [json]).forEach(walk);
      return found;
    };
    expect(numbersOpacity()).toEqual([0]);
    await act(async () => {
      ref.current?.focusCell(60 * artwork.width + 60, false);
    });
    expect(numbersOpacity()).toEqual([1]);
  });

  it('moves the view to a cell for the Find hint, at any zoom, with or without motion', async () => {
    const ref = createRef<PixelCanvasHandle>();
    await render(
      <GestureHandlerRootView>
        <PixelCanvas
          ref={ref}
          artwork={artwork}
          colorPixels={createColorPixels(artwork.width, artwork.height)}
          colorRevision={0}
          activeColor={0}
          onFill={() => undefined}
          accessibilityLabel="Artwork"
        />
      </GestureHandlerRootView>,
    );
    // Not measured yet: nothing to move.
    expect(ref.current?.getViewCenter()).toBeNull();
    expect(ref.current?.focusCell(0, false)).toBe(false);

    await act(async () => {
      await fireEvent(screen.getByLabelText('Artwork'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
      });
    });
    // Fitted: the view is centered on the grid.
    expect(ref.current?.getViewCenter()).toEqual({ x: artwork.width / 2, y: artwork.height / 2 });

    const index = 100 * artwork.width + 20;
    await act(async () => {
      expect(ref.current?.focusCell(index, false)).toBe(true);
    });
    const center = ref.current!.getViewCenter()!;
    expect(center.x).toBeCloseTo(20.5);
    expect(center.y).toBeCloseTo(100.5);
    // The pulsing marker is drawn on top.
    expect(hostTypes()).toContain('skRect');
    expect(ref.current?.focusCell(-1, true)).toBe(false);
    expect(ref.current?.focusCell(artwork.width * artwork.height, true)).toBe(false);
  });

  it('replay (F18): bare drawing only (no numbers, grid or preview), skippable once, then back to normal', async () => {
    const ref = createRef<PixelCanvasHandle>();
    const onReplayEnd = jest.fn();
    const order = Array.from(artwork.cells.keys()).filter((i) => artwork.cells[i] !== 0);
    const Replaying = ({ replay }: { replay: ReplayRequest | null }) => (
      <GestureHandlerRootView>
        <PixelCanvas
          ref={ref}
          artwork={artwork}
          colorPixels={createColorPixels(artwork.width, artwork.height)}
          colorRevision={0}
          replay={replay}
          onReplayEnd={onReplayEnd}
          smoothFit
          accessibilityLabel="Artwork"
        />
      </GestureHandlerRootView>
    );
    const replay: ReplayRequest = { id: 7, order, pop: true };
    const { rerender } = await render(<Replaying replay={replay} />);
    await act(async () => {
      await fireEvent(screen.getByLabelText('Artwork'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } },
      });
    });
    let types = hostTypes();
    // Grayscale background + replayed color layer; no atlas, no grid, no preview path.
    expect(types.filter((t) => t === 'skImage')).toHaveLength(2);
    expect(types).not.toContain('skAtlas');
    expect(types).not.toContain('skPath');

    await act(async () => ref.current?.skipReplay());
    expect(onReplayEnd).toHaveBeenCalledWith(7, true);
    await act(async () => ref.current?.skipReplay());
    expect(onReplayEnd).toHaveBeenCalledTimes(1);

    await rerender(<Replaying replay={null} />);
    types = hostTypes();
    expect(types).toContain('skAtlas');
    expect(types).toContain('skPath');
    // Without a replay, skipping does nothing.
    await act(async () => ref.current?.skipReplay());
    expect(onReplayEnd).toHaveBeenCalledTimes(1);
  });

  it('replay (F18): ends after the fixed duration and its pop, even if the canvas is resized meanwhile', async () => {
    jest.useFakeTimers();
    try {
      const onReplayEnd = jest.fn();
      const order = Array.from(artwork.cells.keys()).filter((i) => artwork.cells[i] !== 0);
      const replay: ReplayRequest = { id: 3, order, pop: true };
      await render(
        <GestureHandlerRootView>
          <PixelCanvas
            artwork={artwork}
            colorPixels={createColorPixels(artwork.width, artwork.height)}
            colorRevision={0}
            replay={replay}
            onReplayEnd={onReplayEnd}
            smoothFit
            accessibilityLabel="Artwork"
          />
        </GestureHandlerRootView>,
      );
      const layout = async (height: number) =>
        act(async () => {
          await fireEvent(screen.getByLabelText('Artwork'), 'layout', {
            nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
          });
        });
      const advance = async (ms: number) =>
        act(async () => {
          await jest.advanceTimersByTimeAsync(ms);
        });
      await layout(600);
      await advance(REPLAY_DURATION_MS / 2);
      // The palette leaves: the canvas grows. The replay goes on, it does not restart.
      await layout(760);
      await advance(REPLAY_DURATION_MS / 2 + 50);
      expect(onReplayEnd).not.toHaveBeenCalled(); // popping
      await advance(REPLAY_POP_MS);
      expect(onReplayEnd).toHaveBeenCalledTimes(1);
      expect(onReplayEnd).toHaveBeenCalledWith(3, false);
    } finally {
      jest.useRealTimers();
    }
  });
});

