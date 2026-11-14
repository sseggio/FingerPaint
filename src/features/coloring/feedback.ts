import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/features/settings/settings-store';

/**
 * Haptics of the coloring screen, one per user action and always paired with a visual change.
 * Each call reads the `haptics` setting at that moment, so toggling it applies immediately.
 */
function play(effect: () => Promise<void>): void {
  if (!useSettingsStore.getState().settings.haptics) return;
  effect().catch(() => undefined);
}

export const coloringFeedback = {
  /** Tap on a cell of another color: nothing is painted, a light tap says "not this one". */
  wrongColor: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A color has just been finished (the palette moves on to the next one). */
  colorDone: () => play(() => Haptics.selectionAsync()),
  /** The whole artwork is finished. */
  artworkDone: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Switching color in the palette. */
  select: () => play(() => Haptics.selectionAsync()),
};
