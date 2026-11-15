import type { SkImage } from '@shopify/react-native-skia';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import {
  acknowledgeBatch,
  emptyPreview,
  paintedMask,
  settleBatch,
  showLayer,
  type PreviewState,
} from '@/lib/fill-preview';

import type { FillHandler, FillSource } from './use-fill-gestures';

/** A batch sent by the fill gestures, with the preview batch id to acknowledge (-1: none). */
export type BatchHandler = (batch: number[], source: FillSource, id: number) => void;

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
      const { rejected, shownAt } = settleBatch(batch, before, paintedMask(colorPixels, batch), layerRevision.current);
      scheduleOnUI(() => {
        'worklet';
        preview.modify((s) => {
          'worklet';
          acknowledgeBatch(s, id, rejected, shownAt);
          return s;
        }, true);
      });
    },
    [colorPixels, onFill, preview],
  );

  return { preview, layer, onBatch };
}
