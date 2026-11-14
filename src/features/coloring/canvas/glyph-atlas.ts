import { matchFont, Skia, type SkImage } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

import { GLYPH_COLUMNS, GLYPH_SPRITE_PX, glyphAtlasSize, glyphSpriteIndex, glyphSpriteRect } from './glyph-layout';
import { NUMBER_INK_DARK, NUMBER_INK_LIGHT } from './layers';

/**
 * Pre-rendered texture of the cell numbers (1..n), drawn with Skia's `Atlas`: one draw call for
 * every visible number instead of one text draw per cell.
 */

/** Font size relative to the sprite (two digits must fit with a margin). */
const FONT_RATIO = 0.5;

export interface GlyphAtlas {
  image: SkImage;
  /** Numbers in the texture (1..count), each in both inks (see `glyphSpriteIndex`). */
  count: number;
  spritePx: number;
  columns: number;
}

/** Bold system font; `matchFont` needs a concrete family name on each platform. */
function numberFont(size: number) {
  const fontFamily = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' });
  try {
    return matchFont({ fontFamily, fontSize: size, fontWeight: 'bold' });
  } catch {
    return null;
  }
}

/**
 * Renders numbers 1..count, in the dark then the light ink, into a CPU raster image (safe to share with the UI thread).
 * Returns null when Skia cannot allocate the surface or find a font (numbers are then skipped).
 */
export function createNumberAtlas(count: number, spritePx = GLYPH_SPRITE_PX, columns = GLYPH_COLUMNS): GlyphAtlas | null {
  if (count <= 0) return null;
  const { width, height } = glyphAtlasSize(count * 2, spritePx, columns);
  const surface = Skia.Surface.Make(width, height);
  const font = numberFont(spritePx * FONT_RATIO);
  if (!surface || !font) return null;
  const canvas = surface.getCanvas();
  const metrics = font.getMetrics();
  // Vertical center: baseline offset by half the cap height (ascent is negative).
  const baseline = spritePx / 2 - (metrics.ascent + metrics.descent) / 2;
  // The ink of each palette color is picked for AA contrast on its gray (see numberInkIsLight).
  for (const light of [false, true]) {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(light ? NUMBER_INK_LIGHT : NUMBER_INK_DARK));
    for (let n = 1; n <= count; n++) {
      const text = String(n);
      const { x, y } = glyphSpriteRect(glyphSpriteIndex(n, count, light), spritePx, columns);
      const textWidth = font.measureText(text).width;
      canvas.drawText(text, x + (spritePx - textWidth) / 2, y + baseline, paint, font);
    }
  }
  surface.flush();
  const image = surface.makeImageSnapshot();
  return { image, count, spritePx, columns };
}
