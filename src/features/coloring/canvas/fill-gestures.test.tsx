/**
 * @jest-environment ./jest/skia-environment.js
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { createGestureController, fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { toArtwork } from '@/lib/artwork/codec';

import { createPerfArtworkSource } from './__fixtures__/perf-artwork';
import { createColorPixels } from './layers';
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
