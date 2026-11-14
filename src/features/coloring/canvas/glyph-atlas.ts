import { matchFont, PaintStyle, Skia, StrokeJoin, type SkCanvas, type SkFont, type SkImage, type SkPaint } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

import { GLYPH_COLUMNS, GLYPH_SPRITE_PX, glyphAtlasSize, glyphSpriteIndex, glyphSpriteRect } from './glyph-layout';
import { NUMBER_INK_DARK, NUMBER_INK_LIGHT } from './layers';
import { buildSymbolPaths } from './symbol-paths';

/**
 * Pre-rendered texture of the cell glyphs (numbers 1..n, or colorblind symbols), drawn with
 * Skia's `Atlas`: one draw call for every visible glyph instead of one text draw per cell.
 */

/** Font size relative to the sprite (two digits must fit with a margin). */
const FONT_RATIO = 0.5;
const FONT_RATIO_LARGE = 0.62;
/** Symbol box relative to the sprite. */
const SYMBOL_RATIO = 0.52;
const SYMBOL_RATIO_LARGE = 0.64;
/** High-contrast halo (in the opposite ink) around each glyph, relative to the sprite. */
const HALO_RATIO = 0.09;

export interface GlyphAtlasOptions {
  /** Colorblind mode: one symbol id per palette color (drawn instead of the numbers). */
  symbols?: readonly string[] | null;
  /** Large-numbers mode: bigger glyphs. */
  large?: boolean;
  /** High-contrast mode: glyphs get a halo in the opposite ink. */
  highContrast?: boolean;
}

export interface GlyphAtlas {
  image: SkImage;
  /** Glyphs in the texture (1..count), each in both inks (see `glyphSpriteIndex`). */
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

function makePaint(color: string, halo: number): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  if (halo > 0) {
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(halo);
    paint.setStrokeJoin(StrokeJoin.Round);
  }
  return paint;
}

function drawNumber(canvas: SkCanvas, font: SkFont, n: number, x: number, y: number, spritePx: number, paints: SkPaint[]) {
  const metrics = font.getMetrics();
  // Vertical center: baseline offset by half the cap height (ascent is negative).
  const baseline = spritePx / 2 - (metrics.ascent + metrics.descent) / 2;
  const text = String(n);
  const textWidth = font.measureText(text).width;
  for (const paint of paints) canvas.drawText(text, x + (spritePx - textWidth) / 2, y + baseline, paint, font);
}

function drawSymbol(
  canvas: SkCanvas,
  id: string,
  x: number,
  y: number,
  spritePx: number,
  ratio: number,
  ink: string,
  halo: string | null,
) {
  const size = spritePx * ratio;
  const paths = buildSymbolPaths(id, x + (spritePx - size) / 2, y + (spritePx - size) / 2, size);
  if (!paths) return;
  const haloWidth = spritePx * HALO_RATIO;
  if (halo) {
    // Halo: every part stroked wider in the opposite ink, under the glyph.
    const paint = makePaint(halo, haloWidth);
    if (paths.fill) canvas.drawPath(paths.fill, paint);
    if (paths.stroke) {
      paint.setStrokeWidth(paths.strokeWidth + haloWidth);
      canvas.drawPath(paths.stroke, paint);
    }
  }
  if (paths.fill) canvas.drawPath(paths.fill, makePaint(ink, 0));
  if (paths.stroke) canvas.drawPath(paths.stroke, makePaint(ink, paths.strokeWidth));
}

/**
 * Renders glyphs 1..count, in the dark then the light ink, into a CPU raster image (safe to
 * share with the UI thread). Returns null when Skia cannot allocate the surface or find a font
 * (glyphs are then skipped).
 */
export function createNumberAtlas(
  count: number,
  options: GlyphAtlasOptions = {},
  spritePx = GLYPH_SPRITE_PX,
  columns = GLYPH_COLUMNS,
): GlyphAtlas | null {
  if (count <= 0) return null;
  const { symbols = null, large = false, highContrast = false } = options;
  const { width, height } = glyphAtlasSize(count * 2, spritePx, columns);
  const surface = Skia.Surface.Make(width, height);
  const font = symbols ? null : numberFont(spritePx * (large ? FONT_RATIO_LARGE : FONT_RATIO));
  if (!surface || (!symbols && !font)) return null;
  const canvas = surface.getCanvas();
  // The ink of each palette color is picked for AA contrast on its gray (see numberInkIsLight).
  for (const light of [false, true]) {
    const ink = light ? NUMBER_INK_LIGHT : NUMBER_INK_DARK;
    const halo = highContrast ? (light ? NUMBER_INK_DARK : NUMBER_INK_LIGHT) : null;
    const paints = halo ? [makePaint(halo, spritePx * HALO_RATIO), makePaint(ink, 0)] : [makePaint(ink, 0)];
    for (let n = 1; n <= count; n++) {
      const { x, y } = glyphSpriteRect(glyphSpriteIndex(n, count, light), spritePx, columns);
      const symbol = symbols?.[n - 1];
      if (symbols) {
        if (symbol) drawSymbol(canvas, symbol, x, y, spritePx, large ? SYMBOL_RATIO_LARGE : SYMBOL_RATIO, ink, halo);
      } else if (font) {
        drawNumber(canvas, font, n, x, y, spritePx, paints);
      }
    }
  }
  surface.flush();
  const image = surface.makeImageSnapshot();
  return { image, count, spritePx, columns };
}
