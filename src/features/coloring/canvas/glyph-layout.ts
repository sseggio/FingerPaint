/** Sprite layout of the number atlas texture (pure, no Skia: usable in tests and worklets). */

/** Side of one sprite in the texture (px). Large enough to stay crisp at 48 pt × 3x. */
export const GLYPH_SPRITE_PX = 96;
export const GLYPH_COLUMNS = 8;

/** Source rectangle of sprite `index` in the texture. Pure (also used in worklets). */
export function glyphSpriteRect(
  index: number,
  spritePx = GLYPH_SPRITE_PX,
  columns = GLYPH_COLUMNS,
): { x: number; y: number; width: number; height: number } {
  'worklet';
  return {
    x: (index % columns) * spritePx,
    y: Math.floor(index / columns) * spritePx,
    width: spritePx,
    height: spritePx,
  };
}

/** Texture size (px) for `count` sprites. */
export function glyphAtlasSize(count: number, spritePx = GLYPH_SPRITE_PX, columns = GLYPH_COLUMNS) {
  const cols = Math.max(1, Math.min(columns, count));
  return { width: cols * spritePx, height: Math.max(1, Math.ceil(count / columns)) * spritePx };
}
