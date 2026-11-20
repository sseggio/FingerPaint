import { PNG } from 'pngjs';

import { decode, hexToRgb } from './artwork-lib';

export interface PreviewInput {
  w: number;
  h: number;
  palette: readonly string[];
  rows: readonly string[];
}

/** Target size of the longest side of the enlarged preview, in pixels. */
const PREVIEW_SIDE = 384;

/**
 * Renders the artwork as an enlarged PNG (empty cells as a light checkerboard). `side` is the
 * target longest side; 1 gives one pixel per cell (the admin UI zooms it with CSS).
 */
export function renderPreview(art: PreviewInput, side = PREVIEW_SIDE): Buffer {
  const { cells } = decode(art.rows, art.w, art.h, art.palette.length);
  const scale = Math.max(1, Math.floor(side / Math.max(art.w, art.h)));
  const rgb = art.palette.map((hex) => hexToRgb(hex));
  const png = new PNG({ width: art.w * scale, height: art.h * scale });
  const half = Math.max(1, scale >> 1);
  for (let py = 0; py < png.height; py++) {
    const y = Math.floor(py / scale);
    for (let px = 0; px < png.width; px++) {
      const x = Math.floor(px / scale);
      const v = cells[y * art.w + x];
      const o = (py * png.width + px) * 4;
      if (v > 0) {
        const [r, g, b] = rgb[v - 1];
        png.data[o] = r;
        png.data[o + 1] = g;
        png.data[o + 2] = b;
      } else {
        const light = (Math.floor(px / half) + Math.floor(py / half)) % 2 === 0;
        const c = light ? 0xf4 : 0xe6;
        png.data[o] = c;
        png.data[o + 1] = c;
        png.data[o + 2] = c;
      }
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
