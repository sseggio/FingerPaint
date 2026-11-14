import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useProgressStore } from '@/features/progress/progress-store';
import type { ProgressSummary } from '@/features/progress/progress-schema';

/**
 * Progress index for library screens, live only while the screen is focused. While the
 * coloring screen sits on top, every fill updates the index: following it there would
 * re-render the whole library for nothing. On focus (back from coloring) it catches up.
 */
export function useLibraryIndex(): Readonly<Record<string, ProgressSummary>> {
  const [index, setIndex] = useState(() => useProgressStore.getState().index);
  useFocusEffect(
    useCallback(() => {
      setIndex(useProgressStore.getState().index);
      return useProgressStore.subscribe((s) => setIndex(s.index));
    }, []),
  );
  return index;
}
