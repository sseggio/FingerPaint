import AsyncStorage from '@react-native-async-storage/async-storage';

import { StorageKeys } from '@/lib/storage';

import { MockProvider } from './mock-provider';
import { SKUS } from './types';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('MockProvider', () => {
  it('lists every product with a clearly fake price', async () => {
    const products = await new MockProvider().getProducts();
    expect(products.map((p) => p.sku)).toEqual([SKUS.pro, SKUS.oceanPack, SKUS.neonPack]);
    for (const p of products) expect(p.displayPrice).toMatch(/\(mock\)$/);
  });

  it('purchases: notifies listeners, then remembers the purchase across instances', async () => {
    const p = new MockProvider();
    const listener = jest.fn();
    p.subscribe(listener);
    await expect(p.purchase(SKUS.oceanPack)).resolves.toEqual({ status: 'purchased', sku: SKUS.oceanPack });
    expect(listener).toHaveBeenCalledWith([SKUS.oceanPack]);
    await expect(new MockProvider().restore()).resolves.toEqual([SKUS.oceanPack]);
  });

  it('simulates a cancellation (nothing granted), then goes back to success', async () => {
    const p = new MockProvider();
    const listener = jest.fn();
    p.subscribe(listener);
    p.setNextOutcome('cancel');
    await expect(p.purchase(SKUS.pro)).resolves.toEqual({ status: 'cancelled', sku: SKUS.pro });
    expect(listener).not.toHaveBeenCalled();
    await expect(p.restore()).resolves.toEqual([]);
    expect(p.getNextOutcome()).toBe('success');
  });

  it('simulates an error (nothing granted)', async () => {
    const p = new MockProvider();
    p.setNextOutcome('error');
    await expect(p.purchase(SKUS.pro)).resolves.toEqual({ status: 'error', sku: SKUS.pro, error: 'failed' });
    await expect(p.restore()).resolves.toEqual([]);
  });

  it('simulates Ask to Buy: pending, then granted through subscribe when approved', async () => {
    const p = new MockProvider();
    const listener = jest.fn();
    const unsubscribe = p.subscribe(listener);
    p.setNextOutcome('pending');
    await expect(p.purchase(SKUS.neonPack)).resolves.toEqual({ status: 'pending', sku: SKUS.neonPack });
    expect(listener).not.toHaveBeenCalled();
    await p.approvePending();
    expect(listener).toHaveBeenCalledWith([SKUS.neonPack]);
    unsubscribe();
    await p.approvePending();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('restores idempotently', async () => {
    const p = new MockProvider();
    await p.purchase(SKUS.pro);
    await p.purchase(SKUS.pro);
    const first = await p.restore();
    const second = await p.restore();
    expect(first).toEqual([SKUS.pro]);
    expect(second).toEqual(first);
  });

  it('resets its ledger, and ignores a corrupt one', async () => {
    const p = new MockProvider();
    await p.purchase(SKUS.pro);
    await p.reset();
    await expect(p.restore()).resolves.toEqual([]);
    expect(await AsyncStorage.getItem(StorageKeys.mockStore)).toBeNull();

    await AsyncStorage.setItem(StorageKeys.mockStore, '{"schemaVersion":1,"savedAt":1,"data":{"owned":"pro"}}');
    await expect(new MockProvider().restore()).resolves.toEqual([]);
    await AsyncStorage.setItem(
      StorageKeys.mockStore,
      JSON.stringify({ schemaVersion: 1, savedAt: 1, data: { owned: ['com.evil.sku', SKUS.neonPack] } }),
    );
    await expect(new MockProvider().restore()).resolves.toEqual([SKUS.neonPack]);
  });
});
