import { Platform } from 'react-native';

import type { EntitlementsSource } from './can-access';
import { MockProvider } from './mock-provider';
import { NoopProvider } from './noop-provider';
import { StoreKitProvider } from './storekit-provider';
import type { EntitlementsProvider } from './types';

export type { EntitlementsProvider } from './types';

/**
 * Reads `EXPO_PUBLIC_IAP_PROVIDER` (`mock` | `storekit` | `none`, default `none`). Anything
 * else, or StoreKit on the web, falls back to `none`: nothing is sold, everything free works.
 * (The variable must be read as `process.env.EXPO_PUBLIC_IAP_PROVIDER` to be inlined by Expo.)
 */
export function providerKind(
  value: string | undefined = process.env.EXPO_PUBLIC_IAP_PROVIDER,
  os: string = Platform.OS,
): EntitlementsSource {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'mock') return 'mock';
  if (v === 'storekit') return os === 'web' ? 'none' : 'storekit';
  return 'none';
}

export function createProvider(kind: EntitlementsSource = providerKind()): EntitlementsProvider {
  switch (kind) {
    case 'mock':
      return new MockProvider({ delayMs: 400 });
    case 'storekit':
      return new StoreKitProvider();
    default:
      return new NoopProvider();
  }
}
