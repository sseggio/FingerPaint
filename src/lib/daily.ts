/**
 * Daily artwork and forgiving streak. Pure functions only: the clock is always injected as a
 * local calendar day (`YYYY-MM-DD`), never read implicitly.
 *
 * Days are counted on the calendar, not in milliseconds: `dayNumber` maps a local date key to
 * a day index through `Date.UTC`, so 23 h / 25 h DST days and time zone changes never shift it.
 *
 * Streak rule (chosen to be kind): a day counts as soon as the user colors at least one cell,
 * on any artwork (finishing the daily artwork is not required). Up to `JOKERS_PER_WEEK` missed
 * days per ISO week (Monday to Sunday) are covered automatically by jokers; a joker preserves
 * the streak but does not add to it. Today is never a missed day: the streak stays alive until
 * the day ends. When more days are missed, the streak simply starts again (no penalty).
 */

/** Local calendar day, `YYYY-MM-DD`. */
export type DayKey = string;

export const JOKERS_PER_WEEK = 2;
/** The daily artwork never repeats within this many consecutive days (if the pool allows it). */
export const NO_REPEAT_DAYS = 30;
/** Active / joker days kept in storage (enough for the current and previous weeks, and a month). */
export const DAILY_HISTORY_DAYS = 62;

const MS_PER_DAY = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** What `toDayKey` reads: a `Date` (device time zone) or any local-calendar view of an instant. */
export interface LocalDate {
  getFullYear(): number;
  /** 0-based, like `Date#getMonth`. */
  getMonth(): number;
  getDate(): number;
}

/** Local calendar day of an instant, in the device's current time zone. */
export function toDayKey(date: LocalDate): DayKey {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True for a real calendar date written `YYYY-MM-DD` (rejects `2026-02-30`). */
export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false;
  const m = DAY_KEY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Days since 1970-01-01 (calendar arithmetic, independent of time zones and DST). */
export function dayNumber(key: DayKey): number {
  const m = DAY_KEY.exec(key);
  if (!m) throw new RangeError(`invalid day key "${key}"`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

export function dayKeyFromNumber(n: number): DayKey {
  const d = new Date(n * MS_PER_DAY);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(key: DayKey, delta: number): DayKey {
  return dayKeyFromNumber(dayNumber(key) + delta);
}

/** ISO week id: the day number of its Monday (1970-01-01 was a Thursday). */
export function isoWeekStart(key: DayKey): number {
  const n = dayNumber(key);
  const weekday = (((n + 3) % 7) + 7) % 7; // Monday = 0 … Sunday = 6
  return n - weekday;
}

// ---------------------------------------------------------------------------------------------
// Daily artwork
// ---------------------------------------------------------------------------------------------

/** 32-bit string hash (FNV-1a). */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pure PRNG (mulberry32): same seed, same sequence. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates shuffle (returns a new array). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** First day of the daily sequence (earlier dates use this day's artwork). */
export const DAILY_EPOCH: DayKey = '2024-01-01';
/**
 * Length of the daily sequence (~100 years). Days beyond it wrap around to the start, which
 * bounds the memoized sequence (one entry per day) if the clock is set centuries ahead. The
 * wrap is harmless: the no-repeat guarantee only breaks for the 30 days around the seam, which
 * nobody will live to see in 2124.
 */
const DAILY_SEQUENCE_SPAN = 36_525;

interface Sequence {
  /** Pool index per day since the epoch. */
  picks: number[];
  /** Day (since epoch) each pool item was last picked, -Infinity when never. */
  lastUsed: number[];
  random: () => number;
}

const sequences = new Map<string, Sequence>();

/**
 * Index of the artwork for `day` (days since the epoch). The sequence is built day by day from
 * the epoch: each day picks, with a PRNG seeded by the pool, one of the artworks not shown in
 * the previous `window - 1` days. With 32 free artworks that leaves 3 candidates a day: the
 * order stays varied while never repeating within 30 days. Memoized per pool (a few µs/day).
 */
function pickIndex(pool: readonly string[], day: number): number {
  const signature = pool.join('\n');
  let seq = sequences.get(signature);
  if (!seq) {
    seq = { picks: [], lastUsed: pool.map(() => -Infinity), random: mulberry32(hashString(signature)) };
    sequences.set(signature, seq);
  }
  const window = Math.min(NO_REPEAT_DAYS, pool.length);
  for (let d = seq.picks.length; d <= day; d++) {
    const candidates: number[] = [];
    for (let i = 0; i < pool.length; i++) if (d - seq.lastUsed[i] >= window) candidates.push(i);
    const pick = candidates[Math.floor(seq.random() * candidates.length)];
    seq.picks.push(pick);
    seq.lastUsed[pick] = d;
  }
  return seq.picks[day];
}

/**
 * Artwork id of the day. `pool`: ids of the eligible (free) artworks; order does not matter
 * (sorted internally). Same date + same pool = same artwork. Adding content changes the pool,
 * hence the sequence, which is fine: it only ever happens with an app update.
 */
export function dailyArtworkId(key: DayKey, pool: readonly string[]): string | null {
  if (pool.length === 0) return null;
  const sorted = [...new Set(pool)].sort();
  // A clock set centuries ahead must not build a huge sequence: wrap after ~100 years.
  const day = Math.max(0, dayNumber(key) - dayNumber(DAILY_EPOCH)) % DAILY_SEQUENCE_SPAN;
  return sorted[pickIndex(sorted, day)];
}

/** Clears the memoized sequences (tests). */
export function clearDailyCache() {
  sequences.clear();
}

// ---------------------------------------------------------------------------------------------
// Forgiving streak
// ---------------------------------------------------------------------------------------------

export interface DailyState {
  /** Last day the user colored at least one cell. */
  lastActiveDay: DayKey | null;
  /** Days colored in the current run (joker days preserve it without adding to it). */
  streak: number;
  best: number;
  /** Recent days covered by a joker (pruned to `DAILY_HISTORY_DAYS`). */
  jokerDays: DayKey[];
  /** Recent days with activity (pruned), for the monthly notebook later. */
  activeDays: DayKey[];
}

export const EMPTY_DAILY_STATE: Readonly<DailyState> = Object.freeze({
  lastActiveDay: null,
  streak: 0,
  best: 0,
  jokerDays: Object.freeze([]) as unknown as DayKey[],
  activeDays: Object.freeze([]) as unknown as DayKey[],
});

export interface StreakView {
  /** Current streak as of `today` (0 when it has to start again). */
  streak: number;
  best: number;
  activeToday: boolean;
  /** Jokers still available this ISO week (after covering the days already missed). */
  jokersLeft: number;
  /** Missed days that will be covered by jokers (already counted in `jokersLeft`). */
  coveredDays: DayKey[];
  /** The previous streak could not be covered: a fresh start ("On repart !"). */
  restart: boolean;
}

function jokersUsedInWeek(days: readonly DayKey[], weekStart: number): number {
  return days.filter((d) => isoWeekStart(d) === weekStart).length;
}

interface Projection {
  alive: boolean;
  covered: DayKey[];
}

/** Covers the days missed strictly between the last active day and `today` with jokers. */
function project(state: DailyState, today: DayKey): Projection {
  if (!state.lastActiveDay || state.streak === 0) return { alive: false, covered: [] };
  const last = dayNumber(state.lastActiveDay);
  const now = dayNumber(today);
  // Same day, or the clock went back (west-bound trip, manual change): nothing was missed.
  if (now - last <= 1) return { alive: true, covered: [] };
  const used = new Map<number, number>();
  const covered: DayKey[] = [];
  for (let d = last + 1; d < now; d++) {
    const key = dayKeyFromNumber(d);
    const week = isoWeekStart(key);
    const count = used.get(week) ?? jokersUsedInWeek(state.jokerDays, week);
    if (count >= JOKERS_PER_WEEK) return { alive: false, covered: [] };
    used.set(week, count + 1);
    covered.push(key);
  }
  return { alive: true, covered };
}

/** What the streak looks like on `today`, without changing anything. */
export function viewStreak(state: DailyState, today: DayKey): StreakView {
  const { alive, covered } = project(state, today);
  const week = isoWeekStart(today);
  const usedThisWeek =
    jokersUsedInWeek(state.jokerDays, week) + covered.filter((d) => isoWeekStart(d) === week).length;
  // Strict equality: a last active day after `today` (clock moved back) is not "today".
  const activeToday = state.lastActiveDay === today && state.streak > 0;
  return {
    streak: alive ? state.streak : 0,
    best: state.best,
    activeToday,
    jokersLeft: Math.max(0, JOKERS_PER_WEEK - usedThisWeek),
    coveredDays: covered,
    restart: !alive && state.streak > 0,
  };
}

function prune(days: readonly DayKey[], today: DayKey): DayKey[] {
  const min = dayNumber(today) - DAILY_HISTORY_DAYS;
  return [...new Set(days)].filter((d) => dayNumber(d) > min).sort();
}

/**
 * Records that the user colored on `today`. Idempotent within a day; returns the same object
 * when nothing changes (so callers can skip the write). Missed days are covered by jokers when
 * possible, otherwise the streak restarts at 1.
 */
export function recordActivity(state: DailyState, today: DayKey): DailyState {
  if (state.lastActiveDay && dayNumber(today) <= dayNumber(state.lastActiveDay) && state.streak > 0) {
    // Already counted (or an earlier local day after a time zone change): keep the run as is.
    if (state.activeDays.includes(today)) return state;
    return { ...state, activeDays: prune([...state.activeDays, today], state.lastActiveDay) };
  }
  const { alive, covered } = project(state, today);
  const streak = alive ? state.streak + 1 : 1;
  return {
    lastActiveDay: today,
    streak,
    best: Math.max(state.best, streak),
    jokerDays: prune([...state.jokerDays, ...covered], today),
    activeDays: prune([...state.activeDays, today], today),
  };
}

export function isDailyState(value: unknown): value is DailyState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const count = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  const days = (a: unknown) => Array.isArray(a) && a.length <= DAILY_HISTORY_DAYS * 2 && a.every(isDayKey);
  return (
    (v.lastActiveDay === null || isDayKey(v.lastActiveDay)) &&
    count(v.streak) &&
    count(v.best) &&
    (v.best as number) >= (v.streak as number) &&
    days(v.jokerDays) &&
    days(v.activeDays)
  );
}
