import type { Transforms3d } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePanGesture, usePinchGesture } from 'react-native-gesture-handler';
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
  EMPTY_RANGE,
  fitViewport,
  focusCellViewport,
  rangeFromKey,
  rangeKey,
  scaleBounds,
  viewCenter,
  visibleRange,
  zoomAt,
  type CellRange,
  type Size,
} from '@/lib/geometry';
import {
  gridVisibility,
  numberOpacity as opacityAt,
  numberZoomRange,
  type NumberZoomRange,
} from '@/lib/number-visibility';
import { VIEWPORT_PAN_GESTURE } from '@/lib/touch-intent';

/** Breathing room around the grid at the minimum zoom (points). */
export const VIEWPORT_PADDING = 12;
/** Grid line opacity at full strength. */
export const GRID_MAX_OPACITY = 0.22;
/** Same in high-contrast mode: clearly marked lines. */
export const GRID_MAX_OPACITY_HIGH = 0.6;
/** "Find" hint: a slightly longer, gentle travel to the target cell. */
export const FOCUS_TIMING = { duration: 420, easing: Easing.bezier(0.23, 1, 0.32, 1) };
/** Gentle reframing on the whole artwork (completion replay, layout change once finished). */
export const FIT_TIMING = { duration: 520, easing: Easing.bezier(0.23, 1, 0.32, 1) };

export interface ViewportOptions {
  grid: Size;
  /** Canvas size in points; null until measured. */
  view: Size | null;
  /** Large-numbers mode: numbers need bigger cells (see `@/lib/number-visibility`). */
  largeNumbers?: boolean;
  /** True while continuous fill runs (owned by the fill gestures): the view stands still. */
  filling: SharedValue<boolean>;
  /** High-contrast mode: stronger grid lines. */
  highContrast?: boolean;
  /**
   * Canvas size changes after the first fit glide to the new fit instead of jumping (the
   * finished artwork reframes softly when the palette makes room for the completion card).
   */
  smoothFit?: boolean;
  /** Navigation gestures off (completion replay: a tap skips it, nothing pans). */
  locked?: boolean;
}

export interface ViewportState {
  /** Navigation gestures (pinch, pan), composed by the canvas with the fill ones. */
  gestures: readonly [ReturnType<typeof usePinchGesture>, ReturnType<typeof usePanGesture>];
  /** True while the view pans with one or two fingers. */
  panning: SharedValue<boolean>;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  /** Skia transform for the world group (screen = world × scale + t). */
  transform: DerivedValue<Transforms3d>;
  gridOpacity: DerivedValue<number>;
  /** Scales between which the numbers fade in (none at the overview, see `numberZoomRange`). */
  numberRange: NumberZoomRange;
  /** Opacity of the numbers at the current zoom (0 at the overview). */
  numberOpacity: DerivedValue<number>;
  /** Cells whose numbers are drawn: visible cells once the numbers fade in, else empty. */
  glyphRange: SharedValue<CellRange>;
  /** World point (cells) at the center of the view, or null before the view is measured. */
  getViewCenter(): { x: number; y: number } | null;
  /**
   * Moves the view to a cell (centered, zoomed in to a readable size). Animated unless
   * `animate` is false (reduce motion). Returns false before the view is measured.
   */
  focusCell(col: number, row: number, animate: boolean): boolean;
  /** Frames the whole artwork ("fit" zoom), gliding there when `animate`. False if not measured. */
  fitView(animate: boolean): boolean;
}

/**
 * Viewport shared values and gestures (pinch around the focal point, bounded pan with decay, one
 * or two fingers). Everything runs on the UI thread: no React state is touched while a gesture is
 * active.
 *
 * No double tap to zoom (F15): taps fill cells and are often quick and close together, so a
 * double tap would zoom by surprise (or delay every tap to tell them apart). Pinch is enough.
 */
export function useViewport({
  grid,
  view,
  largeNumbers = false,
  filling,
  highContrast = false,
  smoothFit = false,
  locked = false,
}: ViewportOptions): ViewportState {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const glyphRange = useSharedValue<CellRange>(EMPTY_RANGE);
  const panning = useSharedValue(false);
  /** The running pan stood still for a while (continuous fill): no momentum on release. */
  const panHeld = useSharedValue(false);

  const gridW = grid.width;
  const gridH = grid.height;
  const viewW = view?.width ?? 0;
  const viewH = view?.height ?? 0;
  const measured = viewW > 0 && viewH > 0;

  // Plain objects captured by the worklets below (copied to the UI runtime on change only).
  const geometry = useMemo(() => {
    const g = { width: gridW, height: gridH };
    const v = { width: Math.max(1, viewW), height: Math.max(1, viewH) };
    const bounds = scaleBounds(g, v, VIEWPORT_PADDING);
    return { grid: g, view: v, bounds, numbers: numberZoomRange(bounds.min, bounds.max, largeNumbers) };
  }, [gridW, gridH, viewW, viewH, largeNumbers]);

  const smoothFitRef = useRef(smoothFit);
  const fittedRef = useRef(false);
  useEffect(() => {
    smoothFitRef.current = smoothFit;
  }, [smoothFit]);

  const applyFit = useCallback(
    (animate: boolean) => {
      const fit = fitViewport(geometry.grid, geometry.view, VIEWPORT_PADDING);
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      if (animate) {
        scale.set(withTiming(fit.scale, FIT_TIMING));
        tx.set(withTiming(fit.tx, FIT_TIMING));
        ty.set(withTiming(fit.ty, FIT_TIMING));
      } else {
        scale.set(fit.scale);
        tx.set(fit.tx);
        ty.set(fit.ty);
      }
    },
    [geometry, scale, tx, ty],
  );

  // Fit the whole grid when the artwork or the canvas size changes (never during a gesture).
  useEffect(() => {
    if (!measured) return;
    applyFit(smoothFitRef.current && fittedRef.current);
    fittedRef.current = true;
  }, [applyFit, measured]);

  const fitView = useCallback(
    (animate: boolean) => {
      if (!measured) return false;
      applyFit(animate);
      return true;
    },
    [applyFit, measured],
  );

  const stopAnimations = () => {
    'worklet';
    cancelAnimation(scale);
    cancelAnimation(tx);
    cancelAnimation(ty);
  };

  const pinch = usePinchGesture({
    enabled: measured && !locked,
    onBegin: () => {
      stopAnimations();
    },
    onUpdate: (e) => {
      if (filling.get()) return;
      const { grid: g, view: v, bounds } = geometry;
      const current = { scale: scale.get(), tx: tx.get(), ty: ty.get() };
      const nextScale = clamp(current.scale * e.scaleChange, bounds.min, bounds.max);
      const next = clampViewport(zoomAt(current, nextScale, e.focalX, e.focalY), g, v, bounds);
      scale.set(next.scale);
      tx.set(next.tx);
      ty.set(next.ty);
    },
  });

  // One finger moving past the slop, or two fingers (along with the pinch). A second finger
  // landing during a one-finger pan simply joins it: the pinch takes over the zoom.
  const pan = usePanGesture({
    testID: 'viewport-pan',
    enabled: measured && !locked,
    minPointers: VIEWPORT_PAN_GESTURE.minPointers,
    minDistance: VIEWPORT_PAN_GESTURE.minDistance,
    onBegin: () => {
      stopAnimations();
      panHeld.set(false);
    },
    onActivate: () => {
      if (filling.get()) panHeld.set(true);
      else panning.set(true);
    },
    onUpdate: (e) => {
      if (filling.get()) {
        panHeld.set(true);
        return;
      }
      // A second finger ended the stroke and now pans / pinches: a real pan again, with momentum.
      if (e.numberOfPointers > 1) panHeld.set(false);
      panning.set(true);
      const { grid: g, view: v } = geometry;
      const s = scale.get();
      tx.set(clampTranslation(tx.get() + e.changeX, g.width * s, v.width));
      ty.set(clampTranslation(ty.get() + e.changeY, g.height * s, v.height));
    },
    onDeactivate: (e) => {
      if (e.canceled || panHeld.get() || filling.get()) return;
      const { grid: g, view: v } = geometry;
      const s = scale.get();
      const contentW = g.width * s;
      const contentH = g.height * s;
      // Momentum, bounded by the same limits as the drag itself.
      if (contentW > v.width) tx.set(withDecay({ velocity: e.velocityX, clamp: [v.width - contentW, 0] }));
      if (contentH > v.height) ty.set(withDecay({ velocity: e.velocityY, clamp: [v.height - contentH, 0] }));
    },
    onFinalize: () => {
      panning.set(false);
    },
  });

  const transform = useDerivedValue<Transforms3d>(() => [
    { translateX: tx.get() },
    { translateY: ty.get() },
    { scale: scale.get() },
  ]);

  const gridMax = highContrast ? GRID_MAX_OPACITY_HIGH : GRID_MAX_OPACITY;
  const gridOpacity = useDerivedValue(() => gridVisibility(scale.get()) * gridMax);
  // Fades with the zoom on the UI thread: no React state, the glyph atlas is untouched.
  const numberOpacity = useDerivedValue(() => opacityAt(scale.get(), geometry.numbers));

  // The glyph buffers are rebuilt only when the set of visible cells changes, not every frame.
  useAnimatedReaction(
    () => {
      if (!measured || opacityAt(scale.get(), geometry.numbers) <= 0) return -1;
      return rangeKey(visibleRange({ scale: scale.get(), tx: tx.get(), ty: ty.get() }, geometry.grid, geometry.view));
    },
    (key, previous) => {
      if (key !== previous) glyphRange.set(rangeFromKey(key));
    },
  );

  const getViewCenter = useCallback(() => {
    if (!measured) return null;
    return viewCenter({ scale: scale.get(), tx: tx.get(), ty: ty.get() }, geometry.view);
  }, [geometry, measured, scale, tx, ty]);

  const focusCell = useCallback(
    (col: number, row: number, animate: boolean) => {
      if (!measured) return false;
      const { grid: g, view: v, bounds, numbers } = geometry;
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      const current = { scale: scale.get(), tx: tx.get(), ty: ty.get() };
      // Zoomed in at least to the full opacity of the numbers: readable on arrival (F17).
      const target = focusCellViewport(current, col, row, g, v, bounds, numbers.full);
      if (animate) {
        scale.set(withTiming(target.scale, FOCUS_TIMING));
        tx.set(withTiming(target.tx, FOCUS_TIMING));
        ty.set(withTiming(target.ty, FOCUS_TIMING));
      } else {
        scale.set(target.scale);
        tx.set(target.tx);
        ty.set(target.ty);
      }
      return true;
    },
    [geometry, measured, scale, tx, ty],
  );

  return {
    gestures: [pinch, pan],
    panning,
    scale,
    tx,
    ty,
    transform,
    gridOpacity,
    numberRange: geometry.numbers,
    numberOpacity,
    glyphRange,
    getViewCenter,
    focusCell,
    fitView,
  };
}
