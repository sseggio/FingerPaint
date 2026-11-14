import { FilterMode, ImageFormat, MipmapMode, Skia } from '@shopify/react-native-skia';

import { makeLayerImage } from '@/features/coloring/canvas/layer-image';
import { buildThumbnailPixels, type ThumbnailFill } from '@/features/library/thumbnail-pixels';
import type { Artwork } from '@/lib/artwork/types';
import { exportSize, type ExportSize } from '@/lib/export-scale';

export interface RenderedPng extends ExportSize {
  bytes: Uint8Array;
}

/**
 * Renders an artwork to PNG bytes on an offscreen (CPU raster) Skia surface: one pixel per cell
 * scaled by an integer factor with nearest-neighbor sampling, so every cell is a crisp square.
 * No watermark. `fill`: the cells shown in color ('all' for a finished artwork, the progress
 * bitset for a partial one; unfilled cells keep their light gray, as in the app). Empty
 * (non-colorable) cells are transparent, or `background` (a `#RRGGBB` color) when given.
 */
export function renderArtworkPng(artwork: Artwork, fill: ThumbnailFill, background: string | null): RenderedPng {
  const size = exportSize(artwork.width, artwork.height);
  const image = makeLayerImage(buildThumbnailPixels(artwork, fill), artwork.width, artwork.height);
  if (!image) throw new Error('png export: could not build the artwork image');
  const surface = Skia.Surface.Make(size.width, size.height);
  if (!surface) throw new Error('png export: could not create the offscreen surface');
  try {
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color(background ?? 'transparent'));
    canvas.drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, artwork.width, artwork.height),
      Skia.XYWHRect(0, 0, size.width, size.height),
      FilterMode.Nearest,
      MipmapMode.None,
      null,
    );
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const bytes = snapshot.encodeToBytes(ImageFormat.PNG, 100);
    snapshot.dispose();
    if (!bytes || bytes.length === 0) throw new Error('png export: encoding failed');
    return { ...size, bytes };
  } finally {
    image.dispose();
    surface.dispose();
  }
}
