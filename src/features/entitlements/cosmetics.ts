import type { Entitlements } from './can-access';

/** Look of the coloring canvas. */
export type CanvasStyle = 'classic' | 'neon';
/** Colors of the completion confetti. */
export type ConfettiStyle = 'classic' | 'neon' | 'gold';

export interface Cosmetics {
  canvas: CanvasStyle;
  confetti: ConfettiStyle;
}

/** The user's cosmetic toggles (Settings): owned cosmetics are on by default, and can be turned off. */
export interface CosmeticPreferences {
  neonTheme: boolean;
  goldConfetti: boolean;
}

export const CLASSIC_COSMETICS: Cosmetics = Object.freeze({ canvas: 'classic', confetti: 'classic' });

export function ownsNeon(entitlements: Entitlements): boolean {
  return entitlements.packs.includes('neon');
}

/** Gold confetti is Pro's bonus cosmetic. */
export function ownsGold(entitlements: Entitlements): boolean {
  return entitlements.pro;
}

/**
 * Pure: which cosmetics apply. A cosmetic applies only when owned AND enabled; Neon (a whole
 * theme) wins over Pro's gold confetti when both are on.
 */
export function resolveCosmetics(entitlements: Entitlements, prefs: CosmeticPreferences): Cosmetics {
  const neon = prefs.neonTheme && ownsNeon(entitlements);
  const gold = prefs.goldConfetti && ownsGold(entitlements);
  if (!neon && !gold) return CLASSIC_COSMETICS;
  return { canvas: neon ? 'neon' : 'classic', confetti: neon ? 'neon' : 'gold' };
}
