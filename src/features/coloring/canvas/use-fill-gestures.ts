import { usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { reportWorkletError } from '@/features/diagnostics/report-worklet-error';
import { addBatch, type PreviewState } from '@/lib/fill-preview';
import { DRAG_BATCH_MAX, emptyStroke, pendingCount, strokeTo, type StrokeState } from '@/lib/fill-stroke';
import { screenToCell, type Size } from '@/lib/geometry';
import { LONG_PRESS_MS, longPressFillGestureConfig, tapGestureConfig } from '@/lib/touch-intent';

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
  /** Hold time (ms) before continuous fill starts ("delay before coloring by sliding", F23). */
  longPressMs?: number;
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
   * is previewed: taps).
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
 * session; the UI side only keeps cells of the active color for the preview. Every stroke batch
 * sent is added to the fill preview in the same UI task, and stays drawn until the color layer
 * shows it (see `@/lib/fill-preview`, F16). A tap only reports its cell (F19: no preview).
 */
export function useFillGestures({
  grid,
  cells,
  enabled,
  longPressFill,
  longPressMs = LONG_PRESS_MS,
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
  /** Id of the next preview batch (ids stay increasing, see `addBatch`). */
  const batchId = useSharedValue(1);

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

  /**
   * Moves the stroke's cells to the preview batches (same UI task: the preview never loses them)
   * and sends them. The batch id comes from a separate counter, and the preview is updated by a
   * single `modify` (no in-place mutation of the object returned by `get()`, F19).
   */
  const send = () => {
    'worklet';
    // Read only: the state object is updated through `modify` below, never mutated from `get()`.
    const current = stroke.get();
    if (current.cells.length <= current.sent) return;
    const batch = current.cells.slice(current.sent);
    const sent = current.cells.length;
    stroke.modify((s) => {
      'worklet';
      s.sent = sent;
      return s;
    }, true);
    const id = batchId.get();
    batchId.set(id + 1);
    preview.modify((p) => {
      'worklet';
      addBatch(p, batch, id);
      return p;
    }, true);
    scheduleOnRN(onBatch, batch, 'drag', id);
  };

  /** Ends continuous fill: the collected cells are kept and sent. */
  const finish = () => {
    'worklet';
    if (!filling.get()) return;
    filling.set(false);
    ring.set(withTiming(0, RING_OUT));
    send();
  };

  // Plain numbers computed on the JS runtime: a delay change only updates the config of the
  // existing handlers (same handler tags, nothing recreated).
  const tapConfig = tapGestureConfig(longPressMs, longPressFill);
  const longPressConfig = longPressFillGestureConfig(longPressMs);

  // Every gesture callback below runs on the UI runtime: an exception there aborts the app
  // (F19), so each body is guarded and the error goes to the local diagnostics log instead.
  const tap = useTapGesture({
    testID: 'fill-tap',
    enabled,
    // Explicit fields: the Worklets plugin does not accept spreads in gesture configs.
    maxDuration: tapConfig.maxDuration,
    maxDistance: tapConfig.maxDistance,
    onActivate: (e) => {
      try {
        if (filling.get()) return;
        const cell = cellAt(e.x, e.y);
        if (!cell) return;
        const index = cell.row * grid.width + cell.col;
        if (cells[index] === 0) return;
        // As safe as the original tap (F19): the cell only crosses to the JS runtime, no preview.
        scheduleOnRN(onBatch, [index], 'tap', -1);
      } catch (error) {
        reportWorkletError('tap.onActivate', error);
      }
    },
  });

  // Activates once the finger has stayed within the slop for `longPressMs` (it fails as soon as
  // the finger moves farther first: that touch is a pan of the viewport).
  const longPress = usePanGesture({
    testID: 'fill-long-press',
    enabled: enabled && longPressFill,
    maxPointers: longPressConfig.maxPointers,
    activateAfterLongPress: longPressConfig.activateAfterLongPress,
    onActivate: (e) => {
      try {
        if (panning.get()) return;
        filling.set(true);
        stroke.set(emptyStroke());
        // The cell under the finger when the long press fires is filled right away.
        extendTo(e.x, e.y);
        ring.set(withTiming(1, RING_IN));
        scheduleOnRN(onFillStart);
      } catch (error) {
        reportWorkletError('longPress.onActivate', error);
      }
    },
    onTouchesDown: (e) => {
      try {
        // A second finger lands: the user wants to zoom / pan, end the stroke.
        if (e.numberOfTouches > 1) finish();
      } catch (error) {
        reportWorkletError('longPress.onTouchesDown', error);
      }
    },
    onUpdate: (e) => {
      try {
        if (!filling.get()) return;
        if (e.numberOfPointers > 1) {
          finish();
          return;
        }
        extendTo(e.x, e.y);
        if (pendingCount(stroke.get()) >= DRAG_BATCH_MAX) send();
      } catch (error) {
        reportWorkletError('longPress.onUpdate', error);
      }
    },
    onFinalize: () => {
      try {
        finish();
      } catch (error) {
        reportWorkletError('longPress.onFinalize', error);
      }
    },
  });

  return { tap, longPress, stroke, fingerCell, ring };
}
