import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useProgressStore } from '@/features/progress/progress-store';

import { hydrateStores, HYDRATION_TIMEOUT_MS } from './hydrate';

/** Hydrates persisted stores once; returns true when the app can render (done or timed out). */
export function useHydration(timeoutMs: number = HYDRATION_TIMEOUT_MS): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    hydrateStores(undefined, timeoutMs).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [timeoutMs]);
  return ready;
}

/** Writes pending progress immediately when the app leaves the foreground. */
export function useFlushOnBackground(): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void useProgressStore.getState().flush();
      }
    });
    return () => sub.remove();
  }, []);
}
