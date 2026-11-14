import { useMemo } from 'react';

import type { ProgressSummary } from '@/features/progress/progress-schema';
import type { ArtworkSource } from '@/lib/artwork/types';
import { viewStreak } from '@/lib/daily';

import { dailyArtwork } from './daily-artwork';
import { DailyCard } from './daily-card';
import { useDailyStore } from './daily-store';
import { useToday } from './use-today';

export interface DailySectionProps {
  artworks: readonly ArtworkSource[];
  index: Readonly<Record<string, ProgressSummary>>;
  /** Injectable clock (tests). */
  now?: () => Date;
}

/** Library header block: today's artwork and the forgiving streak. */
export function DailySection({ artworks, index, now }: DailySectionProps) {
  const today = useToday(now);
  const daily = useDailyStore((s) => s.daily);
  const artwork = useMemo(() => dailyArtwork(today, artworks), [artworks, today]);
  const streak = useMemo(() => viewStreak(daily, today), [daily, today]);
  if (!artwork) return null;
  return <DailyCard artwork={artwork} progress={index[artwork.id]} streak={streak} />;
}
