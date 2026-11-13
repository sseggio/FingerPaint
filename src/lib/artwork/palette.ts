import { hexToRgb } from './color';
import type { HexColor, Palette } from './types';
import { MAX_COLORS } from './types';

/** Colorblind-mode symbols, one per palette slot (MAX_COLORS entries). */
export const SYMBOLS: readonly string[] = [
  '●', '▲', '■', '◆', '★', '♥', '♣', '♠', '✚', '✖',
  '▼', '◀', '▶', '◐', '◑', '◒', '◓', '☀', '☾', '♪',
  '✦', '✿', '❖', '⬟', '⬢', '○', '△', '□', '◇', '☆',
  '♡', '♧', '♤', '✕', '▽', '◁', '▷', '◎', '◉', '✧',
];

if (SYMBOLS.length < MAX_COLORS || new Set(SYMBOLS).size !== SYMBOLS.length) {
  throw new Error('SYMBOLS must hold MAX_COLORS unique entries');
}

/** Builds the runtime palette: number = index + 1, symbol = SYMBOLS[index]. */
export function buildPalette(hexes: readonly HexColor[]): Palette {
  return {
    colors: hexes.map((hex, i) => ({
      hex,
      rgb: hexToRgb(hex),
      number: i + 1,
      symbol: SYMBOLS[i % SYMBOLS.length],
    })),
  };
}
