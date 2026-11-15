import type { SkImage } from '@shopify/react-native-skia';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

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
 * `@/lib/fill-preview`). The color layer image itself is drawn from a plain React prop (no Skia
 * object in a shared value, F19); one UI frame after a new image was committed, the batches it
 * shows leave the preview. Removing them late is invisible (the preview draws the same pixels),
 * removing them before the image is drawn would flash.
 */
export function useFillPreview({ colorPixels, colorLayer, cells, onFill }: FillPreviewOptions) {
  /** Batches sent to the JS runtime, drawn until the color layer shows them. */
  const preview = useSharedValue<PreviewState>(emptyPreview());
  /** Last color layer revision committed (counted at commit, read by `onBatch`). */
  const layerRevision = useRef(0);
  /**
   * Colors with batches still previewed (JS mirror, updated where the batches are settled): the
   * canvas mounts their preview paths. A color is dropped once the layer showing it is drawn
   * (`releaseShown`, scheduled from the UI frame that dropped its batches): always after the
   * preview itself let go of it (an early unmount could flash). Owned by the current artwork /
   * buffer: a new one starts empty.
   */
  const [tracked, setTracked] = useState<PendingTracker>(() => ({ cells, colorPixels, values: NO_PENDING }));
  const owned = tracked.cells === cells && tracked.colorPixels === colorPixels;
  const pending = owned ? tracked.values : NO_PENDING;

  /**
   * The layer `revision` is on screen: the colors it shows no longer need their preview path,
   * unmounted right away rather than at the next batch (report of the F17 review). Called from
   * the UI frame that dropped its batches, so the path always goes after the preview let go.
   */
  const releaseShown = useCallback((revision: number) => {
    setTracked((t) => {
      const values = dropShownValues(t.values, revision);
      return values === t.values ? t : { ...t, values };
    });
  }, []);

  // Counted at commit: a batch settled from now on is shown by the next revision.
  useLayoutEffect(() => {
    layerRevision.current += 1;
  }, [colorLayer]);

  // The new image is committed: one UI frame later it is drawn, its batches can leave the preview.
  useEffect(() => {
    const revision = layerRevision.current;
    scheduleOnUI(() => {
      'worklet';
      requestAnimationFrame(() => {
        try {
          preview.modify((s) => {
            'worklet';
            showLayer(s, revision);
            return s;
          }, true);
          scheduleOnRN(releaseShown, revision);
        } catch {
          // Worst case the preview stays drawn, identical to the layer below: nothing to see.
        }
      });
    });
  }, [colorLayer, preview, releaseShown]);

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
        try {
          preview.modify((s) => {
            'worklet';
            acknowledgeBatch(s, id, rejected, shownAt);
            return s;
          }, true);
        } catch {
          // Never abort the app from the UI runtime (F19); the batch then stays previewed.
        }
      });
    },
    [cells, colorPixels, onFill, preview],
  );

  return { preview, onBatch, pending };
}
