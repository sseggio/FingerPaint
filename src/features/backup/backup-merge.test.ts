import type { ProgressSummary } from '@/features/progress/progress-schema';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { createBitset } from '@/lib/bitset';
import { EMPTY_DAILY_STATE, isDailyState, viewStreak, type DailyState } from '@/lib/daily';

import type { DecodedBackup } from './backup-format';
import { isMoreAdvanced, mergeDaily, planImport } from './backup-merge';

const TODAY = '2026-11-14'; // a Saturday

function summary(artworkId: string, filledCount: number, status: ProgressSummary['status'], updatedAt = 1): ProgressSummary {
  return { artworkId, filledCount, status, startedAt: 0, updatedAt, activeMs: 0 };
}

function daily(lastActiveDay: string | null, streak: number, best = streak, activeDays: string[] = []): DailyState {
  return { lastActiveDay, streak, best, jokerDays: [], activeDays };
}

const empty = (): DailyState => ({ ...EMPTY_DAILY_STATE, jokerDays: [], activeDays: [] });

function backup(entries: ProgressSummary[], d: DailyState = empty()): DecodedBackup {
  return {
    createdAt: 42,
    unknownCount: 0,
    progress: new Map(entries.map((s) => [s.artworkId, { summary: s, bits: createBitset(64) }])),
    daily: d,
    settings: { ...DEFAULT_SETTINGS, haptics: false },
  };
}

describe('isMoreAdvanced', () => {
  it('compares filled cells, then completion', () => {
    expect(isMoreAdvanced(summary('a', 5, 'in_progress'), summary('a', 4, 'in_progress'))).toBe(true);
    expect(isMoreAdvanced(summary('a', 4, 'in_progress'), summary('a', 5, 'in_progress'))).toBe(false);
    expect(isMoreAdvanced(summary('a', 5, 'completed'), summary('a', 5, 'in_progress'))).toBe(true);
    expect(isMoreAdvanced(summary('a', 5, 'in_progress'), summary('a', 5, 'in_progress', 99))).toBe(false);
  });
});

describe('planImport', () => {
  it('keeps the most advanced state per artwork and only writes what changes', () => {
    const local = {
      index: {
        cat: summary('cat', 10, 'in_progress'),
        fish: summary('fish', 64, 'completed'),
        frog: summary('frog', 3, 'in_progress'),
      },
      daily: empty(),
    };
    const file = backup([
      summary('cat', 20, 'in_progress'),
      summary('fish', 12, 'in_progress'),
      summary('owl', 64, 'completed'),
      summary('bunny', 0, 'new'),
    ]);
    const plan = planImport(local, file, TODAY);
    expect(plan.writes.map((w) => w.summary.artworkId).sort()).toEqual(['cat', 'owl']);
    expect(plan.summary).toMatchObject({ inFile: 4, added: 1, improved: 1, kept: 1, completedAfter: 2, createdAt: 42 });
    expect(plan.settings.haptics).toBe(false);
  });

  it('restores everything on a fresh install', () => {
    const plan = planImport({ index: {}, daily: empty() }, backup([summary('cat', 2, 'in_progress')], daily('2026-11-13', 5, 8)), TODAY);
    expect(plan.writes).toHaveLength(1);
    expect(plan.daily).toMatchObject({ lastActiveDay: '2026-11-13', streak: 5, best: 8 });
    expect(plan.summary).toMatchObject({ added: 1, streakAfter: 5, bestAfter: 8 });
  });
});

describe('mergeDaily', () => {
  it('keeps the longer streak alive today and the best of both', () => {
    const merged = mergeDaily(daily('2026-11-14', 2, 12), daily('2026-11-13', 30, 30), TODAY);
    // Yesterday's 30 is extended by today's local activity.
    expect(merged.streak).toBe(31);
    expect(merged.lastActiveDay).toBe(TODAY);
    expect(merged.best).toBe(31);
    expect(merged.activeDays).toContain(TODAY);
    expect(viewStreak(merged, TODAY).activeToday).toBe(true);
    expect(isDailyState(merged)).toBe(true);
  });

  it('ignores a dead streak from the file', () => {
    const merged = mergeDaily(daily('2026-11-14', 3, 3), daily('2026-10-01', 50, 50), TODAY);
    expect(merged.streak).toBe(3);
    expect(merged.lastActiveDay).toBe(TODAY);
    expect(merged.best).toBe(50);
  });

  it('keeps the local state on a tie and is idempotent', () => {
    const local = daily('2026-11-14', 4, 6, ['2026-11-13', '2026-11-14']);
    expect(mergeDaily(local, local, TODAY)).toEqual(local);
  });

  it('handles empty states', () => {
    expect(mergeDaily(empty(), empty(), TODAY)).toEqual(empty());
    expect(mergeDaily(empty(), daily('2026-11-14', 1, 1, ['2026-11-14']), TODAY).streak).toBe(1);
  });
});
