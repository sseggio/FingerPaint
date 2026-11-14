import type { EntitlementsProvider, PurchaseResult, Sku, StoreProduct } from './types';

/**
 * `EXPO_PUBLIC_IAP_PROVIDER=none` (default): nothing can be bought. Every free artwork works
 * and the shop honestly says "coming soon". Owns nothing, sells nothing.
 */
export class NoopProvider implements EntitlementsProvider {
  readonly kind = 'none' as const;
  readonly available = false;

  async init(): Promise<void> {}

  async getProducts(): Promise<StoreProduct[]> {
    return [];
  }

  async purchase(sku: Sku): Promise<PurchaseResult> {
    return { status: 'error', sku, error: 'unavailable' };
  }

  async restore(): Promise<readonly Sku[]> {
    return [];
  }

  subscribe(): () => void {
    return () => undefined;
  }
}
