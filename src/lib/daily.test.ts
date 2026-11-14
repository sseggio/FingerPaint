import {
  addDays,
  clearDailyCache,
  DAILY_EPOCH,
  dailyArtworkId,
  dayKeyFromNumber,
  dayNumber,
  EMPTY_DAILY_STATE,
  isDailyState,
  isDayKey,
  isoWeekStart,
  JOKERS_PER_WEEK,
  NO_REPEAT_DAYS,
  recordActivity,
  seededShuffle,
  toDayKey,
  viewStreak,
  type DailyState,
  type DayKey,
  type LocalDate,
} from './daily';

const HOUR = 3_600_000;

/**
 * The local calendar of an instant in a given IANA time zone (what a `Date` reports on a device
 * set to that zone). Jest workers cannot switch `process.env.TZ` at runtime, so zones are
 * simulated with Intl, which knows the real DST rules.
 */
function inZone(epochMs: number, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(epochMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { getFullYear: () => get('year'), getMonth: () => get('month') - 1, getDate: () => get('day') };
}

const POOL = Array.from({ length: 32 }, (_, i) => `art-${String(i).padStart(2, '0')}`);

/** Replays activity on the given days (in order) from an empty state. */
function play(days: DayKey[]): DailyState {
  return days.reduce(recordActivity, { ...EMPTY_DAILY_STATE, jokerDays: [], activeDays: [] });
}

describe('calendar days', () => {
  it('validates day keys', () => {
    expect(isDayKey('2026-11-14')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-1-4')).toBe(false);
    expect(isDayKey(20261114)).toBe(false);
  });

  it('round-trips day numbers and adds days across months and years', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayKeyFromNumber(dayNumber('2028-02-29'))).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('starts ISO weeks on Monday', () => {
    const monday = dayNumber('2026-11-09');
    expect(isoWeekStart('2026-11-09')).toBe(monday);
    expect(isoWeekStart('2026-11-15')).toBe(monday); // Sunday
    expect(isoWeekStart('2026-11-16')).toBe(monday + 7);
    // Year boundary: 2027-01-01 is a Friday, its week starts on Monday 2026-12-28.
    expect(isoWeekStart('2027-01-01')).toBe(dayNumber('2026-12-28'));
  });

  it('uses the local calendar day, unaffected by DST transitions', () => {
    // Paris, 2026-03-29: clocks go forward at 01:00 UTC (a 23 h day).
    const lateSat = Date.UTC(2026, 2, 28, 22, 50); // Sat 23:50 CET
    expect(toDayKey(inZone(lateSat, 'Europe/Paris'))).toBe('2026-03-28');
    expect(toDayKey(inZone(lateSat + 23 * HOUR, 'Europe/Paris'))).toBe('2026-03-29'); // Sun 23:50 CEST
    expect(toDayKey(inZone(lateSat + 24 * HOUR, 'Europe/Paris'))).toBe('2026-03-30');
    // 2026-10-25: back at 01:00 UTC (a 25 h day): 24 h after midnight is still the same day.
    const midnight = Date.UTC(2026, 9, 24, 22, 0); // Sun 00:00 CEST
    expect(toDayKey(inZone(midnight + 24 * HOUR, 'Europe/Paris'))).toBe('2026-10-25');
    expect(toDayKey(inZone(midnight + 25 * HOUR, 'Europe/Paris'))).toBe('2026-10-26');
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-29')).toBe(1);
    expect(dayNumber('2026-10-26') - dayNumber('2026-10-25')).toBe(1);
  });

  it('reads a Date in the device time zone', () => {
    expect(toDayKey(new Date(2026, 10, 14, 0, 0))).toBe('2026-11-14');
    expect(toDayKey(new Date(2026, 10, 14, 23, 59))).toBe('2026-11-14');
  });

  it('follows the time zone for the same instant', () => {
    const instant = Date.UTC(2026, 0, 5, 23, 30);
    expect(toDayKey(inZone(instant, 'Europe/Paris'))).toBe('2026-01-06');
    expect(toDayKey(inZone(instant, 'America/New_York'))).toBe('2026-01-05');
  });
});

describe('daily artwork', () => {
  beforeEach(() => clearDailyCache());

  it('is deterministic: same date, same artwork (even after the cache is cleared)', () => {
    const a = dailyArtworkId('2026-11-14', POOL);
    clearDailyCache();
    expect(dailyArtworkId('2026-11-14', POOL)).toBe(a);
    expect(POOL).toContain(a);
  });

  it('does not depend on the pool order or duplicates', () => {
    const reversed = [...POOL].reverse();
    for (let d = 0; d < 60; d++) {
      const day = addDays('2026-11-01', d);
      expect(dailyArtworkId(day, reversed)).toBe(dailyArtworkId(day, [...POOL, POOL[0]]));
    }
  });

  it('never repeats within 30 days, over several years', () => {
    const start = dayNumber(DAILY_EPOCH);
    const seq: string[] = [];
    for (let d = 0; d < 365 * 4; d++) seq.push(dailyArtworkId(dayKeyFromNumber(start + d), POOL) as string);
    for (let i = 0; i < seq.length; i++) {
      const window = new Set(seq.slice(i, i + NO_REPEAT_DAYS));
      expect(window.size).toBe(Math.min(NO_REPEAT_DAYS, seq.length - i));
    }
    // Every artwork gets its turn.
    expect(new Set(seq).size).toBe(POOL.length);
  });

  it('is not a fixed cycle', () => {
    const days = Array.from({ length: 64 }, (_, i) => dailyArtworkId(addDays('2026-06-01', i), POOL));
    expect(days.slice(0, 32)).not.toEqual(days.slice(32));
  });

  it('handles small and empty pools', () => {
    const small = ['a', 'b', 'c', 'd', 'e'];
    const seq = Array.from({ length: 50 }, (_, i) => dailyArtworkId(addDays('2026-01-01', i), small));
    for (let i = 0; i + small.length <= seq.length; i++) expect(new Set(seq.slice(i, i + small.length)).size).toBe(5);
    expect(dailyArtworkId('2026-01-01', ['solo'])).toBe('solo');
    expect(dailyArtworkId('2026-01-01', [])).toBeNull();
    // Dates before the epoch use the first day.
    expect(dailyArtworkId('2001-01-01', POOL)).toBe(dailyArtworkId(DAILY_EPOCH, POOL));
  });

  it('seededShuffle is a pure permutation', () => {
    expect(seededShuffle(POOL, 42)).toEqual(seededShuffle(POOL, 42));
    expect([...seededShuffle(POOL, 42)].sort()).toEqual(POOL);
  });
});

describe('forgiving streak', () => {
  // 2026-11-09 is a Monday.
  it('counts consecutive colored days, once per day', () => {
    const s = play(['2026-11-09', '2026-11-09', '2026-11-10', '2026-11-11']);
    expect(s).toMatchObject({ streak: 3, best: 3, lastActiveDay: '2026-11-11', jokerDays: [] });
    expect(recordActivity(s, '2026-11-11')).toBe(s);
  });

  it('a joker preserves the streak (automatically, without adding to it)', () => {
    const s = play(['2026-11-09', '2026-11-10', '2026-11-12']);
    expect(s).toMatchObject({ streak: 3, jokerDays: ['2026-11-11'] });
    expect(viewStreak(s, '2026-11-12')).toMatchObject({ streak: 3, jokersLeft: JOKERS_PER_WEEK - 1, restart: false });
  });

  it('covers up to 2 missed days per week, then restarts gently', () => {
    const two = play(['2026-11-09', '2026-11-12']);
    expect(two).toMatchObject({ streak: 2, jokerDays: ['2026-11-10', '2026-11-11'] });
    expect(viewStreak(two, '2026-11-12').jokersLeft).toBe(0);

    const three = play(['2026-11-09', '2026-11-13']);
    expect(three).toMatchObject({ streak: 1, best: 1, jokerDays: [] });
  });

  it('resets jokers every ISO week', () => {
    // Week 1: two jokers (Tue, Thu). Week 2: one more miss on Tuesday is still covered.
    const s = play(['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-18']);
    expect(s.streak).toBe(7);
    expect(s.jokerDays).toEqual(['2026-11-10', '2026-11-12', '2026-11-17']);
    expect(viewStreak(s, '2026-11-18').jokersLeft).toBe(1);
    expect(viewStreak(s, '2026-11-23').jokersLeft).toBe(JOKERS_PER_WEEK); // next Monday
  });

  it('splits a gap across a week boundary between both weeks', () => {
    // Missed Sat + Sun (week 1) and Mon (week 2): 2 + 1 jokers, still alive.
    const s = play(['2026-11-13', '2026-11-17']);
    expect(s).toMatchObject({ streak: 2, jokerDays: ['2026-11-14', '2026-11-15', '2026-11-16'] });
    // Both week-1 jokers went to Tue/Wed: missing Saturday too is one day too many that week.
    const broken = play(['2026-11-09', '2026-11-12', '2026-11-13', '2026-11-15']);
    expect(broken.streak).toBe(1);
  });

  it('shows the streak alive until today ends, and a soft restart after', () => {
    const s = play(['2026-11-09', '2026-11-10']);
    expect(viewStreak(s, '2026-11-10')).toMatchObject({ streak: 2, activeToday: true, restart: false });
    expect(viewStreak(s, '2026-11-11')).toMatchObject({ streak: 2, activeToday: false, jokersLeft: 2 });
    // Two missed days pending: covered (and counted) on screen before any new activity.
    expect(viewStreak(s, '2026-11-13')).toMatchObject({ streak: 2, jokersLeft: 0, coveredDays: ['2026-11-11', '2026-11-12'] });
    expect(viewStreak(s, '2026-11-14')).toMatchObject({ streak: 0, restart: true });
    expect(viewStreak(play([]), '2026-11-14')).toMatchObject({ streak: 0, restart: false, jokersLeft: 2 });
  });

  it('survives DST: a 23 h or 25 h day never counts as a missed day', () => {
    const lateSat = Date.UTC(2026, 2, 28, 22, 50); // Paris Sat 23:50, then Sun 23:50 (23 h later)
    const days = [lateSat, lateSat + 23 * HOUR, lateSat + 23 * HOUR + 30 * 60_000].map((t) =>
      toDayKey(inZone(t, 'Europe/Paris')),
    );
    expect(days).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    expect(play(days)).toMatchObject({ streak: 3, jokerDays: [] });
    // Fall back: Sat 00:30 then Sun 23:30 is 48 h later but only one day apart.
    const sat = Date.UTC(2026, 9, 23, 22, 30);
    const fall = [sat, sat + 48 * HOUR].map((t) => toDayKey(inZone(t, 'Europe/Paris')));
    expect(fall).toEqual(['2026-10-24', '2026-10-25']);
    expect(play(fall)).toMatchObject({ streak: 2, jokerDays: [] });
  });

  it('survives a time zone change, including going back a day', () => {
    const instant = Date.UTC(2026, 0, 5, 23, 30);
    let s = play(['2026-01-05', toDayKey(inZone(instant, 'Europe/Paris'))]); // Paris: Tuesday 6
    expect(s.streak).toBe(2);
    // Flight to New York: the same instant is back on Monday 5.
    s = recordActivity(s, toDayKey(inZone(instant + HOUR, 'America/New_York')));
    expect(s).toMatchObject({ streak: 2, lastActiveDay: '2026-01-06', jokerDays: [] });
    expect(viewStreak(s, '2026-01-05')).toMatchObject({ streak: 2, restart: false });
    s = recordActivity(s, '2026-01-07');
    expect(s.streak).toBe(3);
    // Eastward jump skipping a calendar day (e.g. crossing the date line) uses a joker, no break.
    s = recordActivity(s, '2026-01-09');
    expect(s).toMatchObject({ streak: 4, jokerDays: ['2026-01-08'] });
  });

  it('prunes history and keeps the best streak', () => {
    let s = play(Array.from({ length: 100 }, (_, i) => addDays('2026-01-01', i)));
    expect(s.streak).toBe(100);
    expect(s.activeDays.length).toBeLessThanOrEqual(62);
    s = recordActivity(s, addDays('2026-01-01', 120));
    expect(s).toMatchObject({ streak: 1, best: 100 });
  });

  it('validates stored state', () => {
    expect(isDailyState(play(['2026-11-09']))).toBe(true);
    expect(isDailyState({ ...EMPTY_DAILY_STATE })).toBe(true);
    expect(isDailyState({ ...EMPTY_DAILY_STATE, streak: -1 })).toBe(false);
    expect(isDailyState({ ...EMPTY_DAILY_STATE, streak: 3, best: 1 })).toBe(false);
    expect(isDailyState({ ...EMPTY_DAILY_STATE, lastActiveDay: 'yesterday' })).toBe(false);
    expect(isDailyState({ ...EMPTY_DAILY_STATE, jokerDays: ['2026-02-30'] })).toBe(false);
    expect(isDailyState(null)).toBe(false);
  });
});
