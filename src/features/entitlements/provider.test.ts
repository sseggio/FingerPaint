import { MockProvider } from './mock-provider';
import { NoopProvider } from './noop-provider';
import { createProvider, providerKind } from './provider';
import { StoreKitProvider } from './storekit-provider';
import { SKUS } from './types';

describe('provider selection (EXPO_PUBLIC_IAP_PROVIDER)', () => {
  it.each([
    [undefined, 'ios', 'none'],
    ['', 'ios', 'none'],
    ['none', 'ios', 'none'],
    ['mock', 'ios', 'mock'],
    [' MOCK ', 'android', 'mock'],
    ['storekit', 'ios', 'storekit'],
    ['storekit', 'web', 'none'],
    ['revenuecat', 'ios', 'none'],
  ])('%p on %s → %s', (value, os, expected) => {
    expect(providerKind(value, os)).toBe(expected);
  });

  it('defaults to none in tests', () => {
    expect(providerKind()).toBe('none');
  });

  it('creates the matching provider without touching native code', () => {
    expect(createProvider('none')).toBeInstanceOf(NoopProvider);
    expect(createProvider('mock')).toBeInstanceOf(MockProvider);
    expect(createProvider('storekit')).toBeInstanceOf(StoreKitProvider);
  });
});

describe('NoopProvider', () => {
  it('sells nothing and owns nothing', async () => {
    const p = new NoopProvider();
    expect(p.available).toBe(false);
    await expect(p.init()).resolves.toBeUndefined();
    await expect(p.getProducts()).resolves.toEqual([]);
    await expect(p.restore()).resolves.toEqual([]);
    await expect(p.purchase(SKUS.pro)).resolves.toEqual({ status: 'error', sku: SKUS.pro, error: 'unavailable' });
    expect(typeof p.subscribe()).toBe('function');
  });
});

describe('providerKind in release builds', () => {
  it('never enables the mock outside __DEV__', () => {
    expect(providerKind('mock', 'ios', false)).toBe('none');
    expect(providerKind('storekit', 'ios', false)).toBe('storekit');
  });
});
