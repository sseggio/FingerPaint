import { matchFont, Skia, type SkImage } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

import { colors } from '@/theme';

import { GLYPH_COLUMNS, GLYPH_SPRITE_PX, glyphAtlasSize, glyphSpriteRect } from './glyph-layout';

/**
 * Pre-rendered texture of the cell numbers (1..n), drawn with Skia's `Atlas`: one draw call for
 * every visible number instead of one text draw per cell.
 */

/** Font size relative to the sprite (two digits must fit with a margin). */
const FONT_RATIO = 0.5;

export interface GlyphAtlas {
  image: SkImage;
  /** Number of sprites; sprite i shows the number i + 1. */
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
 * Renders numbers 1..count into a CPU raster image (safe to share with the UI thread).
 * Returns null when Skia cannot allocate the surface or find a font (numbers are then skipped).
 */
export function createNumberAtlas(count: number, spritePx = GLYPH_SPRITE_PX, columns = GLYPH_COLUMNS): GlyphAtlas | null {
  if (count <= 0) return null;
  const { width, height } = glyphAtlasSize(count, spritePx, columns);
  const surface = Skia.Surface.Make(width, height);
  const font = numberFont(spritePx * FONT_RATIO);
  if (!surface || !font) return null;
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  // Cells under numbers are always light grays (see layers.ts), in both themes.
  paint.setColor(Skia.Color(colors.light.ink));
  const metrics = font.getMetrics();
  // Vertical center: baseline offset by half the cap height (ascent is negative).
  const baseline = spritePx / 2 - (metrics.ascent + metrics.descent) / 2;
  for (let i = 0; i < count; i++) {
    const text = String(i + 1);
    const { x, y } = glyphSpriteRect(i, spritePx, columns);
    const textWidth = font.measureText(text).width;
    canvas.drawText(text, x + (spritePx - textWidth) / 2, y + baseline, paint, font);
  }
  surface.flush();
  const image = surface.makeImageSnapshot();
  return { image, count, spritePx, columns };
}
