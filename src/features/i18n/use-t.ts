import { useLocales } from 'expo-localization';
import { useMemo } from 'react';

import { useSettingsStore } from '@/features/settings/settings-store';

import { createTranslator, resolveLocale, type Translate } from './translate';
import type { SupportedLocale } from './types';

/** Current UI language: the settings preference, or the device language (fallback English). */
export function useLocale(): SupportedLocale {
  const preference = useSettingsStore((s) => s.settings.locale);
  const systemLocales = useLocales();
  return resolveLocale(preference, systemLocales);
}

/** Translation function for the current language; components re-render when it changes. */
export function useT(): Translate {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale), [locale]);
}
