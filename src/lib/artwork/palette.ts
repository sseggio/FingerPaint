import { SYMBOL_SPECS } from '@/lib/symbols';

import { hexToRgb } from './color';
import type { HexColor, Palette } from './types';
import { MAX_COLORS } from './types';

/** Colorblind-mode symbol ids (see `src/lib/symbols.ts`), one per palette slot (MAX_COLORS entries). */
export const SYMBOLS: readonly string[] = SYMBOL_SPECS.map((s) => s.id);

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
