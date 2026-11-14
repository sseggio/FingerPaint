import { Canvas, FilterMode, Image, MipmapMode, type SamplingOptions, type SkImage } from '@shopify/react-native-skia';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getArtwork } from '@/features/artwork/registry';
import { makeLayerImage } from '@/features/coloring/canvas/layer-image';
import { useProgressStore } from '@/features/progress/progress-store';
import type { Artwork } from '@/lib/artwork/types';
import type { ProgressEntry } from '@/lib/library';
import { LruCache } from '@/lib/lru-cache';

import { buildThumbnailPixels, type ThumbnailFill } from './thumbnail-pixels';

const NEAREST: SamplingOptions = { filter: FilterMode.Nearest, mipmap: MipmapMode.None };

/**
 * Thumbnails are tiny (≤ 128×128 px, 64 KB) so a few screens' worth stay cached. Evicted
 * images are not disposed: a mounted thumbnail may still draw one; the GC reclaims them.
 */
export const THUMBNAIL_CACHE_SIZE = 120;
const cache = new LruCache<string, SkImage | null>(THUMBNAIL_CACHE_SIZE);

export function clearThumbnailCache() {
  cache.clear();
}

/**
 * `progress`: the artwork's current state (filled cells in color). `reveal`: color only once
 * completed (album meta-image pieces).
 */
export type ThumbnailMode = 'progress' | 'reveal';

type Plan = { key: string; fill: 'none' | 'all' } | { key: string; fill: 'bits'; placeholder: string };

function planFor(id: string, entry: ProgressEntry | undefined, mode: ThumbnailMode): Plan {
  const status = entry?.status ?? 'new';
  if (status === 'completed') return { key: `${id}|all`, fill: 'all' };
  if (status === 'new' || mode === 'reveal' || !entry || entry.filledCount === 0) return { key: `${id}|none`, fill: 'none' };
  // The index entry changes on every save: its timestamp versions the cached partial image.
  return { key: `${id}|${entry.updatedAt}|${entry.filledCount}`, fill: 'bits', placeholder: `${id}|none` };
}

function cachedImage(key: string, artwork: Artwork, fill: ThumbnailFill): SkImage | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  const image = makeLayerImage(buildThumbnailPixels(artwork, fill), artwork.width, artwork.height);
  cache.set(key, image);
  return image;
}

/** SkImage of the artwork state; partial states load their bitset asynchronously. */
function useThumbnailImage(artwork: Artwork | undefined, entry: ProgressEntry | undefined, mode: ThumbnailMode) {
  const plan = artwork ? planFor(artwork.id, entry, mode) : null;
  const [loaded, setLoaded] = useState<{ key: string; image: SkImage | null } | null>(null);
  const planKey = plan?.key;
  const needsBits = plan?.fill === 'bits' && !cache.has(plan.key);

  useEffect(() => {
    if (!artwork || !planKey || !needsBits) return;
    let alive = true;
    useProgressStore
      .getState()
      .loadFilled(artwork.id, artwork.totalCells)
      .then((bits) => {
        if (!alive) return;
        // Missing or corrupt bitset: show the untouched artwork rather than nothing.
        setLoaded({ key: planKey, image: cachedImage(planKey, artwork, bits ?? 'none') });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [artwork, planKey, needsBits]);

  if (!artwork || !plan) return null;
  if (plan.fill !== 'bits') return cachedImage(plan.key, artwork, plan.fill);
  if (cache.has(plan.key)) return cache.get(plan.key) ?? null;
  if (loaded?.key === plan.key) return loaded.image;
  // While the bitset loads: the gray version (never a blank tile).
  return cachedImage(plan.placeholder, artwork, 'none');
}

export interface ArtworkThumbnailProps {
  artworkId: string;
  size: number;
  progress?: ProgressEntry;
  mode?: ThumbnailMode;
}

/**
 * Pixel-perfect artwork preview: one Skia image (one pixel per cell) scaled with
 * nearest-neighbor sampling. Decorative: the parent carries the accessible label.
 */
export const ArtworkThumbnail = memo(function ArtworkThumbnail({
  artworkId,
  size,
  progress,
  mode = 'progress',
}: ArtworkThumbnailProps) {
  const artwork = getArtwork(artworkId);
  const image = useThumbnailImage(artwork, progress, mode);
  const box = { width: size, height: size };
  if (!artwork || !image) return <View style={box} />;
  const cell = size / Math.max(artwork.width, artwork.height);
  const width = artwork.width * cell;
  const height = artwork.height * cell;
  return (
    <View style={box} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Canvas style={styles.fill}>
        <Image
          image={image}
          x={(size - width) / 2}
          y={(size - height) / 2}
          width={width}
          height={height}
          sampling={NEAREST}
        />
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
