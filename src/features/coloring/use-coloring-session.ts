import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { StoreApi } from 'zustand';

import { useDailyStore } from '@/features/daily/daily-store';
import { useProgressStore, type ProgressState } from '@/features/progress/progress-store';
import type { Artwork } from '@/lib/artwork/types';
import { toDayKey } from '@/lib/daily';
import { createFrameCoalescer } from '@/lib/frame-coalescer';

import type { FillSource } from './canvas/use-fill-gestures';
import {
  createColoringSession,
  fillCells,
  nextIncompleteColor,
  sessionSummary,
  type ColoringSession,
} from './coloring-session';
import { coloringFeedback } from './feedback';

/** `celebrate`: just finished (confetti). `done`: opened an artwork finished earlier. */
export type CompletionState = 'none' | 'celebrate' | 'done';

export interface ColoringController {
  /** Null while the saved progress loads. */
  session: ColoringSession | null;
  /** Color layer revision, bumped at most once per frame. */
  revision: number;
  /** Active palette color (0-based). */
  activeColor: number;
  completion: CompletionState;
  selectColor(colorIndex: number): void;
  fill(batch: number[], source: FillSource): void;
}

export interface ColoringSessionOptions {
  store?: Pick<StoreApi<ProgressState>, 'getState'>;
  now?: () => number;
  /** Called on the first successful fill of each local day (forgiving streak, F10). */
  onDailyActivity?: () => void;
}

const recordDailyActivity = () => {
  void useDailyStore.getState().recordActivity();
};

/**
 * Coloring session of one artwork, restored from and saved to the progress store. Saves are
 * debounced by the repo (400 ms); they are flushed right away when the artwork is completed,
 * when the app goes to the background and when the screen unmounts.
 */
export function useColoringSession(artwork: Artwork, options: ColoringSessionOptions = {}): ColoringController {
  const store = options.store ?? useProgressStore;
  const now = options.now ?? Date.now;
  const onDailyActivity = options.onDailyActivity ?? recordDailyActivity;

  const [session, setSession] = useState<ColoringSession | null>(null);
  const [revision, setRevision] = useState(0);
  const [activeColor, setActiveColor] = useState(0);
  const [completion, setCompletion] = useState<CompletionState>('none');

  const sessionRef = useRef<ColoringSession | null>(null);
  const activeRef = useRef(0);
  /** Progress changed during this visit (merely looking at an artwork saves nothing). */
  const dirtyRef = useRef(false);
  /** Active time: stored total at load + time on screen while the app is in the foreground. */
  const timeRef = useRef<{ base: number; since: number | null }>({ base: 0, since: null });
  const storeRef = useRef(store);
  const nowRef = useRef(now);
  const dailyRef = useRef(onDailyActivity);
  /** Local day already reported to the daily streak during this visit. */
  const reportedDayRef = useRef<string | null>(null);
  useEffect(() => {
    storeRef.current = store;
    nowRef.current = now;
    dailyRef.current = onDailyActivity;
  });

  // Several batches in one frame (taps, a long drag) rebuild the color layer only once.
  const coalescer = useMemo(() => createFrameCoalescer(() => setRevision((r) => r + 1)), []);

  const activeMs = useCallback(() => {
    const { base, since } = timeRef.current;
    return base + (since === null ? 0 : Math.max(0, nowRef.current() - since));
  }, []);

  const persist = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !dirtyRef.current) return;
    const state = storeRef.current.getState();
    state.save(sessionSummary(s, state.index[s.artwork.id], nowRef.current(), activeMs()), s.filled);
  }, [activeMs]);

  const persistNow = useCallback(() => {
    persist();
    void storeRef.current.getState().flush();
  }, [persist]);

  const selectColor = useCallback((colorIndex: number) => {
    activeRef.current = colorIndex;
    setActiveColor(colorIndex);
  }, []);

  // Restore the saved progress (exact bitset) when the artwork opens.
  useEffect(() => {
    let alive = true;
    const state = storeRef.current.getState();
    const previous = state.index[artwork.id];
    state
      .loadFilled(artwork.id, artwork.cells.length)
      .catch(() => undefined)
      .then((bits) => {
        if (!alive) return;
        const restored = createColoringSession(artwork, bits);
        sessionRef.current = restored;
        dirtyRef.current = false;
        timeRef.current = { base: previous?.activeMs ?? 0, since: nowRef.current() };
        const first = nextIncompleteColor(restored, -1) ?? 0;
        activeRef.current = first;
        setActiveColor(first);
        setCompletion(restored.completed ? 'done' : 'none');
        setSession(restored);
      });
    return () => {
      alive = false;
    };
  }, [artwork]);

  // Leaving the screen: save the last state (with the time spent) and write it now.
  useEffect(
    () => () => {
      coalescer.cancel();
      persistNow();
    },
    [coalescer, persistNow],
  );

  // Background: stop counting time and write now; foreground: count again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const time = timeRef.current;
      if (next === 'active') {
        if (time.since === null) time.since = nowRef.current();
        return;
      }
      if (next === 'background' || next === 'inactive') {
        persistNow();
        if (time.since !== null) {
          time.base += Math.max(0, nowRef.current() - time.since);
          time.since = null;
        }
      }
    });
    return () => sub.remove();
  }, [persistNow]);

  const fill = useCallback(
    (batch: number[], source: FillSource) => {
      const s = sessionRef.current;
      if (!s || s.completed) return;
      const color = activeRef.current;
      const result = fillCells(s, batch, color);
      if (result.filled.length === 0) {
        // A wrong color never changes anything: a light tap is the only answer.
        if (source === 'tap' && result.wrong > 0) coloringFeedback.wrongColor();
        return;
      }
      dirtyRef.current = true;
      coalescer.request();
      const day = toDayKey(new Date(nowRef.current()));
      if (reportedDayRef.current !== day) {
        reportedDayRef.current = day;
        dailyRef.current();
      }
      if (result.completedNow) {
        coloringFeedback.artworkDone();
        setCompletion('celebrate');
        persistNow();
        return;
      }
      persist();
      if (result.completedColors.includes(color)) {
        coloringFeedback.colorDone();
        const next = nextIncompleteColor(s, color);
        if (next !== null) selectColor(next);
      }
    },
    [coalescer, persist, persistNow, selectColor],
  );

  return { session, revision, activeColor, completion, selectColor, fill };
}
