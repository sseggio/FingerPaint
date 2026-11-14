import { create } from 'zustand';

import { DEFAULT_ENTITLEMENTS, type Entitlements } from './can-access';

/**
 * Current entitlements. V1 ships with nothing purchasable yet: the state stays at its default
 * until F12 wires the purchase providers (and persistence) in.
 */
export interface EntitlementsState {
  entitlements: Entitlements;
}

export const useEntitlementsStore = create<EntitlementsState>()(() => ({
  entitlements: DEFAULT_ENTITLEMENTS,
}));
