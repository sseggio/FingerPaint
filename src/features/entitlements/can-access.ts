import type { ArtworkAccess } from '@/lib/artwork/types';

/** Where the current entitlements come from (F12 adds the real providers). */
export type EntitlementsSource = 'none' | 'mock' | 'storekit';

/** What the user owns. Tools and hints are never gated: only content access is. */
export interface Entitlements {
  pro: boolean;
  /** Content pack ids owned (e.g. `ocean`). */
  packs: readonly string[];
  source: EntitlementsSource;
}

/** Nothing purchased: every free artwork, and only those. */
export const DEFAULT_ENTITLEMENTS: Entitlements = Object.freeze({ pro: false, packs: Object.freeze([]), source: 'none' });

/** Why an artwork is locked, or null when it can be opened. */
export type LockReason = 'pro' | 'pack';

/**
 * Pure gating rule. Free artworks are always accessible. Pro unlocks Pro artworks only: packs
 * are separate content purchases and are never implied by Pro.
 */
export function canAccess(access: ArtworkAccess, entitlements: Entitlements): boolean {
  return lockReason(access, entitlements) === null;
}

export function lockReason(access: ArtworkAccess, entitlements: Entitlements): LockReason | null {
  if (access === 'free') return null;
  if (access === 'pro') return entitlements.pro ? null : 'pro';
  if (typeof access === 'object' && access !== null && typeof access.pack === 'string') {
    return entitlements.packs.includes(access.pack) ? null : 'pack';
  }
  // Unknown access value (should have been rejected by validation): fail closed.
  return 'pro';
}
