/**
 * Session timer for the gentle break reminder: counts *active* time only (running while the
 * user is on the coloring screen with the app in the foreground) and calls `onElapsed` each time
 * `limitMs` of active time has accumulated, then starts counting again. Never blocks anything.
 */

export interface SessionTimerOptions {
  onElapsed: () => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface SessionTimer {
  /** Sets the reminder period (0 disables it). Accumulated time is kept. */
  setLimit(ms: number): void;
  /** Starts (or keeps) counting. */
  resume(): void;
  /** Stops counting; accumulated time is kept. */
  pause(): void;
  /** Forgets the accumulated time (keeps running if it was). */
  reset(): void;
  /** Active time accumulated since the last reminder (or reset). */
  activeMs(): number;
  isRunning(): boolean;
  dispose(): void;
}

export function createSessionTimer({
  onElapsed,
  now = Date.now,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: SessionTimerOptions): SessionTimer {
  let limit = 0;
  let accumulated = 0;
  let since: number | null = null;
  let handle: unknown = null;

  const elapsed = () => accumulated + (since === null ? 0 : Math.max(0, now() - since));

  const cancel = () => {
    if (handle !== null) clearTimer(handle);
    handle = null;
  };

  const schedule = () => {
    cancel();
    if (since === null || limit <= 0) return;
    handle = setTimer(fire, Math.max(0, limit - elapsed()));
  };

  function fire() {
    handle = null;
    if (since === null || limit <= 0) return;
    // Start the next period from now (time overshoot from a late timer is dropped).
    accumulated = 0;
    since = now();
    schedule();
    onElapsed();
  }

  return {
    setLimit(ms) {
      limit = Number.isFinite(ms) && ms > 0 ? ms : 0;
      schedule();
    },
    resume() {
      if (since !== null) return;
      since = now();
      schedule();
    },
    pause() {
      if (since === null) return;
      accumulated = elapsed();
      since = null;
      cancel();
    },
    reset() {
      accumulated = 0;
      if (since !== null) since = now();
      schedule();
    },
    activeMs: elapsed,
    isRunning: () => since !== null,
    dispose() {
      cancel();
      since = null;
    },
  };
}
