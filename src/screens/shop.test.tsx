import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { DEFAULT_ENTITLEMENTS } from '@/features/entitlements/can-access';
import { createEntitlementsStore, useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { MockProvider } from '@/features/entitlements/mock-provider';
import { NoopProvider } from '@/features/entitlements/noop-provider';
import { SKUS } from '@/features/entitlements/types';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { useSettingsStore } from '@/features/settings/settings-store';

import { ShopScreen } from './shop';

jest.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }] }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

/** Swaps the app-wide store's provider and state for a fresh one (the screen reads the singleton). */
function useStoreWith(provider: NoopProvider | MockProvider) {
  const fresh = createEntitlementsStore({ provider });
  useEntitlementsStore.setState(fresh.getState(), true);
  // Actions of the fresh store write to the fresh store: mirror them into the singleton.
  const unsubscribe = fresh.subscribe((state) => useEntitlementsStore.setState(state, true));
  return { fresh, unsubscribe };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const original = useEntitlementsStore.getState();
let cleanup: (() => void) | null = null;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, hydrated: true });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  useEntitlementsStore.setState(original, true);
});

describe('ShopScreen with EXPO_PUBLIC_IAP_PROVIDER=none', () => {
  beforeEach(() => {
    cleanup = useStoreWith(new NoopProvider()).unsubscribe;
  });

  it('is an honest "coming soon": products described, no price, no pressure', async () => {
    await render(<ShopScreen reason="pro" />);
    await flush();
    expect(screen.getByRole('header', { name: 'Coming soon' })).toBeTruthy();
    expect(screen.getByText('This artwork is included with Pro.')).toBeTruthy();
    for (const title of ['FingerPaint Pro', 'Deep ocean pack', 'Neon pack']) {
      expect(screen.getByRole('header', { name: title })).toBeTruthy();
    }
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('8 artworks')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Buy / })).toBeNull();
    // Nothing time-limited, ever.
    expect(screen.queryByText(/hurry|only today|countdown|expires|\d+:\d\d/i)).toBeNull();
  });

  it('always shows "Restore purchases", and explains it is not available yet', async () => {
    await render(<ShopScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Restore purchases made with this store account' }));
    });
    expect(screen.getByText('Purchases are not available in this version yet.')).toBeTruthy();
    expect(useEntitlementsStore.getState().entitlements).toBe(DEFAULT_ENTITLEMENTS);
  });

  it('has an obvious way out', async () => {
    await render(<ShopScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close the shop' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('ignores an invalid reason', async () => {
    await render(<ShopScreen reason="<script>" />);
    expect(screen.queryByText(/included with Pro|illustration pack\./)).toBeNull();
  });
});

describe('ShopScreen with the mock store', () => {
  let provider: MockProvider;
  beforeEach(() => {
    provider = new MockProvider();
    cleanup = useStoreWith(provider).unsubscribe;
  });

  it('shows store prices, unlocks immediately on purchase, and says thanks', async () => {
    await render(<ShopScreen reason="pack" />);
    await act(async () => {
      await useEntitlementsStore.getState().connect();
    });
    expect(screen.getByRole('header', { name: 'Make it yours' })).toBeTruthy();
    const buy = screen.getByRole('button', { name: 'Buy Deep ocean pack for 2,99 € (mock)' });
    await act(async () => {
      fireEvent.press(buy);
    });
    await flush();
    expect(screen.getByText('Thank you! Deep ocean pack is unlocked.')).toBeTruthy();
    expect(screen.getByLabelText('Deep ocean pack: owned')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Buy Deep ocean pack/ })).toBeNull();
    expect(useEntitlementsStore.getState().entitlements.packs).toEqual(['ocean']);
  });

  it('a cancellation is calm and unlocks nothing', async () => {
    await render(<ShopScreen />);
    await act(async () => {
      await useEntitlementsStore.getState().connect();
    });
    provider.setNextOutcome('cancel');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Buy FingerPaint Pro for 4,99 € (mock)' }));
    });
    await flush();
    expect(screen.getByText('No problem, nothing was charged.')).toBeTruthy();
    expect(useEntitlementsStore.getState().entitlements.pro).toBe(false);
  });

  it('restores purchases from the store', async () => {
    await provider.purchase(SKUS.neonPack);
    await render(<ShopScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Restore purchases made with this store account' }));
    });
    await flush();
    expect(screen.getByText('1 purchase restored.')).toBeTruthy();
    expect(screen.getByLabelText('Neon pack: owned')).toBeTruthy();
  });

  it('offers the dev panel (reset) in development', async () => {
    await provider.purchase(SKUS.pro);
    await render(<ShopScreen />);
    await act(async () => {
      await useEntitlementsStore.getState().restore();
    });
    expect(useEntitlementsStore.getState().entitlements.pro).toBe(true);
    expect(screen.getByRole('header', { name: 'Mock store (development only)' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reset mock purchases' }));
    });
    await flush();
    expect(screen.getByText('Mock purchases reset.')).toBeTruthy();
    expect(useEntitlementsStore.getState().entitlements).toBe(DEFAULT_ENTITLEMENTS);
  });
});
