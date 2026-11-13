import type { LocalePreference } from '@/features/i18n/types';
import type { Schema } from '@/lib/storage';

export type { LocalePreference };
export type ThemePreference = 'system' | 'light' | 'dark';
export type SessionTimerMin = 0 | 10 | 20 | 30;

export interface Settings {
  locale: LocalePreference;
  theme: ThemePreference;
  dragToFill: boolean;
  haptics: boolean;
  colorblindSymbols: boolean;
  largeNumbers: boolean;
  highContrast: boolean;
  leftHanded: boolean;
  sessionTimerMin: SessionTimerMin;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  locale: 'system',
  theme: 'system',
  dragToFill: true,
  haptics: true,
  colorblindSymbols: false,
  largeNumbers: false,
  highContrast: false,
  leftHanded: false,
  sessionTimerMin: 0,
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
] as const;

/** v0 keys copied as-is into v1 (the others are renamed or derived). */
const V0_CARRIED_KEYS = BOOLEAN_KEYS.filter((k) => k !== 'colorblindSymbols');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    LOCALES.includes(value.locale) &&
    THEMES.includes(value.theme) &&
    TIMERS.includes(value.sessionTimerMin) &&
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
    ...DEFAULT_SETTINGS,
    ...carried,
    locale: language === 'fr' || language === 'en' ? language : 'system',
    theme: darkMode === true ? 'dark' : darkMode === false ? 'light' : 'system',
    colorblindSymbols: colorblind === true,
  };
}

export const settingsSchema: Schema<Settings> = {
  version: 1,
  migrations: { 0: migrateSettingsV0toV1 },
  guard: isSettings,
  defaults: () => ({ ...DEFAULT_SETTINGS }),
};
