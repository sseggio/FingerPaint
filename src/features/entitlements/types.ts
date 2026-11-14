import type { EntitlementsSource } from './can-access';

/** Non-consumable products sold in V1 (App Store Connect product ids). */
export const SKUS = {
  pro: 'com.fingerpaint.app.pro',
  oceanPack: 'com.fingerpaint.app.pack.ocean',
  neonPack: 'com.fingerpaint.app.pack.neon',
} as const;

export type Sku = (typeof SKUS)[keyof typeof SKUS];

export const ALL_SKUS: readonly Sku[] = Object.freeze([SKUS.pro, SKUS.oceanPack, SKUS.neonPack]);

export function isSku(value: unknown): value is Sku {
  return typeof value === 'string' && (ALL_SKUS as readonly string[]).includes(value);
}

/** A product as the store presents it (prices always come from the store, never hard-coded). */
export interface StoreProduct {
  sku: Sku;
  /** Localized, formatted price (e.g. "3,99 €"). */
  displayPrice: string;
  title?: string;
  description?: string;
}

/** `timeout`: the store did not answer in time; a purchase completed later is still granted. */
export type PurchaseErrorKind = 'unavailable' | 'network' | 'not-allowed' | 'failed' | 'timeout';

export type PurchaseResult =
  | { status: 'purchased'; sku: Sku }
  /** Waiting for approval (Ask to Buy, SCA…): unlocked later, when the store confirms. */
  | { status: 'pending'; sku: Sku }
  | { status: 'cancelled'; sku: Sku }
  | { status: 'error'; sku: Sku; error: PurchaseErrorKind };

/** Pushed by a provider when the store grants products outside of a `purchase()` call. */
export type ProviderListener = (granted: readonly Sku[]) => void | Promise<void>;

export interface RestoreOptions {
  /** Launch-time refresh: no sign-in prompt, failures are silent (the cache stays). */
  silent?: boolean;
}

/**
 * Purchase backend (mock, StoreKit via expo-iap, or none). Providers speak in SKUs; the store
 * turns them into `Entitlements` through the catalog.
 */
export interface EntitlementsProvider {
  readonly kind: EntitlementsSource;
  /** False when nothing can be bought in this build (the shop then says "coming soon"). */
  readonly available: boolean;
  /** Connects to the store. Rejects when the store is unreachable or unsupported. */
  init(): Promise<void>;
  /** Products the store knows about (unknown or unapproved ones are simply missing). */
  getProducts(): Promise<StoreProduct[]>;
  /**
   * Buys one product. Resolves with the outcome (never rejects). On success, listeners have
   * already been notified (and the grant persisted) before the transaction is finished.
   */
  purchase(sku: Sku): Promise<PurchaseResult>;
  /** Everything the user currently owns, according to the store. Rejects on failure. */
  restore(options?: RestoreOptions): Promise<readonly Sku[]>;
  /** Grants arriving outside of `purchase()` (interrupted purchases, Ask to Buy…). */
  subscribe(listener: ProviderListener): () => void;
}
