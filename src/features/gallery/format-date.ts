import { useMemo } from 'react';

import { useLocale } from '@/features/i18n';

/** Medium date in the UI language ("14 nov. 2026" / "Nov 14, 2026"). */
export function formatDate(time: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(time));
  } catch {
    return new Date(time).toISOString().slice(0, 10);
  }
}

export function useFormatDate(): (time: number) => string {
  const locale = useLocale();
  return useMemo(() => (time: number) => formatDate(time, locale), [locale]);
}
