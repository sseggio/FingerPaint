import { loadExpoIap, StoreKitProvider, type IapModule } from './storekit-provider';
import { SKUS } from './types';

type PurchaseEvent = { productId: string; purchaseState: 'pending' | 'purchased' | 'unknown' };
type ErrorEvent = { code?: string; productId?: string | null };

/** In-memory stand-in for expo-iap: requestPurchase answers through the listeners, like the real one. */
function fakeIap(options: { owned?: string[]; onRequest?: (sku: string) => PurchaseEvent | ErrorEvent | 'throw' } = {}) {
  let onPurchase: ((p: PurchaseEvent) => void) | null = null;
  let onError: ((e: ErrorEvent) => void) | null = null;
  const calls: string[] = [];
  const iap = {
    initConnection: jest.fn(async () => true),
    fetchProducts: jest.fn(async () => [
      { id: SKUS.pro, displayPrice: '4,99 €', title: 'Pro', description: 'd' },
      { id: 'com.other.app.thing', displayPrice: '1 €', title: 'x', description: 'x' },
      { id: SKUS.neonPack, displayPrice: '', title: 'Neon', description: 'd' },
    ]),
    requestPurchase: jest.fn(async ({ request }: { request: { apple: { sku: string } } }) => {
      const sku = request.apple.sku;
      const answer = options.onRequest?.(sku) ?? { productId: sku, purchaseState: 'purchased' };
      if (answer === 'throw') throw Object.assign(new Error('not prepared'), { code: 'not-prepared' });
      setTimeout(() => {
        if ('purchaseState' in answer) onPurchase?.(answer);
        else onError?.(answer);
      }, 0);
      return null;
    }),
    finishTransaction: jest.fn(async () => {
      calls.push('finish');
    }),
    getAvailablePurchases: jest.fn(async () =>
      (options.owned ?? []).map((productId) => ({ productId, purchaseState: 'purchased' })),
    ),
    restorePurchases: jest.fn(async () => undefined),
    purchaseUpdatedListener: jest.fn((l: (p: PurchaseEvent) => void) => {
      onPurchase = l;
      return { remove: () => undefined };
    }),
    purchaseErrorListener: jest.fn((l: (e: ErrorEvent) => void) => {
      onError = l;
      return { remove: () => undefined };
    }),
  };
  return { iap, calls, module: iap as unknown as IapModule, emit: (p: PurchaseEvent) => onPurchase?.(p) };
}

describe('StoreKitProvider (expo-iap)', () => {
  it('is loaded lazily and absent under Jest / Expo Go without crashing', () => {
    expect(() => loadExpoIap()).not.toThrow();
    const provider = new StoreKitProvider(() => null);
    return expect(provider.init()).rejects.toThrow(/not available/);
  });

  it('connects once and keeps store prices only for known products', async () => {
    const { iap, module } = fakeIap();
    const provider = new StoreKitProvider(() => module);
    await provider.init();
    await expect(provider.getProducts()).resolves.toEqual([
      { sku: SKUS.pro, displayPrice: '4,99 €', title: 'Pro', description: 'd' },
    ]);
    expect(iap.initConnection).toHaveBeenCalledTimes(1);
    expect(iap.fetchProducts).toHaveBeenCalledWith({ skus: [SKUS.pro, SKUS.oceanPack, SKUS.neonPack], type: 'in-app' });
  });

  it('grants (listeners persist) BEFORE finishing the transaction', async () => {
    const { iap, calls, module } = fakeIap();
    const provider = new StoreKitProvider(() => module);
    provider.subscribe(async (skus) => {
      calls.push(`grant:${skus.join(',')}`);
    });
    await expect(provider.purchase(SKUS.oceanPack)).resolves.toEqual({ status: 'purchased', sku: SKUS.oceanPack });
    expect(calls).toEqual([`grant:${SKUS.oceanPack}`, 'finish']);
    expect(iap.finishTransaction).toHaveBeenCalledWith(expect.objectContaining({ isConsumable: false }));
    expect(iap.requestPurchase).toHaveBeenCalledWith({
      request: { apple: { sku: SKUS.oceanPack }, google: { skus: [SKUS.oceanPack] } },
      type: 'in-app',
    });
  });

  it('leaves the transaction unfinished when the grant could not be persisted', async () => {
    const { iap, module } = fakeIap();
    const provider = new StoreKitProvider(() => module);
    provider.subscribe(() => Promise.reject(new Error('disk full')));
    await provider.purchase(SKUS.pro);
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'user-cancelled' }, { status: 'cancelled' }],
    [{ code: 'network-error' }, { status: 'error', error: 'network' }],
    [{ code: 'user-error' }, { status: 'error', error: 'not-allowed' }],
    [{ code: 'something-new' }, { status: 'error', error: 'failed' }],
    [{ code: 'deferred-payment' }, { status: 'pending' }],
    [{ productId: SKUS.pro, purchaseState: 'pending' as const }, { status: 'pending' }],
  ])('maps %p', async (answer, expected) => {
    const { iap, module } = fakeIap({ onRequest: () => answer });
    const provider = new StoreKitProvider(() => module);
    const listener = jest.fn();
    provider.subscribe(listener);
    await expect(provider.purchase(SKUS.pro)).resolves.toMatchObject({ sku: SKUS.pro, ...expected });
    expect(listener).not.toHaveBeenCalled();
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('turns a synchronous store rejection into an error result', async () => {
    const { module } = fakeIap({ onRequest: () => 'throw' });
    await expect(new StoreKitProvider(() => module).purchase(SKUS.pro)).resolves.toEqual({
      status: 'error',
      sku: SKUS.pro,
      error: 'failed',
    });
  });

  it('restores an "already owned" product instead of failing', async () => {
    const { module } = fakeIap({ owned: [SKUS.pro], onRequest: () => ({ code: 'already-owned', productId: SKUS.pro }) });
    const provider = new StoreKitProvider(() => module);
    const listener = jest.fn();
    provider.subscribe(listener);
    await expect(provider.purchase(SKUS.pro)).resolves.toEqual({ status: 'purchased', sku: SKUS.pro });
    expect(listener).toHaveBeenCalledWith([SKUS.pro]);
  });

  it('restores from getAvailablePurchases (sync with the store only when asked by the user)', async () => {
    const { iap, module } = fakeIap({ owned: [SKUS.neonPack, 'com.other.app.thing', SKUS.pro] });
    const provider = new StoreKitProvider(() => module);
    await expect(provider.restore({ silent: true })).resolves.toEqual([SKUS.pro, SKUS.neonPack]);
    expect(iap.restorePurchases).not.toHaveBeenCalled();
    await expect(provider.restore()).resolves.toEqual([SKUS.pro, SKUS.neonPack]);
    expect(iap.restorePurchases).toHaveBeenCalledTimes(1);
  });

  it('delivers purchases replayed outside of purchase() (interrupted, Ask to Buy)', async () => {
    const { iap, module, emit } = fakeIap();
    const provider = new StoreKitProvider(() => module);
    const listener = jest.fn();
    provider.subscribe(listener);
    await provider.init();
    emit({ productId: SKUS.neonPack, purchaseState: 'purchased' });
    emit({ productId: 'com.other.app.thing', purchaseState: 'purchased' });
    await new Promise((r) => setTimeout(r, 0));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([SKUS.neonPack]);
    expect(iap.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it('retries the connection after a failure (offline at launch)', async () => {
    const { iap, module } = fakeIap();
    iap.initConnection.mockRejectedValueOnce(new Error('offline'));
    const provider = new StoreKitProvider(() => module);
    await expect(provider.init()).rejects.toThrow('offline');
    await expect(provider.purchase(SKUS.pro)).resolves.toMatchObject({ status: 'purchased' });
  });
});
