/**
 * Pure artwork modules shared with the app (imported, never duplicated): RLE codec, color math
 * and the content validator. See docs/artwork-format.md.
 */
export { decode, encodeRow } from '../../src/lib/artwork/codec';
export { deltaE76, hexToRgb, luminance, rgbToLab } from '../../src/lib/artwork/color';
export type { Lab } from '../../src/lib/artwork/color';
export type { ArtworkAccess, ArtworkSource, Difficulty, HexColor } from '../../src/lib/artwork/types';
export { KEYS, MAX_COLORS, MAX_SIZE, MIN_COLORS, MIN_DELTA_E, MIN_SIZE } from '../../src/lib/artwork/types';
export { formatIssue, validateArtwork } from '../../src/lib/artwork/validate';
export type { ValidationIssue } from '../../src/lib/artwork/validate';
