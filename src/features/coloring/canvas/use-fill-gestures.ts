import { usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { addBatch, type PreviewState } from '@/lib/fill-preview';
import { DRAG_BATCH_MAX, emptyStroke, pendingCount, strokeTo, takeBatch, type StrokeState } from '@/lib/fill-stroke';
import { screenToCell, type Size } from '@/lib/geometry';
import { LONG_PRESS_FILL_GESTURE, TAP_GESTURE } from '@/lib/touch-intent';

export type FillSource = 'tap' | 'drag';

/** Receives cells to fill (row-major indices) on the JS runtime. */
export type FillHandler = (batch: number[], source: FillSource) => void;

/** Fade of the continuous-fill ring around the finger. */
const RING_IN = { duration: 120 };
const RING_OUT = { duration: 180 };

export interface FillGestureOptions {
  grid: Size;
  /** Row-major cell values (0 = empty), as a plain array for the UI runtime. */
  cells: number[];
  enabled: boolean;
  /** A long press starts continuous fill ("fill by sliding after a long press" setting). */
  longPressFill: boolean;
  /** 1-based palette value of the active color (0 = none). */
  activeValue: SharedValue<number>;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  /** True while continuous fill runs: the one-finger pan of the viewport then stands still. */
  filling: SharedValue<boolean>;
  /** True while the viewport pans: a long press can no longer start continuous fill. */
  panning: SharedValue<boolean>;
  /** Fill preview (F16): batches sent to the JS runtime stay drawn until the color layer shows them. */
  preview: SharedValue<PreviewState>;
  /**
   * Receives the batches on the JS runtime, with the id of their preview batch (-1 when nothing
   * is previewed, e.g. a tap on a cell of another color).
   */
  onBatch: (batch: number[], source: FillSource, id: number) => void;
  /** Continuous fill just started (light haptic on the JS side). */
  onFillStart: () => void;
}

/**
 * Tap-to-fill and continuous fill after a long press (see `@/lib/touch-intent`). Hit-testing
 * inverts the viewport transform on the UI thread; a continuous stroke accumulates its cells there
 * (deduplicated, gaps filled) and crosses to the JS runtime once, when the finger lifts (or every
 * DRAG_BATCH_MAX cells on a very long stroke): no per-frame `scheduleOnRN`, no React state during
 * the gesture. Correctness (wrong color, already filled) is decided on the JS side by the coloring
 * session; the UI side only keeps cells of the active color for the preview. Every batch sent
 * (taps included) is added to the fill preview in the same UI task, and stays drawn until the
 * color layer shows it (see `@/lib/fill-preview`, F16).
 */
export function useFillGestures({
  grid,
  cells,
  enabled,
  longPressFill,
  activeValue,
  scale,
  tx,
  ty,
  filling,
  panning,
  preview,
  onBatch,
  onFillStart,
}: FillGestureOptions) {
  const stroke = useSharedValue<StrokeState>(emptyStroke());
  /** Cell under the finger during continuous fill (row-major), -1 outside the grid. */
  const fingerCell = useSharedValue(-1);
  /** Opacity of the ring drawn around `fingerCell`. */
  const ring = useSharedValue(0);

  const cellAt = (x: number, y: number) => {
    'worklet';
    return screenToCell(x, y, { scale: scale.get(), tx: tx.get(), ty: ty.get() }, grid);
  };

  const extendTo = (x: number, y: number) => {
    'worklet';
    const cell = cellAt(x, y);
    const active = activeValue.get();
    fingerCell.set(cell ? cell.row * grid.width + cell.col : -1);
    stroke.modify((s) => {
      'worklet';
      if (cell) strokeTo(s, grid, cells, active, cell.col, cell.row);
      else s.last = -1;
      return s;
    }, true);
  };

  /** Moves cells to the preview batches (same UI task: the preview never loses them) and sends them. */
  const sendPreviewed = (batch: number[], source: FillSource) => {
    'worklet';
    // `get()` is the state object itself on the UI runtime: mutate it, then notify the readers.
    const id = addBatch(preview.get(), batch);
    preview.modify((p) => p, true);
    scheduleOnRN(onBatch, batch, source, id);
  };

  const send = () => {
    'worklet';
    const batch = takeBatch(stroke.get());
    if (!batch) return;
    stroke.modify((s) => s, true);
    sendPreviewed(batch, 'drag');
  };

  /** Ends continuous fill: the collected cells are kept and sent. */
  const finish = () => {
    'worklet';
    if (!filling.get()) return;
    filling.set(false);
    ring.set(withTiming(0, RING_OUT));
    send();
  };

  const tap = useTapGesture({
    testID: 'fill-tap',
    enabled,
    // Explicit fields: the Worklets plugin does not accept spreads in gesture configs.
    maxDuration: TAP_GESTURE.maxDuration,
    maxDistance: TAP_GESTURE.maxDistance,
    onActivate: (e) => {
      if (filling.get()) return;
      const cell = cellAt(e.x, e.y);
      if (!cell) return;
      const index = cell.row * grid.width + cell.col;
      if (cells[index] === 0) return;
      // A cell of the active color shows painted at once, like a stroke; another one is only
      // reported (wrong-color feedback).
      if (cells[index] === activeValue.get()) sendPreviewed([index], 'tap');
      else scheduleOnRN(onBatch, [index], 'tap', -1);
    },
  });

  // Activates once the finger has stayed within the slop for LONG_PRESS_MS (it fails as soon as
  // the finger moves farther first: that touch is a pan of the viewport).
  const longPress = usePanGesture({
    testID: 'fill-long-press',
    enabled: enabled && longPressFill,
    maxPointers: LONG_PRESS_FILL_GESTURE.maxPointers,
    activateAfterLongPress: LONG_PRESS_FILL_GESTURE.activateAfterLongPress,
    onActivate: (e) => {
      if (panning.get()) return;
      filling.set(true);
      stroke.set(emptyStroke());
      // The cell under the finger when the long press fires is filled right away.
      extendTo(e.x, e.y);
      ring.set(withTiming(1, RING_IN));
      scheduleOnRN(onFillStart);
    },
    onTouchesDown: (e) => {
      // A second finger lands: the user wants to zoom / pan, end the stroke.
      if (e.numberOfTouches > 1) finish();
    },
    onUpdate: (e) => {
      if (!filling.get()) return;
      if (e.numberOfPointers > 1) {
        finish();
        return;
      }
      extendTo(e.x, e.y);
      if (pendingCount(stroke.get()) >= DRAG_BATCH_MAX) send();
    },
    onFinalize: () => {
      finish();
    },
  });

  return { tap, longPress, stroke, fingerCell, ring };
}
