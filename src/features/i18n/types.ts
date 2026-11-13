/** Languages the UI is translated into. */
export type SupportedLocale = 'fr' | 'en';

/** User preference stored in settings: follow the device, or force a language. */
export type LocalePreference = 'system' | SupportedLocale;

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['fr', 'en'];

/** Locale used when the system language is not supported. */
export const FALLBACK_LOCALE: SupportedLocale = 'en';

/** Plural forms keyed by `Intl.PluralRules#select` categories; `other` is mandatory. */
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export type Message = string | PluralMessage;

/** Title of a content item (artwork, album), one string per supported locale. */
export type LocalizedText = Readonly<Record<SupportedLocale, string>>;
