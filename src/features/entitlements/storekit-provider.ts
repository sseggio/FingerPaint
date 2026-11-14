import type * as ExpoIap from 'expo-iap';
import { AppState, type AppStateStatus } from 'react-native';

import { normalizeSkus } from './catalog';
import {
  ALL_SKUS,
  isSku,
  type EntitlementsProvider,
  type ProviderListener,
  type PurchaseErrorKind,
  type PurchaseResult,
  type RestoreOptions,
  type Sku,
  type StoreProduct,
} from './types';

/** The subset of `expo-iap` (6.x) this provider uses (injectable for tests). */
export type IapModule = Pick<
  typeof ExpoIap,
  | 'initConnection'
  | 'fetchProducts'
  | 'requestPurchase'
  | 'finishTransaction'
  | 'getAvailablePurchases'
  | 'restorePurchases'
  | 'purchaseUpdatedListener'
  | 'purchaseErrorListener'
>;

type IapPurchase = ExpoIap.Purchase;
/** What the error listener receives (expo-iap's `PurchaseError`, code may be missing). */
interface IapError {
  code?: string;
  productId?: string | null;
}

/**
 * Loads `expo-iap` lazily: its native module only exists in development / store builds, so a
 * static import would crash Jest and Expo Go. Returns null when unavailable.
 */
export function loadExpoIap(): IapModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-iap') as IapModule;
  } catch {
    return null;
  }
}

/** The part of React Native's `AppState` used to notice the return to the foreground (injectable). */
export interface AppStateLike {
  addEventListener(type: 'change', listener: (state: AppStateStatus) => void): { remove(): void };
}

export interface StoreKitOptions {
  /** A purchase with no answer from the store after this delay resolves as `timeout` (default 2 min). */
  timeoutMs?: number;
  /**
   * Back from the background (e.g. the user left to fix a payment method), a purchase still
   * waiting gets this much longer for the store to answer before resolving as `timeout`.
   */
  foregroundGraceMs?: number;
  appState?: AppStateLike;
}

export const PURCHASE_TIMEOUT_MS = 2 * 60 * 1000;
export const FOREGROUND_GRACE_MS = 10 * 1000;

function errorKind(code: string | undefined): PurchaseErrorKind | 'cancelled' | 'owned' | 'pending' {
  switch (code) {
    case 'user-cancelled':
      return 'cancelled';
    case 'already-owned':
      return 'owned';
    // Not a failure: the payment awaits an approval outside of the app (Ask to Buy, bank
    // authentication…). Nothing is unlocked now; if approved, the transaction arrives later
    // through `purchaseUpdatedListener` (even after a relaunch) and is granted then.
    case 'pending':
    case 'deferred-payment':
      return 'pending';
    case 'network-error':
    case 'service-error':
    case 'connection-closed':
    case 'init-connection':
      return 'network';
    case 'user-error':
    case 'billing-unavailable':
    case 'iap-not-available':
    case 'feature-not-supported':
      return 'not-allowed';
    default:
      return 'failed';
  }
}

/**
 * `EXPO_PUBLIC_IAP_PROVIDER=storekit`: the App Store (and Google Play) through `expo-iap`.
 * The store is the source of truth: `restore()` (launch and "Restore purchases") reads
 * `getAvailablePurchases`. A purchase is granted (listeners notified, which persists the
 * cache) BEFORE `finishTransaction`, so a crash in between replays the transaction instead of
 * losing it.
 */
export class StoreKitProvider implements EntitlementsProvider {
  readonly kind = 'storekit' as const;
  readonly available = true;
  private connecting: Promise<IapModule> | null = null;
  private readonly listeners = new Set<ProviderListener>();
  private readonly waiting = new Map<Sku, (result: PurchaseResult) => void>();
  private readonly timers = new Map<Sku, ReturnType<typeof setTimeout>>();
  private readonly load: () => IapModule | null;
  private readonly timeoutMs: number;
  private readonly foregroundGraceMs: number;
  private readonly appState: AppStateLike;
  private appStateSubscription: { remove(): void } | null = null;
  private wentToBackground = false;

  constructor(load: () => IapModule | null = loadExpoIap, options: StoreKitOptions = {}) {
    this.load = load;
    this.timeoutMs = options.timeoutMs ?? PURCHASE_TIMEOUT_MS;
    this.foregroundGraceMs = options.foregroundGraceMs ?? FOREGROUND_GRACE_MS;
    this.appState = options.appState ?? AppState;
  }

  init(): Promise<void> {
    return this.connect().then(() => undefined);
  }

  private connect(): Promise<IapModule> {
    this.connecting ??= (async () => {
      const iap = this.load();
      if (!iap) throw new Error('expo-iap is not available in this build');
      const ok = await iap.initConnection();
      if (ok === false) throw new Error('store connection refused');
      iap.purchaseUpdatedListener((purchase) => {
        void this.onPurchase(iap, purchase);
      });
      iap.purchaseErrorListener((error) => this.onError(error));
      return iap;
    })().catch((e: unknown) => {
      // Let a later call retry (e.g. the device was offline at launch).
      this.connecting = null;
      throw e;
    });
    return this.connecting;
  }

  async getProducts(): Promise<StoreProduct[]> {
    const iap = await this.connect();
    const products = (await iap.fetchProducts({ skus: [...ALL_SKUS], type: 'in-app' })) ?? [];
    const out: StoreProduct[] = [];
    for (const p of products) {
      if (!isSku(p.id) || typeof p.displayPrice !== 'string' || p.displayPrice.length === 0) continue;
      out.push({ sku: p.id, displayPrice: p.displayPrice, title: p.title, description: p.description });
    }
    return out;
  }

  async purchase(sku: Sku): Promise<PurchaseResult> {
    let iap: IapModule;
    try {
      iap = await this.connect();
    } catch {
      return { status: 'error', sku, error: 'network' };
    }
    // One purchase per product at a time: a second tap waits for the same outcome.
    if (this.waiting.has(sku)) return { status: 'error', sku, error: 'failed' };
    const outcome = new Promise<PurchaseResult>((resolve) => this.waiting.set(sku, resolve));
    // Never wait forever (a lost callback would keep the shop busy): resolve as `timeout`. If
    // the store completes the purchase later, the listener still grants it.
    this.arm(sku, this.timeoutMs);
    this.watchAppState();
    try {
      await iap.requestPurchase({
        request: { apple: { sku }, google: { skus: [sku] } },
        type: 'in-app',
      });
    } catch (e) {
      this.settle(sku, await this.fromError(sku, (e as { code?: string } | null)?.code));
    }
    return outcome;
  }

  async restore(options: RestoreOptions = {}): Promise<readonly Sku[]> {
    const iap = await this.connect();
    if (!options.silent) {
      // User-initiated: sync with the App Store first (may ask to sign in). Best effort.
      try {
        await iap.restorePurchases();
      } catch {
        // getAvailablePurchases below still answers from the local receipt.
      }
    }
    const purchases = await iap.getAvailablePurchases();
    // A pending (not yet approved) purchase is not owned yet: it is granted once approved.
    return normalizeSkus(purchases.filter((p) => p.purchaseState !== 'pending').map((p) => p.productId));
  }

  subscribe(listener: ProviderListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private settle(sku: Sku, result: PurchaseResult) {
    const resolve = this.waiting.get(sku);
    this.waiting.delete(sku);
    const timer = this.timers.get(sku);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(sku);
    if (this.waiting.size === 0) {
      this.appStateSubscription?.remove();
      this.appStateSubscription = null;
      this.wentToBackground = false;
    }
    resolve?.(result);
  }

  /** (Re)starts the deadline of a waiting purchase. */
  private arm(sku: Sku, ms: number) {
    const previous = this.timers.get(sku);
    if (previous !== undefined) clearTimeout(previous);
    this.timers.set(
      sku,
      setTimeout(() => this.settle(sku, { status: 'error', sku, error: 'timeout' }), ms),
    );
  }

  /** While a purchase waits: back from the background, shorten its deadline to the grace delay. */
  private watchAppState() {
    if (this.appStateSubscription) return;
    this.appStateSubscription = this.appState.addEventListener('change', (state) => {
      if (state === 'background') {
        this.wentToBackground = true;
      } else if (state === 'active' && this.wentToBackground) {
        this.wentToBackground = false;
        for (const sku of this.waiting.keys()) this.arm(sku, this.foregroundGraceMs);
      }
    });
  }

  private async onPurchase(iap: IapModule, purchase: IapPurchase) {
    const sku = purchase.productId;
    if (!isSku(sku)) return;
    if (purchase.purchaseState === 'pending') {
      this.settle(sku, { status: 'pending', sku });
      return;
    }
    // Grant first (listeners persist the cache), then finish: never the other way around.
    try {
      await Promise.all([...this.listeners].map((l) => l([sku])));
    } catch {
      // Not persisted: leave the transaction unfinished so the store replays it next launch.
      this.settle(sku, { status: 'purchased', sku });
      return;
    }
    try {
      await iap.finishTransaction({ purchase, isConsumable: false });
    } catch {
      // Replayed at the next launch; the grant is idempotent.
    }
    this.settle(sku, { status: 'purchased', sku });
  }

  private onError(error: IapError) {
    const target = isSku(error.productId) ? [error.productId] : [...this.waiting.keys()];
    for (const sku of target) {
      void this.fromError(sku, error.code).then((result) => this.settle(sku, result));
    }
  }

  private async fromError(sku: Sku, code: string | undefined): Promise<PurchaseResult> {
    const kind = errorKind(code);
    if (kind === 'cancelled') return { status: 'cancelled', sku };
    if (kind === 'pending') return { status: 'pending', sku };
    if (kind === 'owned') {
      // Already bought (e.g. on another device): restore it instead of failing.
      try {
        const owned = await this.restore({ silent: true });
        if (owned.includes(sku)) {
          await Promise.all([...this.listeners].map((l) => l([sku])));
          return { status: 'purchased', sku };
        }
      } catch {
        // fall through
      }
      return { status: 'error', sku, error: 'failed' };
    }
    return { status: 'error', sku, error: kind };
  }
}
