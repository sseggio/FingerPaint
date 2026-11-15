import { router } from 'expo-router';

import { lockReason, type Entitlements, type LockReason } from '@/features/entitlements/can-access';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import type { ArtworkAccess } from '@/lib/artwork/types';

export type ArtworkRoute =
  | { pathname: '/color/[artworkId]'; params: { artworkId: string; replay?: '1' } }
  | { pathname: '/shop'; params: { reason: LockReason } };

/**
 * Navigation guard: an accessible artwork opens the coloring screen; a locked one never
 * does, it opens the shop instead (with the reason, for an honest explanation).
 */
export function artworkRoute(artwork: { id: string; access: ArtworkAccess }, entitlements: Entitlements): ArtworkRoute {
  const reason = lockReason(artwork.access, entitlements);
  if (reason) return { pathname: '/shop', params: { reason } };
  return { pathname: '/color/[artworkId]', params: { artworkId: artwork.id } };
}

/** `replay`: replay the coloring of a finished artwork when it opens (F18, "Watch again"). */
export function openArtwork(artwork: { id: string; access: ArtworkAccess }, options: { replay?: boolean } = {}) {
  const route = artworkRoute(artwork, useEntitlementsStore.getState().entitlements);
  if (options.replay && route.pathname === '/color/[artworkId]') {
    router.push({ pathname: route.pathname, params: { ...route.params, replay: '1' } });
    return;
  }
  router.push(route);
}

const LOCK_REASONS: readonly unknown[] = ['pro', 'pack'];

/** Validates the shop's `reason` route param. */
export function parseLockReason(param: unknown): LockReason | null {
  const value = Array.isArray(param) ? param[0] : param;
  return LOCK_REASONS.includes(value) ? (value as LockReason) : null;
}
