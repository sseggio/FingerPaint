import { EMPTY_DAILY_STATE, isDailyState, type DailyState } from '@/lib/daily';
import type { Schema } from '@/lib/storage';

/** `fp:daily` v1: the forgiving streak state (see `lib/daily`). */
export const dailySchema: Schema<DailyState> = {
  version: 1,
  migrations: {},
  guard: isDailyState,
  defaults: () => ({ ...EMPTY_DAILY_STATE, jokerDays: [], activeDays: [] }),
};
