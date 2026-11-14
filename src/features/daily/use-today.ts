import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { toDayKey, type DayKey } from '@/lib/daily';

/** Ms until the next local midnight (plus a small margin), recomputed from the wall clock. */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * Today's local day key. Refreshed at local midnight and whenever the app comes back to the
 * foreground (covers sleep, time zone and clock changes).
 */
export function useToday(now: () => Date = () => new Date()): DayKey {
  const [today, setToday] = useState(() => toDayKey(now()));
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const date = nowRef.current();
      setToday(toDayKey(date));
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(refresh, msUntilNextDay(date));
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
