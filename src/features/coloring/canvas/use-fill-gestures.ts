import { usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { DRAG_BATCH_MAX, emptyStroke, pendingCount, strokeTo, takeBatch, type StrokeState } from '@/lib/fill-stroke';
import { screenToCell, type Size } from '@/lib/geometry';

export type FillSource = 'tap' | 'drag';

/** Receives cells to fill (row-major indices) on the JS runtime. */
export type FillHandler = (batch: number[], source: FillSource) => void;

/** Finger travel (points) before a one-finger drag starts coloring: below it, it is a tap. */
const DRAG_MIN_DISTANCE = 6;
/** A stroke this short when a second finger lands was the start of a pinch, not coloring. */
const ACCIDENTAL_STROKE_CELLS = 3;

export interface FillGestureOptions {
  grid: Size;
  /** Row-major cell values (0 = empty), as a plain array for the UI runtime. */
  cells: number[];
  enabled: boolean;
  /** One-finger drags color cells (the viewport then pans with two fingers). */
  dragToFill: boolean;
  /** 1-based palette value of the active color (0 = none). */
  activeValue: SharedValue<number>;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  onFill: FillHandler;
}

/**
 * Tap-to-fill and drag-to-fill. Hit-testing inverts the viewport transform on the UI thread;
 * a drag accumulates its cells there (deduplicated, gaps filled) and crosses to the JS runtime
 * once, when the finger lifts (or every DRAG_BATCH_MAX cells on a very long drag): no
 * per-frame `scheduleOnRN`. Correctness (wrong color, already filled) is decided on the JS side
 * by the coloring session; the UI side only keeps cells of the active color for the preview.
 */
export function useFillGestures({
  grid,
  cells,
  enabled,
  dragToFill,
  activeValue,
  scale,
  tx,
  ty,
  onFill,
}: FillGestureOptions) {
  const stroke = useSharedValue<StrokeState>(emptyStroke());
  const dragging = useSharedValue(false);
  const suspended = useSharedValue(false);

  const cellAt = (x: number, y: number) => {
    'worklet';
    return screenToCell(x, y, { scale: scale.get(), tx: tx.get(), ty: ty.get() }, grid);
  };

  const extendTo = (x: number, y: number) => {
    'worklet';
    const cell = cellAt(x, y);
    const active = activeValue.get();
    stroke.modify((s) => {
      'worklet';
      if (cell) strokeTo(s, grid, cells, active, cell.col, cell.row);
      else s.last = -1;
      return s;
    }, true);
  };

  const send = () => {
    'worklet';
    const batch = takeBatch(stroke.get());
    if (batch) scheduleOnRN(onFill, batch, 'drag');
  };

  const tap = useTapGesture({
    enabled,
    onActivate: (e) => {
      const cell = cellAt(e.x, e.y);
      if (!cell) return;
      const index = cell.row * grid.width + cell.col;
      if (cells[index] === 0) return;
      scheduleOnRN(onFill, [index], 'tap');
    },
  });

  const drag = usePanGesture({
    enabled: enabled && dragToFill,
    maxPointers: 1,
    minDistance: DRAG_MIN_DISTANCE,
    onActivate: (e) => {
      dragging.set(true);
      suspended.set(false);
      stroke.set(emptyStroke());
      // Start from where the finger went down, not where the drag was recognized.
      extendTo(e.x - e.translationX, e.y - e.translationY);
      extendTo(e.x, e.y);
    },
    onUpdate: (e) => {
      if (suspended.get()) return;
      if (e.numberOfPointers > 1) {
        // A second finger joined: the user is now zooming / panning, stop coloring.
        suspended.set(true);
        const s = stroke.get();
        if (s.sent === 0 && s.cells.length <= ACCIDENTAL_STROKE_CELLS) stroke.set(emptyStroke());
        return;
      }
      extendTo(e.x, e.y);
      if (pendingCount(stroke.get()) >= DRAG_BATCH_MAX) send();
    },
    onFinalize: () => {
      if (!dragging.get()) return;
      dragging.set(false);
      send();
    },
  });

  /** Clears the live preview once the JS side has painted the cells (called after a revision). */
  const clearPreview = () => {
    scheduleOnUI(() => {
      'worklet';
      if (!dragging.get() && stroke.get().cells.length > 0) stroke.set(emptyStroke());
    });
  };

  return { tap, drag, stroke, clearPreview };
}
