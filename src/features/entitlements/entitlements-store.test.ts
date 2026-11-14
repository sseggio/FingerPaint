import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEnvelope, StorageKeys } from '@/lib/storage';

import { DEFAULT_ENTITLEMENTS } from './can-access';
import { createEntitlementsStore, isEntitlementsCache } from './entitlements-store';
import { MockProvider } from './mock-provider';
import { NoopProvider } from './noop-provider';
import { ALL_SKUS, SKUS, type EntitlementsProvider, type ProviderListener, type Sku } from './types';

async function stored() {
  const raw = await AsyncStorage.getItem(StorageKeys.entitlements);
  return raw ? JSON.parse(raw) : null;
}

/** A controllable store-backed provider (stands in for StoreKit). */
function fakeStore(owned: Sku[] = []) {
  const listeners = new Set<ProviderListener>();
  const state = { owned: [...owned], offline: false };
  const provider: EntitlementsProvider & { state: typeof state; push(skus: Sku[]): Promise<void> } = {
    kind: 'storekit',
    available: true,
    state,
    init: jest.fn(async () => {
      if (state.offline) throw new Error('offline');
    }),
    getProducts: jest.fn(async () => {
      if (state.offline) throw new Error('offline');
      return ALL_SKUS.map((sku) => ({ sku, displayPrice: '1,99 €' }));
    }),
    purchase: jest.fn(async (sku: Sku) => {
      state.owned.push(sku);
      await Promise.all([...listeners].map((l) => l([sku])));
      return { status: 'purchased' as const, sku };
    }),
    restore: jest.fn(async () => {
      if (state.offline) throw new Error('offline');
      return [...state.owned];
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async push(skus) {
      await Promise.all([...listeners].map((l) => l(skus)));
    },
  };
  return provider;
}

/** Hydrates, then waits for the background store refresh started by `hydrate`. */
async function settle(store: ReturnType<typeof createEntitlementsStore>) {
  await store.getState().hydrate();
  await store.getState().connect();
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('entitlements cache validation', () => {
  it.each([
    [{ owned: [], source: 'none' }, true],
    [{ owned: [SKUS.pro], source: 'storekit' }, true],
    [{ owned: 'pro', source: 'storekit' }, false],
    [{ owned: [1], source: 'storekit' }, false],
    [{ owned: [], source: 'hacked' }, false],
    [[], false],
    [null, false],
  ])('%p → %p', (value, expected) => {
    expect(isEntitlementsCache(value)).toBe(expected);
  });
});

describe('entitlements store (none)', () => {
  it('owns nothing, sells nothing, and never writes', async () => {
    const store = createEntitlementsStore({ provider: new NoopProvider() });
    await settle(store);
    expect(store.getState()).toMatchObject({ hydrated: true, storeStatus: 'unavailable', entitlements: DEFAULT_ENTITLEMENTS });
    await expect(store.getState().purchase(SKUS.pro)).resolves.toEqual({ status: 'error', sku: SKUS.pro, error: 'unavailable' });
    await expect(store.getState().restore()).resolves.toEqual({ status: 'unavailable' });
    expect(store.getState().entitlements).toBe(DEFAULT_ENTITLEMENTS);
    expect(await stored()).toBeNull();
  });

  it('ignores a cache written by another provider (a mock purchase never leaks)', async () => {
    await AsyncStorage.setItem(
      StorageKeys.entitlements,
      JSON.stringify(createEnvelope({ owned: [SKUS.pro], source: 'mock' }, 1)),
    );
    const store = createEntitlementsStore({ provider: new NoopProvider() });
    await settle(store);
    expect(store.getState().entitlements).toBe(DEFAULT_ENTITLEMENTS);
  });
});

describe('entitlements store (mock)', () => {
  it('unlocks immediately on purchase and persists across launches', async () => {
    const store = createEntitlementsStore({ provider: new MockProvider() });
    await settle(store);
    await store.getState().connect();
    expect(store.getState().storeStatus).toBe('ready');
    expect(store.getState().products[SKUS.pro]?.displayPrice).toMatch(/mock/);

    const pending = store.getState().purchase(SKUS.pro);
    expect(store.getState().busy).toBe(SKUS.pro);
    await expect(pending).resolves.toEqual({ status: 'purchased', sku: SKUS.pro });
    expect(store.getState()).toMatchObject({ busy: null, entitlements: { pro: true, packs: [], source: 'mock' } });
    expect(await stored()).toMatchObject({ schemaVersion: 1, data: { owned: [SKUS.pro], source: 'mock' } });

    const relaunched = createEntitlementsStore({ provider: new MockProvider() });
    await settle(relaunched);
    expect(relaunched.getState().entitlements.pro).toBe(true);
  });

  it('cancellation and errors unlock nothing', async () => {
    const provider = new MockProvider();
    const store = createEntitlementsStore({ provider });
    await settle(store);
    provider.setNextOutcome('cancel');
    await expect(store.getState().purchase(SKUS.neonPack)).resolves.toMatchObject({ status: 'cancelled' });
    provider.setNextOutcome('error');
    await expect(store.getState().purchase(SKUS.neonPack)).resolves.toMatchObject({ status: 'error' });
    expect(store.getState().entitlements).toBe(DEFAULT_ENTITLEMENTS);
    expect(await stored()).toBeNull();
  });

  it('refuses a second purchase while one is in flight', async () => {
    const store = createEntitlementsStore({ provider: new MockProvider({ delayMs: 5 }) });
    await settle(store);
    const first = store.getState().purchase(SKUS.pro);
    await expect(store.getState().purchase(SKUS.neonPack)).resolves.toMatchObject({ status: 'error' });
    await first;
    expect(store.getState().owned).toEqual([SKUS.pro]);
  });

  it('grants pending purchases when the store approves them later', async () => {
    const provider = new MockProvider();
    const store = createEntitlementsStore({ provider });
    await settle(store);
    provider.setNextOutcome('pending');
    await expect(store.getState().purchase(SKUS.neonPack)).resolves.toMatchObject({ status: 'pending' });
    expect(store.getState().entitlements.packs).toEqual([]);
    await provider.approvePending();
    expect(store.getState().entitlements.packs).toEqual(['neon']);
  });

  it('restores from the mock ledger after the cache is lost, idempotently', async () => {
    const provider = new MockProvider();
    const first = createEntitlementsStore({ provider });
    await settle(first);
    await first.getState().purchase(SKUS.oceanPack);
    await AsyncStorage.removeItem(StorageKeys.entitlements);

    const store = createEntitlementsStore({ provider: new MockProvider() });
    // Hydration refreshes silently from the "store" in the background.
    await settle(store);
    expect(store.getState().entitlements.packs).toEqual(['ocean']);
    const writes = AsyncStorage.multiSet as jest.Mock;
    const before = writes.mock.calls.length;
    await expect(store.getState().restore()).resolves.toEqual({ status: 'restored', count: 1 });
    await expect(store.getState().restore()).resolves.toEqual({ status: 'restored', count: 1 });
    expect(store.getState().entitlements).toEqual({ pro: false, packs: ['ocean'], source: 'mock' });
    // Nothing changed: nothing rewritten.
    expect(writes.mock.calls.length).toBe(before);
  });

  it('clear() forgets everything (dev panel)', async () => {
    const store = createEntitlementsStore({ provider: new MockProvider() });
    await settle(store);
    await store.getState().purchase(SKUS.pro);
    await store.getState().clear();
    expect(store.getState().entitlements).toBe(DEFAULT_ENTITLEMENTS);
    expect(await stored()).toMatchObject({ data: { owned: [] } });
  });
});

describe('entitlements store (store-backed, offline-first)', () => {
  it('works offline from the cache, then the store becomes the source of truth', async () => {
    await AsyncStorage.setItem(
      StorageKeys.entitlements,
      JSON.stringify(createEnvelope({ owned: [SKUS.pro, SKUS.neonPack], source: 'storekit' }, 1)),
    );
    const provider = fakeStore([SKUS.pro]);
    provider.state.offline = true;
    const store = createEntitlementsStore({ provider });
    await settle(store);
    // Offline: the cached purchases still unlock everything.
    expect(store.getState()).toMatchObject({ storeStatus: 'offline', entitlements: { pro: true, packs: ['neon'] } });
    await expect(store.getState().restore()).resolves.toEqual({ status: 'error' });
    expect(store.getState().entitlements.packs).toEqual(['neon']);

    // Back online: the store's answer replaces the cache (the neon pack was refunded).
    provider.state.offline = false;
    await store.getState().connect();
    expect(store.getState()).toMatchObject({ storeStatus: 'ready', entitlements: { pro: true, packs: [] } });
    expect(store.getState().products[SKUS.pro]?.displayPrice).toBe('1,99 €');
    expect(await stored()).toMatchObject({ data: { owned: [SKUS.pro], source: 'storekit' } });
  });

  it('falls back to nothing on a corrupt or future cache', async () => {
    for (const raw of ['{"broken', JSON.stringify(createEnvelope({ owned: [SKUS.pro], source: 'storekit' }, 99))]) {
      await AsyncStorage.setItem(StorageKeys.entitlements, raw);
      const provider = fakeStore();
      provider.state.offline = true;
      const store = createEntitlementsStore({ provider });
      await settle(store);
      expect(store.getState().entitlements).toBe(DEFAULT_ENTITLEMENTS);
    }
  });

  it('drops unknown SKUs found in the cache', async () => {
    await AsyncStorage.setItem(
      StorageKeys.entitlements,
      JSON.stringify(createEnvelope({ owned: ['com.fingerpaint.app.everything', SKUS.oceanPack], source: 'storekit' }, 1)),
    );
    const provider = fakeStore();
    provider.state.offline = true;
    const store = createEntitlementsStore({ provider });
    await settle(store);
    expect(store.getState().owned).toEqual([SKUS.oceanPack]);
  });

  it('applies grants pushed by the store (interrupted purchase replayed at launch)', async () => {
    const provider = fakeStore();
    const store = createEntitlementsStore({ provider });
    await settle(store);
    await provider.push([SKUS.oceanPack]);
    expect(store.getState().entitlements.packs).toEqual(['ocean']);
    expect(await stored()).toMatchObject({ data: { owned: [SKUS.oceanPack] } });
  });

  it('never rejects when the provider throws during a purchase', async () => {
    const provider = fakeStore();
    (provider.purchase as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const store = createEntitlementsStore({ provider });
    await expect(store.getState().purchase(SKUS.pro)).resolves.toEqual({ status: 'error', sku: SKUS.pro, error: 'failed' });
    expect(store.getState().busy).toBeNull();
  });
});
