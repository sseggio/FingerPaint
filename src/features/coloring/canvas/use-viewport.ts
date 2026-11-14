import type { Transforms3d } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  clamp,
  clampTranslation,
  clampViewport,
  doubleTapViewport,
  EMPTY_RANGE,
  fitViewport,
  GRID_MIN_CELL_PT,
  rangeFromKey,
  rangeKey,
  scaleBounds,
  visibleRange,
  zoomAt,
  type CellRange,
  type Size,
} from '@/lib/geometry';

/** Breathing room around the grid at the minimum zoom (points). */
export const VIEWPORT_PADDING = 12;
/** Strong ease-out (expo-animation skill) for the double-tap zoom. */
const ZOOM_TIMING = { duration: 280, easing: Easing.bezier(0.23, 1, 0.32, 1) };
/** Grid line opacity at full strength. */
const GRID_MAX_OPACITY = 0.22;

export interface ViewportOptions {
  grid: Size;
  /** Canvas size in points; null until measured. */
  view: Size | null;
  /** Cell size (points) from which numbers are drawn. */
  numberThreshold: number;
  /** Fingers needed to pan: 2 while one-finger drags color cells (F06), 1 otherwise. */
  panMinPointers: 1 | 2;
}

export interface ViewportState {
  gesture: ReturnType<typeof useSimultaneousGestures>;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  /** Skia transform for the world group (screen = world × scale + t). */
  transform: DerivedValue<Transforms3d>;
  gridOpacity: DerivedValue<number>;
  /** Cells whose numbers are drawn: visible cells once zoomed past the threshold, else empty. */
  glyphRange: SharedValue<CellRange>;
}

/**
 * Viewport shared values and gestures (pinch around the focal point, bounded pan with decay,
 * double tap to zoom in / back out). Everything runs on the UI thread: no React state is touched
 * while a gesture is active.
 */
export function useViewport({ grid, view, numberThreshold, panMinPointers }: ViewportOptions): ViewportState {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const glyphRange = useSharedValue<CellRange>(EMPTY_RANGE);

  const gridW = grid.width;
  const gridH = grid.height;
  const viewW = view?.width ?? 0;
  const viewH = view?.height ?? 0;
  const measured = viewW > 0 && viewH > 0;

  // Plain objects captured by the worklets below (copied to the UI runtime on change only).
  const geometry = useMemo(() => {
    const g = { width: gridW, height: gridH };
    const v = { width: Math.max(1, viewW), height: Math.max(1, viewH) };
    return { grid: g, view: v, bounds: scaleBounds(g, v, VIEWPORT_PADDING) };
  }, [gridW, gridH, viewW, viewH]);

  // Fit the whole grid when the artwork or the canvas size changes (never during a gesture).
  useEffect(() => {
    if (!measured) return;
    const fit = fitViewport(geometry.grid, geometry.view, VIEWPORT_PADDING);
    scale.set(fit.scale);
    tx.set(fit.tx);
    ty.set(fit.ty);
  }, [geometry, measured, scale, tx, ty]);

  const stopAnimations = () => {
    'worklet';
    cancelAnimation(scale);
    cancelAnimation(tx);
    cancelAnimation(ty);
  };

  const pinch = usePinchGesture({
    enabled: measured,
    onBegin: () => {
      stopAnimations();
    },
    onUpdate: (e) => {
      const { grid: g, view: v, bounds } = geometry;
      const current = { scale: scale.get(), tx: tx.get(), ty: ty.get() };
      const nextScale = clamp(current.scale * e.scaleChange, bounds.min, bounds.max);
      const next = clampViewport(zoomAt(current, nextScale, e.focalX, e.focalY), g, v, bounds);
      scale.set(next.scale);
      tx.set(next.tx);
      ty.set(next.ty);
    },
  });

  const pan = usePanGesture({
    enabled: measured,
    minPointers: panMinPointers,
    onBegin: () => {
      stopAnimations();
    },
    onUpdate: (e) => {
      const { grid: g, view: v } = geometry;
      const s = scale.get();
      tx.set(clampTranslation(tx.get() + e.changeX, g.width * s, v.width));
      ty.set(clampTranslation(ty.get() + e.changeY, g.height * s, v.height));
    },
    onDeactivate: (e) => {
      if (e.canceled) return;
      const { grid: g, view: v } = geometry;
      const s = scale.get();
      const contentW = g.width * s;
      const contentH = g.height * s;
      // Momentum, bounded by the same limits as the drag itself.
      if (contentW > v.width) tx.set(withDecay({ velocity: e.velocityX, clamp: [v.width - contentW, 0] }));
      if (contentH > v.height) ty.set(withDecay({ velocity: e.velocityY, clamp: [v.height - contentH, 0] }));
    },
  });

  const doubleTap = useTapGesture({
    enabled: measured,
    numberOfTaps: 2,
    onActivate: (e) => {
      const { grid: g, view: v, bounds } = geometry;
      stopAnimations();
      const current = { scale: scale.get(), tx: tx.get(), ty: ty.get() };
      const target = doubleTapViewport(current, e.x, e.y, g, v, bounds);
      scale.set(withTiming(target.scale, ZOOM_TIMING));
      tx.set(withTiming(target.tx, ZOOM_TIMING));
      ty.set(withTiming(target.ty, ZOOM_TIMING));
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  const transform = useDerivedValue<Transforms3d>(() => [
    { translateX: tx.get() },
    { translateY: ty.get() },
    { scale: scale.get() },
  ]);

  const gridOpacity = useDerivedValue(
    () => clamp((scale.get() - GRID_MIN_CELL_PT) / 6, 0, 1) * GRID_MAX_OPACITY,
  );

  // The glyph buffers are rebuilt only when the set of visible cells changes, not every frame.
  useAnimatedReaction(
    () => {
      if (!measured || scale.get() < numberThreshold) return -1;
      return rangeKey(visibleRange({ scale: scale.get(), tx: tx.get(), ty: ty.get() }, geometry.grid, geometry.view));
    },
    (key, previous) => {
      if (key !== previous) glyphRange.set(rangeFromKey(key));
    },
  );

  return { gesture, scale, tx, ty, transform, gridOpacity, glyphRange };
}
