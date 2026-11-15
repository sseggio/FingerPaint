import type { SkImage } from '@shopify/react-native-skia';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import {
  acknowledgeBatch,
  addPendingBatch,
  dropShownValues,
  emptyPreview,
  paintedMask,
  settleBatch,
  showLayer,
  type PendingValues,
  type PreviewState,
} from '@/lib/fill-preview';

import type { FillHandler, FillSource } from './use-fill-gestures';

const NO_PENDING: PendingValues = {};

/** A batch sent by the fill gestures, with the preview batch id to acknowledge (-1: none). */
export type BatchHandler = (batch: number[], source: FillSource, id: number) => void;

interface PendingTracker {
  cells: number[];
  colorPixels: Uint8Array;
  values: PendingValues;
}

export interface FillPreviewOptions {
  /** Color layer buffer, mutated in place by the coloring session. */
  colorPixels: Uint8Array;
  /** Color layer image built from `colorPixels` for the current revision. */
  colorLayer: SkImage | null;
  /** Row-major cell values (0 = empty): a new artwork drops what is pending. */
  cells: number[];
  onFill: FillHandler;
}

/**
 * Keeps the fill preview on screen until the color layer shows its cells (see
 * `@/lib/fill-preview`). The color layer image is handed to the canvas through a shared value,
 * set in the same UI task that drops the batches it now shows: the image swap and the preview
 * removal are always drawn in the same frame, whatever the JS / UI timing.
 */
export function useFillPreview({ colorPixels, colorLayer, cells, onFill }: FillPreviewOptions) {
  /** Batches sent to the JS runtime, drawn until the color layer shows them. */
  const preview = useSharedValue<PreviewState>(emptyPreview());
  const layer = useSharedValue<SkImage | null>(colorLayer);
  /** Last color layer revision handed to the UI runtime. */
  const layerRevision = useRef(0);
  /**
   * Colors with batches still previewed (JS mirror, updated where the batches are settled): the
   * canvas mounts their preview paths. A color is dropped at the next batch once the layer
   * showing it was handed to the UI runtime: always after the preview itself let go of it (an
   * extra empty path for a while is harmless, an early unmount could flash). Owned by the
   * current artwork / buffer: a new one starts empty.
   */
  const [tracked, setTracked] = useState<PendingTracker>(() => ({ cells, colorPixels, values: NO_PENDING }));
  const owned = tracked.cells === cells && tracked.colorPixels === colorPixels;
  const pending = owned ? tracked.values : NO_PENDING;

  useLayoutEffect(() => {
    layerRevision.current += 1;
    const revision = layerRevision.current;
    scheduleOnUI(() => {
      'worklet';
      layer.set(colorLayer);
      preview.modify((s) => {
        'worklet';
        showLayer(s, revision);
        return s;
      }, true);
    });
  }, [colorLayer, layer, preview]);

  // Another artwork (or a restored session): nothing pending applies to it any more.
  useLayoutEffect(() => {
    const revision = layerRevision.current;
    scheduleOnUI(() => {
      'worklet';
      preview.modify((s) => {
        'worklet';
        // Ids stay increasing: an acknowledgment still in flight never matches a new batch.
        s.batches = [];
        s.layer = revision;
        return s;
      }, true);
    });
  }, [cells, colorPixels, preview]);

  const onBatch = useCallback<BatchHandler>(
    (batch, source, id) => {
      const before = paintedMask(colorPixels, batch);
      onFill(batch, source);
      if (id < 0) return;
      const layerNow = layerRevision.current;
      const { rejected, shownAt } = settleBatch(batch, before, paintedMask(colorPixels, batch), layerNow);
      setTracked((t) => {
        const own = t.cells === cells && t.colorPixels === colorPixels;
        const kept = dropShownValues(own ? t.values : NO_PENDING, layerNow);
        const values = addPendingBatch(kept, batch, rejected, shownAt, layerNow, cells);
        return own && values === t.values ? t : { cells, colorPixels, values };
      });
      scheduleOnUI(() => {
        'worklet';
        preview.modify((s) => {
          'worklet';
          acknowledgeBatch(s, id, rejected, shownAt);
          return s;
        }, true);
      });
    },
    [cells, colorPixels, onFill, preview],
  );

  return { preview, layer, onBatch, pending };
}
