import type { Dictionary, MessageKey, MessageParams, ParamValue } from './dictionary';
import { en } from './en';
import { fr } from './fr';
import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  type LocalePreference,
  type LocalizedText,
  type Message,
  type PluralMessage,
  type SupportedLocale,
} from './types';

export const dictionaries: Readonly<Record<SupportedLocale, Dictionary>> = { en, fr };

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Minimal language-code shape (compatible with `expo-localization`'s `Locale`). */
export interface SystemLocale {
  languageCode: string | null;
  languageTag?: string;
}

/**
 * Picks the UI language: an explicit preference wins; `system` takes the first supported
 * language among the device's preferred locales, and falls back to English otherwise.
 */
export function resolveLocale(preference: LocalePreference, systemLocales: readonly SystemLocale[]): SupportedLocale {
  if (preference !== 'system') return preference;
  for (const locale of systemLocales) {
    const code = (locale.languageCode ?? locale.languageTag?.split('-')[0] ?? '').toLowerCase();
    if (isSupportedLocale(code)) return code;
  }
  return FALLBACK_LOCALE;
}

const pluralRulesCache = new Map<SupportedLocale, Intl.PluralRules | null>();

function getPluralRules(locale: SupportedLocale): Intl.PluralRules | null {
  if (!pluralRulesCache.has(locale)) {
    let rules: Intl.PluralRules | null = null;
    try {
      rules = typeof Intl !== 'undefined' && Intl.PluralRules ? new Intl.PluralRules(locale) : null;
    } catch {
      rules = null;
    }
    pluralRulesCache.set(locale, rules);
  }
  return pluralRulesCache.get(locale) ?? null;
}

/** fr/en cardinal rules for engines without `Intl.PluralRules`. */
export function fallbackPluralCategory(locale: SupportedLocale, count: number): Intl.LDMLPluralRule {
  const n = Math.abs(count);
  if (locale === 'fr') return n < 2 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

/** CLDR cardinal category; uses `Intl.PluralRules` with a built-in fallback for fr/en. */
export function pluralCategory(locale: SupportedLocale, count: number): Intl.LDMLPluralRule {
  const rules = getPluralRules(locale);
  return rules ? rules.select(count) : fallbackPluralCategory(locale, count);
}

export function selectPlural(message: PluralMessage, locale: SupportedLocale, count: number): string {
  return message[pluralCategory(locale, count)] ?? message.other;
}

function formatValue(value: ParamValue, locale: SupportedLocale): string {
  if (typeof value !== 'number') return value;
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

/** Replaces `{name}` placeholders; unknown placeholders are left untouched. */
export function interpolate(
  template: string,
  params: Readonly<Record<string, ParamValue>> | undefined,
  locale: SupportedLocale,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? formatValue(params[name], locale) : match,
  );
}

type ParamsArg<K extends MessageKey> = keyof MessageParams<K> extends never ? [] : [params: MessageParams<K>];

export type Translate = <K extends MessageKey>(key: K, ...params: ParamsArg<K>) => string;

export function createTranslator(locale: SupportedLocale): Translate {
  const dictionary = dictionaries[locale];
  return (key, ...rest) => {
    const params = rest[0] as Readonly<Record<string, ParamValue>> | undefined;
    const message: Message | undefined = dictionary[key] ?? en[key];
    // Only reachable by bypassing the types (e.g. a key built at runtime): show the key.
    if (message === undefined) return String(key);
    if (typeof message === 'string') return interpolate(message, params, locale);
    const count = typeof params?.count === 'number' ? params.count : 0;
    return interpolate(selectPlural(message, locale, count), params, locale);
  };
}

/** Content title in the UI language, falling back to the other language if empty. */
export function localizedTitle(title: LocalizedText, locale: SupportedLocale): string {
  return title[locale] || title[FALLBACK_LOCALE] || title.fr;
}
