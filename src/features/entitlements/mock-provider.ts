import { defaultBackend, readValue, removeValue, StorageKeys, writeValue, type Schema, type StorageBackend } from '@/lib/storage';

import { normalizeSkus } from './catalog';
import { ALL_SKUS, type EntitlementsProvider, type ProviderListener, type PurchaseResult, type Sku, type StoreProduct } from './types';

/** What the next mock purchase does (dev panel). */
export type MockOutcome = 'success' | 'cancel' | 'error' | 'pending';

export const MOCK_OUTCOMES: readonly MockOutcome[] = ['success', 'cancel', 'error', 'pending'];

/** Fake prices, clearly marked as such: real prices always come from the store. */
const MOCK_PRICES: Readonly<Record<Sku, string>> = {
  'com.fingerpaint.app.pro': '4,99 € (mock)',
  'com.fingerpaint.app.pack.ocean': '2,99 € (mock)',
  'com.fingerpaint.app.pack.neon': '1,99 € (mock)',
};

interface MockLedger {
  owned: Sku[];
}

/** The mock "store side" ledger (what a real store would remember across reinstalls). */
export const mockLedgerSchema: Schema<MockLedger> = {
  version: 1,
  migrations: {},
  guard: (data: unknown): data is MockLedger =>
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as MockLedger).owned) &&
    (data as MockLedger).owned.every((s) => typeof s === 'string'),
  defaults: () => ({ owned: [] }),
};

export interface MockProviderOptions {
  backend?: StorageBackend;
  /** Simulated store latency (ms). */
  delayMs?: number;
}

const wait = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/**
 * `EXPO_PUBLIC_IAP_PROVIDER=mock`: simulates a store locally (development and internal builds
 * only). Its ledger lives under `fp:mock-store`, separate from the entitlements cache, so
 * "Restore purchases" behaves like a real store after the cache is wiped.
 */
export class MockProvider implements EntitlementsProvider {
  readonly kind = 'mock' as const;
  readonly available = true;
  private readonly backend: StorageBackend;
  private readonly delayMs: number;
  private owned = new Set<Sku>();
  private pending = new Set<Sku>();
  private loading: Promise<void> | null = null;
  private nextOutcome: MockOutcome = 'success';
  private readonly listeners = new Set<ProviderListener>();

  constructor(options: MockProviderOptions = {}) {
    this.backend = options.backend ?? defaultBackend;
    this.delayMs = options.delayMs ?? 0;
  }

  init(): Promise<void> {
    this.loading ??= readValue(StorageKeys.mockStore, mockLedgerSchema, this.backend).then(({ data }) => {
      this.owned = new Set(normalizeSkus(data.owned));
    });
    return this.loading;
  }

  async getProducts(): Promise<StoreProduct[]> {
    await this.init();
    await wait(this.delayMs);
    return ALL_SKUS.map((sku) => ({ sku, displayPrice: MOCK_PRICES[sku] }));
  }

  /** Dev panel: the outcome of the next purchase only (then back to success). */
  setNextOutcome(outcome: MockOutcome): void {
    this.nextOutcome = outcome;
  }

  getNextOutcome(): MockOutcome {
    return this.nextOutcome;
  }

  async purchase(sku: Sku): Promise<PurchaseResult> {
    await this.init();
    await wait(this.delayMs);
    const outcome = this.nextOutcome;
    this.nextOutcome = 'success';
    switch (outcome) {
      case 'cancel':
        return { status: 'cancelled', sku };
      case 'error':
        return { status: 'error', sku, error: 'failed' };
      case 'pending':
        this.pending.add(sku);
        return { status: 'pending', sku };
      default:
        await this.grant([sku]);
        return { status: 'purchased', sku };
    }
  }

  /** Dev panel: approves pending purchases (simulates Ask to Buy), delivered through `subscribe`. */
  async approvePending(): Promise<void> {
    const skus = [...this.pending];
    this.pending.clear();
    if (skus.length > 0) await this.grant(skus);
  }

  async restore(): Promise<readonly Sku[]> {
    await this.init();
    await wait(this.delayMs);
    return normalizeSkus([...this.owned]);
  }

  subscribe(listener: ProviderListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Dev panel: forgets every mock purchase. */
  async reset(): Promise<void> {
    await this.init();
    this.owned.clear();
    this.pending.clear();
    this.nextOutcome = 'success';
    await removeValue(StorageKeys.mockStore, this.backend);
  }

  private async grant(skus: readonly Sku[]): Promise<void> {
    for (const sku of skus) this.owned.add(sku);
    await writeValue(StorageKeys.mockStore, { owned: normalizeSkus([...this.owned]) }, mockLedgerSchema, this.backend);
    // Like a real store: the app is told (and persists) before the transaction is "finished".
    await Promise.all([...this.listeners].map((l) => l(skus)));
  }
}
