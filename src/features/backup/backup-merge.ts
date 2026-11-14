import type { ProgressSummary } from '@/features/progress/progress-schema';
import type { Settings } from '@/features/settings/settings-schema';
import {
  DAILY_HISTORY_DAYS,
  dayNumber,
  recordActivity,
  viewStreak,
  type DailyState,
  type DayKey,
} from '@/lib/daily';

import type { BackupArtwork, DecodedBackup } from './backup-format';

/**
 * Import merge rules (pure):
 * - progress: per artwork, the more advanced state wins (more filled cells; on a tie a completed
 *   state beats an unfinished one). On a full tie the local state is kept untouched.
 * - streak: the state with the longer streak still alive today wins (tie: the most recent one);
 *   activity days the other side recorded later are replayed on top of it, and `best` is the max.
 * - settings: restored from the backup.
 */
export interface LocalState {
  index: Readonly<Record<string, ProgressSummary>>;
  daily: DailyState;
}

export interface ImportSummary {
  createdAt: number;
  /** Artworks with progress in the file. */
  inFile: number;
  /** Artworks with no local progress, restored from the file. */
  added: number;
  /** Artworks where the file is more advanced than the device. */
  improved: number;
  /** Artworks where the device is already as far or further (kept). */
  kept: number;
  /** Completed artworks after the import. */
  completedAfter: number;
  /** Streak (alive today) after the import, and best streak. */
  streakAfter: number;
  bestAfter: number;
}

export interface ImportPlan {
  /** Progress entries to write (only those that change). */
  writes: BackupArtwork[];
  daily: DailyState;
  settings: Settings;
  summary: ImportSummary;
}

/** True when `a` is strictly more advanced than `b`. */
export function isMoreAdvanced(a: ProgressSummary, b: ProgressSummary): boolean {
  if (a.filledCount !== b.filledCount) return a.filledCount > b.filledCount;
  return a.status === 'completed' && b.status !== 'completed';
}

function later(a: DayKey | null, b: DayKey | null): boolean {
  if (a === null) return false;
  if (b === null) return true;
  return dayNumber(a) > dayNumber(b);
}

/** Merges two streak states as seen on `today` (see the rules above). */
export function mergeDaily(local: DailyState, imported: DailyState, today: DayKey): DailyState {
  const localAlive = viewStreak(local, today).streak;
  const importedAlive = viewStreak(imported, today).streak;
  const importedWins =
    importedAlive > localAlive || (importedAlive === localAlive && later(imported.lastActiveDay, local.lastActiveDay));
  const primary = importedWins ? imported : local;
  const other = importedWins ? local : imported;
  const since = primary.lastActiveDay === null ? -Infinity : dayNumber(primary.lastActiveDay);
  const otherDays = [...other.activeDays, ...(other.lastActiveDay ? [other.lastActiveDay] : [])];
  const before = otherDays.filter((d) => dayNumber(d) <= since);
  const after = [...new Set(otherDays.filter((d) => dayNumber(d) > since))].sort();
  const base: DailyState = {
    lastActiveDay: primary.lastActiveDay,
    streak: primary.streak,
    best: Math.max(local.best, imported.best, primary.streak),
    jokerDays: [...primary.jokerDays],
    activeDays: [...new Set([...primary.activeDays, ...before])].sort(),
  };
  // Days the other side colored after the winner's last day extend the winner's streak.
  const merged = after.reduce(recordActivity, base);
  const newest = merged.lastActiveDay ? dayNumber(merged.lastActiveDay) : dayNumber(today);
  const keep = (d: DayKey) => dayNumber(d) > newest - DAILY_HISTORY_DAYS;
  return {
    ...merged,
    best: Math.max(merged.best, merged.streak),
    jokerDays: merged.jokerDays.filter(keep),
    activeDays: merged.activeDays.filter(keep),
  };
}

/** Computes what an import will change, without changing anything. */
export function planImport(local: LocalState, backup: DecodedBackup, today: DayKey): ImportPlan {
  const writes: BackupArtwork[] = [];
  let added = 0;
  let improved = 0;
  let kept = 0;
  const statusAfter = new Map<string, ProgressSummary['status']>();
  for (const [id, entry] of Object.entries(local.index)) statusAfter.set(id, entry.status);
  for (const [id, entry] of backup.progress) {
    const current = local.index[id];
    if (!current) {
      // An untouched artwork in the file restores nothing useful.
      if (entry.summary.filledCount === 0) continue;
      added++;
    } else if (isMoreAdvanced(entry.summary, current)) {
      improved++;
    } else {
      kept++;
      continue;
    }
    writes.push(entry);
    statusAfter.set(id, entry.summary.status);
  }
  const daily = mergeDaily(local.daily, backup.daily, today);
  const view = viewStreak(daily, today);
  return {
    writes,
    daily,
    settings: backup.settings,
    summary: {
      createdAt: backup.createdAt,
      inFile: backup.progress.size,
      added,
      improved,
      kept,
      completedAfter: [...statusAfter.values()].filter((s) => s === 'completed').length,
      streakAfter: view.streak,
      bestAfter: daily.best,
    },
  };
}
