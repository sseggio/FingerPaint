import {
  Atlas,
  Canvas,
  FilterMode,
  Group,
  Image,
  MipmapMode,
  Path,
  Skia,
  useRectBuffer,
  useRSXformBuffer,
  type SamplingOptions,
  type SkImage,
  type SkPath,
} from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useSimultaneousGestures } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { Artwork } from '@/lib/artwork/types';
import type { StrokeState } from '@/lib/fill-stroke';
import { maxVisibleCells, numberThreshold as thresholdFor, type CellRange, type Size } from '@/lib/geometry';
import { colors } from '@/theme';

import { createNumberAtlas, type GlyphAtlas } from './glyph-atlas';
import { glyphSpriteIndex, glyphSpriteRect } from './glyph-layout';
import { makeLayerImage } from './layer-image';
import { buildBackgroundPixels, buildHighlightPixels, numberInks } from './layers';
import { useFillGestures, type FillHandler } from './use-fill-gestures';
import { useViewport } from './use-viewport';

/** Cells are magnified: never blur them. */
const NEAREST: SamplingOptions = { filter: FilterMode.Nearest, mipmap: MipmapMode.None };
/** Numbers are downscaled from the atlas texture: smooth them. */
const SMOOTH: SamplingOptions = { filter: FilterMode.Linear, mipmap: MipmapMode.None };

export interface PixelCanvasProps {
  artwork: Artwork;
  /** RGBA buffer of the color layer (w×h). Mutated in place by the coloring session (F06). */
  colorPixels: Uint8Array;
  /** Bump to rebuild the color layer image after `colorPixels` changed. */
  colorRevision: number;
  /** Large-numbers mode: numbers appear from a bigger cell size. */
  largeNumbers?: boolean;
  /** Active palette color (0-based): its cells are highlighted and taps/drags fill it. */
  activeColor?: number | null;
  /** Receives the cells tapped or dragged over. Without it the canvas is read-only. */
  onFill?: FillHandler;
  /** One-finger drags color cells (then two fingers pan); otherwise one finger pans. */
  dragToFill?: boolean;
  accessibilityLabel: string;
}

/** Grid lines in world units (1 unit = 1 cell), drawn as hairlines whatever the zoom. */
function buildGridPath(width: number, height: number): SkPath {
  const builder = Skia.PathBuilder.Make();
  for (let x = 0; x <= width; x++) builder.moveTo(x, 0).lineTo(x, height);
  for (let y = 0; y <= height; y++) builder.moveTo(0, y).lineTo(width, y);
  return builder.detach();
}

interface NumberGlyphsProps {
  atlas: GlyphAtlas;
  /** Row-major cell values (0 = empty), as a plain array for the UI runtime. */
  cells: number[];
  /** Per palette color: 1 = light ink, 0 = dark ink (AA contrast on its gray). */
  inks: number[];
  gridWidth: number;
  capacity: number;
  range: SharedValue<CellRange>;
}

/**
 * Numbers of the visible cells in one Atlas draw. The buffers hold `capacity` slots (the most
 * cells visible at the numbers threshold); slot i maps to the i-th cell of the visible range and
 * unused slots get a zero-scale transform. They are refilled on the UI thread only when the
 * visible range changes.
 */
const NumberGlyphs = memo(function NumberGlyphs({ atlas, cells, inks, gridWidth, capacity, range }: NumberGlyphsProps) {
  const { spritePx, columns, image, count: glyphCount } = atlas;
  const glyphScale = 1 / spritePx;

  const sprites = useRectBuffer(capacity, (rect, i) => {
    'worklet';
    const r = range.get();
    const cols = r.x1 - r.x0;
    const count = cols * (r.y1 - r.y0);
    const value = i < count ? cells[(r.y0 + Math.floor(i / cols)) * gridWidth + r.x0 + (i % cols)] : 0;
    const sprite = value > 0 ? glyphSpriteIndex(value, glyphCount, inks[value - 1] === 1) : 0;
    const s = glyphSpriteRect(sprite, spritePx, columns);
    rect.setXYWH(s.x, s.y, s.width, s.height);
  });

  const transforms = useRSXformBuffer(capacity, (xform, i) => {
    'worklet';
    const r = range.get();
    const cols = r.x1 - r.x0;
    const count = cols * (r.y1 - r.y0);
    if (i >= count) {
      xform.set(0, 0, 0, 0);
      return;
    }
    const col = r.x0 + (i % cols);
    const row = r.y0 + Math.floor(i / cols);
    if (cells[row * gridWidth + col] === 0) xform.set(0, 0, 0, 0);
    else xform.set(glyphScale, 0, col, row);
  });

  return <Atlas image={image} sprites={sprites} transforms={transforms} sampling={SMOOTH} />;
});

/** Live drag-to-fill preview: the cells collected by the running stroke, as unit squares. */
function useStrokePath(stroke: SharedValue<StrokeState>, gridWidth: number) {
  return useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const { cells } = stroke.get();
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k];
      builder.addRect(Skia.XYWHRect(i % gridWidth, Math.floor(i / gridWidth), 1, 1));
    }
    return builder.detach();
  });
}

/**
 * The coloring canvas: one Skia `<Canvas>` whose world group is transformed by shared values.
 * Layers (back to front): grayscale background, active-color highlight, numbers, color layer
 * (opaque over filled cells, so their numbers and highlight disappear), drag preview, grid.
 */
export function PixelCanvas({
  artwork,
  colorPixels,
  colorRevision,
  largeNumbers = false,
  activeColor = null,
  onFill,
  dragToFill = true,
  accessibilityLabel,
}: PixelCanvasProps) {
  const { width, height } = artwork;
  const [view, setView] = useState<Size | null>(null);
  const threshold = thresholdFor(largeNumbers);
  const grid = useMemo(() => ({ width, height }), [width, height]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setView((prev) => (prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }, []);

  const background = useMemo(() => makeLayerImage(buildBackgroundPixels(artwork), width, height), [artwork, width, height]);
  // Rebuilt once per revision; the screen coalesces revisions to at most one per frame.
  const colorLayer = useMemo(
    () => makeLayerImage(colorPixels, width, height),
    // colorRevision signals in-place changes of colorPixels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorPixels, colorRevision, width, height],
  );
  // Highlight masks never change while coloring: built lazily, once per color, per artwork.
  const highlightCache = useMemo(() => ({ artwork, images: new Map<number, SkImage | null>() }), [artwork]);
  const highlight = useMemo(() => {
    if (activeColor === null || activeColor < 0 || activeColor >= artwork.palette.colors.length) return null;
    let image = highlightCache.images.get(activeColor);
    if (image === undefined) {
      image = makeLayerImage(buildHighlightPixels(highlightCache.artwork, activeColor), width, height);
      highlightCache.images.set(activeColor, image);
    }
    return image;
  }, [activeColor, artwork, highlightCache, width, height]);
  const inks = useMemo(() => numberInks(artwork), [artwork]);
  const gridPath = useMemo(() => buildGridPath(width, height), [width, height]);
  const paletteSize = artwork.palette.colors.length;
  const atlas = useMemo(() => createNumberAtlas(paletteSize), [paletteSize]);
  const cells = useMemo(() => Array.from(artwork.cells), [artwork.cells]);
  const capacity = view ? maxVisibleCells(view, threshold, grid) : 0;

  const canFill = !!onFill && activeColor !== null;
  const { gestures, scale, tx, ty, transform, gridOpacity, glyphRange } = useViewport({
    grid,
    view,
    numberThreshold: threshold,
    panMinPointers: canFill && dragToFill ? 2 : 1,
  });

  const activeValue = useSharedValue(0);
  useEffect(() => {
    activeValue.set(activeColor === null ? 0 : activeColor + 1);
  }, [activeColor, activeValue]);
  const noop = useCallback<FillHandler>(() => undefined, []);
  const fill = useFillGestures({
    grid,
    cells,
    enabled: !!view && canFill,
    dragToFill,
    activeValue,
    scale,
    tx,
    ty,
    onFill: onFill ?? noop,
  });
  const { clearPreview } = fill;
  // Painted cells now show in the color layer: drop the stroke preview drawn over them.
  useEffect(() => {
    clearPreview();
  }, [colorRevision, clearPreview]);
  const strokePath = useStrokePath(fill.stroke, width);
  const activeHex = activeColor === null ? undefined : artwork.palette.colors[activeColor]?.hex;
  const gesture = useSimultaneousGestures(...gestures, fill.tap, fill.drag);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.root}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}>
        {view ? (
          <Canvas style={styles.root}>
            <Group transform={transform}>
              <Image image={background} x={0} y={0} width={width} height={height} sampling={NEAREST} />
              {highlight ? (
                <Image image={highlight} x={0} y={0} width={width} height={height} sampling={NEAREST} />
              ) : null}
              {atlas && capacity > 0 ? (
                <NumberGlyphs
                  atlas={atlas}
                  cells={cells}
                  inks={inks}
                  gridWidth={width}
                  capacity={capacity}
                  range={glyphRange}
                />
              ) : null}
              <Image image={colorLayer} x={0} y={0} width={width} height={height} sampling={NEAREST} />
              {activeHex ? <Path path={strokePath} color={activeHex} /> : null}
              <Path
                path={gridPath}
                style="stroke"
                strokeWidth={0}
                color={colors.light.ink}
                opacity={gridOpacity}
              />
            </Group>
          </Canvas>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
