import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useCatalogStore } from './catalog-store';

/**
 * Background catalog sync: once the app is rendered (never holding the splash), then on every
 * return to the foreground when the last attempt is older than 6 h. Failures are silent.
 */
export function useCatalogSync(ready: boolean): void {
  useEffect(() => {
    if (!ready || !useCatalogStore.getState().enabled) return;
    // Let the first frame render before touching the network.
    const timer = setTimeout(() => void useCatalogStore.getState().sync(), 1500);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useCatalogStore.getState().onForeground();
      else if (state === 'background') void useCatalogStore.getState().onBackground();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [ready]);
}
