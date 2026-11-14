import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useSettingsStore } from '@/features/settings/settings-store';
import { createSessionTimer, type SessionTimer } from '@/lib/session-timer';

/**
 * Gentle break reminder. One timer for the whole app, so the active time carries over from one
 * artwork to the next; it only runs while a coloring screen is open with the app in the
 * foreground. When the period chosen in the settings has elapsed, a dismissible banner shows up:
 * it blocks nothing and is never repeated more than once per period.
 */

const listeners = new Set<() => void>();

export const breakTimer: SessionTimer = createSessionTimer({
  onElapsed: () => listeners.forEach((listener) => listener()),
});

export interface BreakReminder {
  visible: boolean;
  /** Minutes of the current period (for the message). */
  minutes: number;
  dismiss(): void;
}

/** Counts active time while `active` is true and the app is in the foreground. */
export function useBreakReminder(active: boolean): BreakReminder {
  const minutes = useSettingsStore((s) => s.settings.sessionTimerMin);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    breakTimer.setLimit(minutes * 60_000);
  }, [minutes]);

  useEffect(() => {
    const show = () => setVisible(true);
    listeners.add(show);
    return () => {
      listeners.delete(show);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') breakTimer.resume();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') breakTimer.resume();
      else breakTimer.pause();
    });
    return () => {
      sub.remove();
      breakTimer.pause();
    };
  }, [active]);

  const dismiss = useCallback(() => setVisible(false), []);
  // Turning the reminder off also hides a reminder already on screen.
  return { visible: visible && minutes > 0, minutes, dismiss };
}
