import { useMemo } from 'react';

import { useSettingsStore } from '@/features/settings/settings-store';

import { resolveCosmetics, type Cosmetics } from './cosmetics';
import { useEntitlementsStore } from './entitlements-store';

/** Cosmetics that apply right now (owned + enabled in Settings); reactive to purchases. */
export function useCosmetics(): Cosmetics {
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  const neonTheme = useSettingsStore((s) => s.settings.neonTheme);
  const goldConfetti = useSettingsStore((s) => s.settings.goldConfetti);
  const { canvas, confetti } = resolveCosmetics(entitlements, { neonTheme, goldConfetti });
  return useMemo(() => ({ canvas, confetti }), [canvas, confetti]);
}
