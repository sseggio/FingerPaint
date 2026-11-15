import type { LocalePreference } from '@/features/i18n/types';
import type { Schema } from '@/lib/storage';
import { isLongPressMs, LONG_PRESS_MS, type LongPressMs } from '@/lib/touch-intent';

export type { LocalePreference };
export type ThemePreference = 'system' | 'light' | 'dark';
export type SessionTimerMin = 0 | 10 | 20 | 30;
/** "Delay before coloring by sliding" (ms): short, normal, long (F23). */
export type FillDelayMs = LongPressMs;

export interface Settings {
  locale: LocalePreference;
  theme: ThemePreference;
  /**
   * "Fill by sliding after a long press" (F15). Before F15 it meant "one-finger drags fill"; the
   * stored value keeps its intent (sliding a finger can color several cells, or not), so it is
   * reused as-is, without a schema migration.
   */
  dragToFill: boolean;
  /** Hold time (ms) before a still finger starts continuous fill (F23, settings v3). */
  fillDelayMs: FillDelayMs;
  haptics: boolean;
  colorblindSymbols: boolean;
  largeNumbers: boolean;
  highContrast: boolean;
  leftHanded: boolean;
  sessionTimerMin: SessionTimerMin;
  /** Neon pack (cosmetic): canvas theme + confetti, when owned. On by default, can be turned off. */
  neonTheme: boolean;
  /** Pro bonus cosmetic: golden confetti, when owned. */
  goldConfetti: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  locale: 'system',
  theme: 'system',
  dragToFill: true,
  fillDelayMs: LONG_PRESS_MS,
  haptics: true,
  colorblindSymbols: false,
  largeNumbers: false,
  highContrast: false,
  leftHanded: false,
  sessionTimerMin: 0,
  neonTheme: true,
  goldConfetti: true,
});

const LOCALES: readonly unknown[] = ['system', 'fr', 'en'];
const THEMES: readonly unknown[] = ['system', 'light', 'dark'];
const TIMERS: readonly unknown[] = [0, 10, 20, 30];
const BOOLEAN_KEYS = [
  'dragToFill',
  'haptics',
  'colorblindSymbols',
  'largeNumbers',
  'highContrast',
  'leftHanded',
  'neonTheme',
  'goldConfetti',
] as const;

/** v0 keys copied as-is into v1 (the others are renamed, derived or newer). */
const V0_CARRIED_KEYS = ['dragToFill', 'haptics', 'largeNumbers', 'highContrast', 'leftHanded'] as const;

/** Keys added in v2 (cosmetic toggles, F12). */
const V2_KEYS = ['neonTheme', 'goldConfetti'] as const;
/** Keys added in v3 (long-press delay, F23). */
const V3_KEYS = ['fillDelayMs'] as const;
/**
 * Keys added after v1, with their defaults (filled in by the migrations and on backup import of
 * files written before they existed).
 */
const NEWER_KEYS = [...V2_KEYS, ...V3_KEYS] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    LOCALES.includes(value.locale) &&
    THEMES.includes(value.theme) &&
    TIMERS.includes(value.sessionTimerMin) &&
    isLongPressMs(value.fillDelayMs) &&
    BOOLEAN_KEYS.every((k) => typeof value[k] === 'boolean')
  );
}

/**
 * v0 (pre-envelope prototype): `{ language, darkMode, colorblind, ...booleans }`.
 * v1: the `Settings` interface (theme tri-state, `colorblindSymbols`, session timer).
 */
export function migrateSettingsV0toV1(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('settings v0: not an object');
  const { language, darkMode, colorblind } = data;
  // Only keys that still exist in v1 are carried over; anything else is dropped (the guard
  // then validates their types).
  const carried: Record<string, unknown> = {};
  for (const key of V0_CARRIED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) carried[key] = data[key];
  }
  return {
    // Current defaults (the v1 → v2 step keeps them as they are).
    ...DEFAULT_SETTINGS,
    ...carried,
    locale: language === 'fr' || language === 'en' ? language : 'system',
    theme: darkMode === true ? 'dark' : darkMode === false ? 'light' : 'system',
    colorblindSymbols: colorblind === true,
  };
}

/** v2 adds the cosmetic toggles (F12); everything else is unchanged. */
export function migrateSettingsV1toV2(data: unknown): unknown {
  return withDefaults(data, V2_KEYS);
}

/**
 * v3 adds the long-press delay (F23), at its default (normal, 150 ms); every other setting is
 * kept as it is.
 */
export function migrateSettingsV2toV3(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('settings v2: not an object');
  return withDefaults(data, V3_KEYS);
}

function withDefaults(data: unknown, keys: readonly (keyof Settings)[]): unknown {
  if (!isRecord(data)) return data;
  const out: Record<string, unknown> = { ...data };
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = DEFAULT_SETTINGS[key];
  return out;
}

/**
 * Fills the keys added after v1 with their defaults when they are missing (settings v1, and
 * backups written before v2). Returns the input unchanged when it is not an object.
 */
export function withNewerSettingsDefaults(data: unknown): unknown {
  return withDefaults(data, NEWER_KEYS);
}

export const settingsSchema: Schema<Settings> = {
  version: 3,
  migrations: { 0: migrateSettingsV0toV1, 1: migrateSettingsV1toV2, 2: migrateSettingsV2toV3 },
  guard: isSettings,
  defaults: () => ({ ...DEFAULT_SETTINGS }),
};
