import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import { BYTES_PER_PIXEL } from './layers';

/** Wraps an RGBA layer buffer (w×h, unpremultiplied) in an SkImage. Null if Skia refuses it. */
export function makeLayerImage(pixels: Uint8Array, width: number, height: number): SkImage | null {
  if (pixels.length !== width * height * BYTES_PER_PIXEL) return null;
  const data = Skia.Data.fromBytes(pixels);
  return Skia.Image.MakeImage(
    { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    data,
    width * BYTES_PER_PIXEL,
  );
}
