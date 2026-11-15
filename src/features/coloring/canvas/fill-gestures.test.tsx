/**
 * @jest-environment ./jest/skia-environment.js
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { createGestureController, fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { toArtwork } from '@/lib/artwork/codec';

import { createPerfArtworkSource } from './__fixtures__/perf-artwork';
import { createColorPixels, paintCells } from './layers';
import { PixelCanvas, type PixelCanvasHandle } from './pixel-canvas';

jest.mock('@shopify/react-native-skia', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use import
  require('@shopify/react-native-skia/lib/commonjs/mock').Mock((globalThis as { CanvasKit?: unknown }).CanvasKit),
);
jest.mock('./glyph-atlas', () => ({
  createNumberAtlas: (count: number) => ({ image: { dispose: () => undefined }, count, spritePx: 96, columns: 8 }),
}));

const artwork = toArtwork(createPerfArtworkSource());
const VIEW = { width: 390, height: 700 };
/** The view center shows the grid center once fitted. */
const CENTER = { x: VIEW.width / 2, y: VIEW.height / 2 };
const centerIndex = Math.floor(artwork.height / 2) * artwork.width + Math.floor(artwork.width / 2);
/** Active color = the color of the center cell (0-based). */
const activeColor = artwork.cells[centerIndex] - 1;

type Point = { x: number; y: number };

/** `scheduleOnRN` hops to the JS runtime asynchronously (even under Jest). */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function setup({ dragToFill = true }: { dragToFill?: boolean } = {}) {
  const onFill = jest.fn();
  const onFillStart = jest.fn();
  const ref = createRef<PixelCanvasHandle>();
  await render(
    <GestureHandlerRootView>
      <PixelCanvas
        ref={ref}
        artwork={artwork}
        colorPixels={createColorPixels(artwork.width, artwork.height)}
        colorRevision={0}
        activeColor={activeColor}
        onFill={onFill}
        onFillStart={onFillStart}
        dragToFill={dragToFill}
        accessibilityLabel="Artwork"
      />
    </GestureHandlerRootView>,
  );
  await act(async () => {
    await fireEvent(screen.getByLabelText('Artwork'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...VIEW } },
    });
  });
  return {
    onFill,
    onFillStart,
    center: () => ref.current!.getViewCenter()!,
    /** Zooms in on the grid center (no animation) so that there is room to pan. */
    zoomIn: async () => {
      await act(async () => {
        ref.current!.focusCell(centerIndex, false);
      });
    },
  };
}

async function tap(p: Point) {
  fireGestureHandler(getByGestureTestId('fill-tap'), [
    { state: State.BEGAN, ...p },
    { state: State.ACTIVE, ...p },
    { state: State.END, ...p },
  ]);
  await flush();
}

/** Long press at `points[0]` (the pan activates after the delay), then slides along the rest. */
function longPressEvents(points: (Point & { numberOfPointers?: number })[]) {
  const [first, ...rest] = points;
  return [
    { state: State.BEGAN, ...first, translationX: 0, translationY: 0 },
    { state: State.ACTIVE, ...first, translationX: 0, translationY: 0 },
    ...rest.map((p) => ({ state: State.ACTIVE, numberOfPointers: 1, ...p })),
    { state: State.END, ...points[points.length - 1] },
  ];
}

/** A one-finger horizontal pan of `dx` points from the center, released without momentum. */
function panEvents(dx: number) {
  const end = { x: CENTER.x + dx, y: CENTER.y };
  return [
    { state: State.BEGAN, ...CENTER },
    { state: State.ACTIVE, ...CENTER, translationX: 0, translationY: 0 },
    { state: State.ACTIVE, ...end, translationX: dx, translationY: 0 },
    { state: State.END, ...end, translationX: dx, translationY: 0, velocityX: 0, velocityY: 0 },
  ];
}

describe('fill gestures (F15)', () => {
  it('fills the tapped cell', async () => {
    const { onFill, onFillStart } = await setup();
    await tap(CENTER);
    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith([centerIndex], 'tap');
    expect(onFillStart).not.toHaveBeenCalled();
  });

  it('long press: fills the cell under the finger, then the cells slid over, sent once on release', async () => {
    const { onFill, onFillStart } = await setup();
    fireGestureHandler(
      getByGestureTestId('fill-long-press'),
      longPressEvents([CENTER, { x: CENTER.x + 20, y: CENTER.y }, { x: CENTER.x + 60, y: CENTER.y }]),
    );
    await flush();
    expect(onFillStart).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledTimes(1);
    const [batch, source] = onFill.mock.calls[0] as [number[], string];
    expect(source).toBe('drag');
    expect(batch[0]).toBe(centerIndex);
    // Only cells of the active color, each once.
    expect(batch.every((i) => artwork.cells[i] === activeColor + 1)).toBe(true);
    expect(new Set(batch).size).toBe(batch.length);
  });

  it('long press: a second finger ends the stroke, later moves color nothing', async () => {
    const { onFill } = await setup();
    fireGestureHandler(
      getByGestureTestId('fill-long-press'),
      longPressEvents([
        CENTER,
        { x: CENTER.x, y: CENTER.y, numberOfPointers: 2 },
        { x: CENTER.x + 120, y: CENTER.y + 120, numberOfPointers: 2 },
      ]),
    );
    await flush();
    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith([centerIndex], 'drag');
  });

  it('long press does nothing when "fill by sliding after a long press" is off; taps still fill', async () => {
    const { onFill, onFillStart } = await setup({ dragToFill: false });
    fireGestureHandler(getByGestureTestId('fill-long-press'), longPressEvents([CENTER, { x: CENTER.x + 60, y: CENTER.y }]));
    await flush();
    expect(onFillStart).not.toHaveBeenCalled();
    expect(onFill).not.toHaveBeenCalled();
    await tap(CENTER);
    expect(onFill).toHaveBeenCalledWith([centerIndex], 'tap');
  });

  it('one finger pans the view, without filling', async () => {
    const { onFill, center, zoomIn } = await setup();
    await zoomIn();
    const before = center();
    fireGestureHandler(getByGestureTestId('viewport-pan'), panEvents(-40));
    await flush();
    expect(center().x).toBeGreaterThan(before.x);
    expect(center().y).toBeCloseTo(before.y);
    expect(onFill).not.toHaveBeenCalled();
  });

  it('the view stands still while continuous fill runs', async () => {
    const { center, zoomIn, onFillStart } = await setup();
    await zoomIn();
    const before = center();
    const fill = createGestureController(getByGestureTestId('fill-long-press'));
    fill.begin({ ...CENTER });
    fill.activate({ ...CENTER, translationX: 0, translationY: 0 });
    await flush();
    expect(onFillStart).toHaveBeenCalledTimes(1);
    fireGestureHandler(getByGestureTestId('viewport-pan'), panEvents(-40));
    await flush();
    expect(center().x).toBeCloseTo(before.x);
    fill.end({ ...CENTER });
  });

  it('a second finger ending a stroke pans with momentum again', async () => {
    const { center, zoomIn } = await setup();
    await zoomIn();
    const fill = createGestureController(getByGestureTestId('fill-long-press'));
    const pan = createGestureController(getByGestureTestId('viewport-pan'));
    fill.begin({ ...CENTER });
    pan.begin({ ...CENTER });
    fill.activate({ ...CENTER, translationX: 0, translationY: 0 });
    await flush();
    // The finger moves while filling: the pan is held (no momentum for this touch so far).
    pan.activate({ ...CENTER, changeX: 0, changeY: 0, numberOfPointers: 1 });
    pan.update({ x: CENTER.x - 20, y: CENTER.y, changeX: -20, changeY: 0, numberOfPointers: 1 });
    // A second finger lands: the stroke ends, both fingers pan the view.
    fill.update({ ...CENTER, numberOfPointers: 2 });
    fill.end({ ...CENTER });
    pan.update({ x: CENTER.x - 40, y: CENTER.y, changeX: -20, changeY: 0, numberOfPointers: 2 });
    await flush();
    const released = center();
    pan.end({ x: CENTER.x - 40, y: CENTER.y, velocityX: -2000, velocityY: 0, numberOfPointers: 2 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    // Momentum carries the view on after the release.
    expect(center().x).toBeGreaterThan(released.x + 0.5);
  });

  it('a long press started after the view began panning does not fill', async () => {
    const { onFill, onFillStart } = await setup();
    // The finger already moved past the slop: the view pans (still active, finger down).
    const pan = createGestureController(getByGestureTestId('viewport-pan'));
    pan.begin({ ...CENTER });
    pan.activate({ ...CENTER, changeX: 0, changeY: 0 });
    fireGestureHandler(getByGestureTestId('fill-long-press'), longPressEvents([CENTER, { x: CENTER.x + 60, y: CENTER.y }]));
    await flush();
    expect(onFillStart).not.toHaveBeenCalled();
    expect(onFill).not.toHaveBeenCalled();
  });
});

type HostProps = Record<string, unknown>;

/** Props of the host Skia nodes of `type` in the rendered tree. */
function hostProps(type: string): HostProps[] {
  const found: HostProps[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: unknown; props?: HostProps; children?: unknown[] | null };
    if (n.type === type && n.props) found.push(n.props);
    n.children?.forEach(walk);
  };
  const json = screen.toJSON();
  (Array.isArray(json) ? json : [json]).forEach(walk);
  return found;
}

type ValueOf<T> = { value: T };

/** Cells drawn by the fill preview (all colors), probed at the cell centers of `indices`. */
function previewed(indices: number[]): number[] {
  const paths = hostProps('skPath')
    .filter((p) => p.antiAlias === false)
    .map((p) => (p.path as ValueOf<{ contains(x: number, y: number): boolean }>).value);
  return indices.filter((i) =>
    paths.some((path) => path.contains((i % artwork.width) + 0.5, Math.floor(i / artwork.width) + 0.5)),
  );
}

/** The color layer image currently drawn (the last `skImage`, under the preview). */
function drawnLayer(): unknown {
  const images = hostProps('skImage');
  return (images[images.length - 1].image as ValueOf<unknown>).value;
}

describe('fill preview / color layer sync (F16)', () => {
  /** A canvas whose fills paint the color layer like the coloring session (revision bumped later). */
  async function setupSynced({ accept = true }: { accept?: boolean } = {}) {
    const pixels = createColorPixels(artwork.width, artwork.height);
    const onFill = jest.fn((batch: number[]) => {
      if (accept) paintCells(pixels, artwork, batch);
    });
    const ui = (revision: number) => (
      <GestureHandlerRootView>
        <PixelCanvas
          artwork={artwork}
          colorPixels={pixels}
          colorRevision={revision}
          activeColor={activeColor}
          onFill={onFill}
          accessibilityLabel="Artwork"
        />
      </GestureHandlerRootView>
    );
    const { rerender } = await render(ui(0));
    await act(async () => {
      await fireEvent(screen.getByLabelText('Artwork'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, ...VIEW } },
      });
    });
    return {
      onFill,
      /** The coloring session's coalesced revision bump (a frame or more later). */
      bump: async (revision: number) => {
        await rerender(ui(revision));
        await flush();
      },
    };
  }

  it('keeps the released stroke drawn until the color layer containing it is drawn', async () => {
    const { onFill, bump } = await setupSynced();
    fireGestureHandler(
      getByGestureTestId('fill-long-press'),
      longPressEvents([CENTER, { x: CENTER.x + 20, y: CENTER.y }, { x: CENTER.x + 60, y: CENTER.y }]),
    );
    await flush();
    const [batch] = onFill.mock.calls[0] as [number[]];
    const layerBefore = drawnLayer();
    // Finger lifted, cells painted in the buffer, but the new layer image is not drawn yet: the
    // preview still covers every cell of the stroke (no gray frame).
    expect(previewed(batch)).toEqual(batch);
    expect(drawnLayer()).toBe(layerBefore);
    await bump(1);
    // Same UI task: the new image is drawn and the preview is gone.
    expect(drawnLayer()).not.toBe(layerBefore);
    expect(previewed(batch)).toEqual([]);
  });

  it('draws the preview in the target color of the cells, opaque, without anti-aliasing', async () => {
    await setupSynced();
    const hex = artwork.palette.colors[activeColor].hex;
    const path = hostProps('skPath').find((p) => p.antiAlias === false && p.color === hex);
    expect(path).toBeDefined();
    expect(path?.opacity).toBeUndefined();
  });

  it('a tap is previewed at once and stays until its layer is drawn', async () => {
    const { bump } = await setupSynced();
    await tap(CENTER);
    expect(previewed([centerIndex])).toEqual([centerIndex]);
    await bump(1);
    expect(previewed([centerIndex])).toEqual([]);
  });

  it('cells refused by the session leave the preview without waiting for a layer', async () => {
    const { onFill } = await setupSynced({ accept: false });
    await tap(CENTER);
    expect(onFill).toHaveBeenCalledWith([centerIndex], 'tap');
    expect(previewed([centerIndex])).toEqual([]);
  });

  it('an unrelated layer drawn before the stroke is painted does not drop the preview', async () => {
    const { bump } = await setupSynced();
    const fill = createGestureController(getByGestureTestId('fill-long-press'));
    fill.begin({ ...CENTER });
    fill.activate({ ...CENTER, translationX: 0, translationY: 0 });
    await flush();
    // Still filling (nothing sent): a revision lands meanwhile.
    await bump(1);
    expect(previewed([centerIndex])).toEqual([centerIndex]);
    fill.end({ ...CENTER });
    await flush();
    expect(previewed([centerIndex])).toEqual([centerIndex]);
    await bump(2);
    expect(previewed([centerIndex])).toEqual([]);
  });
});
