import { create } from 'zustand';

import { defaultBackend, readValue, StorageKeys, writeValue, type Schema, type StorageBackend } from '@/lib/storage';

import { DEFAULT_ENTITLEMENTS, type Entitlements, type EntitlementsSource } from './can-access';
import { entitlementsFromSkus, normalizeSkus } from './catalog';
import { createProvider } from './provider';
import type { EntitlementsProvider, PurchaseResult, Sku, StoreProduct } from './types';

/** Offline cache of what the user owns (`fp:entitlements`). Never part of a backup. */
export interface EntitlementsCache {
  owned: Sku[];
  /** Provider that granted them: a cache written by another provider (e.g. mock) is ignored. */
  source: EntitlementsSource;
}

const SOURCES: readonly unknown[] = ['none', 'mock', 'storekit'];

export function isEntitlementsCache(value: unknown): value is EntitlementsCache {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return SOURCES.includes(v.source) && Array.isArray(v.owned) && v.owned.every((s) => typeof s === 'string');
}

export const entitlementsSchema: Schema<EntitlementsCache> = {
  version: 1,
  migrations: {},
  guard: isEntitlementsCache,
  defaults: () => ({ owned: [], source: 'none' }),
};

/** Store connection: `offline` keeps the cached entitlements and lets the user retry. */
export type StoreStatus = 'idle' | 'connecting' | 'ready' | 'offline' | 'unavailable';

export type RestoreResult = { status: 'restored'; count: number } | { status: 'unavailable' } | { status: 'error' };

export interface EntitlementsState {
  entitlements: Entitlements;
  owned: readonly Sku[];
  /** Products with their store price, by SKU (missing = not sold / not loaded). */
  products: Partial<Record<Sku, StoreProduct>>;
  storeStatus: StoreStatus;
  /** The purchase or restore in flight, if any. */
  busy: Sku | 'restore' | null;
  hydrated: boolean;
  provider: EntitlementsProvider;
  /** Reads the cache (instant, offline), then connects to the store in the background. Never rejects. */
  hydrate(): Promise<void>;
  /** Connects, loads prices and refreshes ownership from the store (silently). Never rejects. */
  connect(): Promise<void>;
  /** Buys a product; unlocked immediately on success. Never rejects. */
  purchase(sku: Sku): Promise<PurchaseResult>;
  /** "Restore purchases": the store's answer replaces the cache. Idempotent. Never rejects. */
  restore(): Promise<RestoreResult>;
  /** Dev panel: forgets everything owned (cache included). */
  clear(): Promise<void>;
}

export interface EntitlementsStoreOptions {
  provider?: EntitlementsProvider;
  backend?: StorageBackend;
}

function warn(message: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') console.warn(`[entitlements] ${message}`);
}

const sameSkus = (a: readonly Sku[], b: readonly Sku[]) => a.length === b.length && a.every((s, i) => s === b[i]);

export function createEntitlementsStore(options: EntitlementsStoreOptions = {}) {
  const provider = options.provider ?? createProvider();
  const backend = options.backend ?? defaultBackend;

  let writes: Promise<void> = Promise.resolve();
  const persist = (owned: readonly Sku[]) => {
    writes = writes.then(async () => {
      try {
        await writeValue(StorageKeys.entitlements, { owned: [...owned], source: provider.kind }, entitlementsSchema, backend);
      } catch (e) {
        warn(`write failed: ${String(e)}`);
      }
    });
    return writes;
  };

  /** True once the store answered: a late cache read must not resurrect revoked items. */
  let authoritative = false;
  let connecting: Promise<void> | null = null;

  return create<EntitlementsState>()((set, get) => {
    /**
     * Sequence number of each grant. A store answer requested at `since` must not revoke what
     * was granted after its request began (a purchase or an Ask to Buy approval racing the
     * launch-time silent restore): those grants are merged into the answer.
     */
    let grantSeq = 0;
    const grantedAt = new Map<Sku, number>();

    /** Replaces (store answer) or extends (grant) what is owned; persists only real changes. */
    const apply = async (skus: readonly unknown[], change: { mode: 'grant' } | { mode: 'replace'; since: number }) => {
      const current = get().owned;
      let next: Sku[];
      if (change.mode === 'grant') {
        const granted = normalizeSkus(skus);
        for (const sku of granted) grantedAt.set(sku, ++grantSeq);
        next = normalizeSkus([...current, ...granted]);
      } else {
        authoritative = true;
        const grantedSince = [...grantedAt].filter(([, seq]) => seq > change.since).map(([sku]) => sku);
        next = normalizeSkus([...skus, ...grantedSince]);
      }
      if (sameSkus(next, current)) return;
      set({ owned: next, entitlements: entitlementsFromSkus(next, provider.kind) });
      await persist(next);
    };

    provider.subscribe((granted) => apply(granted, { mode: 'grant' }));

    return {
      entitlements: DEFAULT_ENTITLEMENTS,
      owned: [],
      products: {},
      storeStatus: 'idle',
      busy: null,
      hydrated: false,
      provider,

      async hydrate() {
        const { data } = await readValue(StorageKeys.entitlements, entitlementsSchema, backend);
        if (!authoritative && data.source === provider.kind) {
          const merged = normalizeSkus([...data.owned, ...get().owned]);
          set({ owned: merged, entitlements: entitlementsFromSkus(merged, provider.kind) });
        }
        set({ hydrated: true });
        // Prices and the store's view of ownership arrive later; the cache already unlocks content.
        void get().connect();
      },

      connect() {
        if (!provider.available) {
          set({ storeStatus: 'unavailable' });
          return Promise.resolve();
        }
        connecting ??= (async () => {
          set({ storeStatus: 'connecting' });
          try {
            await provider.init();
            const products = await provider.getProducts();
            set({ products: Object.fromEntries(products.map((p) => [p.sku, p])), storeStatus: 'ready' });
          } catch (e) {
            warn(`store unreachable: ${String(e)}`);
            set({ storeStatus: 'offline' });
            return;
          }
          const since = grantSeq;
          try {
            await apply(await provider.restore({ silent: true }), { mode: 'replace', since });
          } catch (e) {
            // Offline: the cache stays the truth until the store answers.
            warn(`refresh failed: ${String(e)}`);
          }
        })().finally(() => {
          connecting = null;
        });
        return connecting;
      },

      async purchase(sku) {
        if (get().busy) return { status: 'error', sku, error: 'failed' };
        set({ busy: sku });
        try {
          const result = await provider.purchase(sku);
          if (result.status === 'purchased') await apply([sku], { mode: 'grant' });
          return result;
        } catch (e) {
          warn(`purchase failed: ${String(e)}`);
          return { status: 'error', sku, error: 'failed' };
        } finally {
          set({ busy: null });
        }
      },

      async restore() {
        if (!provider.available) return { status: 'unavailable' };
        if (get().busy) return { status: 'error' };
        set({ busy: 'restore' });
        const since = grantSeq;
        try {
          const owned = await provider.restore();
          await apply(owned, { mode: 'replace', since });
          if (get().storeStatus !== 'ready') void get().connect();
          return { status: 'restored', count: get().owned.length };
        } catch (e) {
          warn(`restore failed: ${String(e)}`);
          return { status: 'error' };
        } finally {
          set({ busy: null });
        }
      },

      async clear() {
        await apply([], { mode: 'replace', since: grantSeq });
      },
    };
  });
}

export const useEntitlementsStore = createEntitlementsStore();
