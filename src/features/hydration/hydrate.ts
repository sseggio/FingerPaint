import { useDailyStore } from '@/features/daily/daily-store';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { useProgressStore } from '@/features/progress/progress-store';
import { useSettingsStore } from '@/features/settings/settings-store';

export const HYDRATION_TIMEOUT_MS = 3000;

export type HydrationOutcome = 'done' | 'timeout';

type Hydrator = () => Promise<void>;

const defaultHydrators: readonly Hydrator[] = [
  () => useSettingsStore.getState().hydrate(),
  () => useProgressStore.getState().hydrate(),
  () => useDailyStore.getState().hydrate(),
  // Cached purchases only (offline): the store refresh runs in the background afterwards.
  () => useEntitlementsStore.getState().hydrate(),
];

/**
 * Hydrates every persisted store in parallel. Resolves 'timeout' after `timeoutMs` so a slow
 * or stuck storage never keeps the splash screen up forever. Never rejects.
 */
export function hydrateStores(
  hydrators: readonly Hydrator[] = defaultHydrators,
  timeoutMs: number = HYDRATION_TIMEOUT_MS,
): Promise<HydrationOutcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), timeoutMs);
    Promise.allSettled(hydrators.map((h) => h())).then(() => {
      clearTimeout(timer);
      resolve('done');
    });
  });
}
