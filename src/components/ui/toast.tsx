import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './app-text';
import { PressableScale } from './pressable-scale';

export type ToastProps = {
  /** Short title (optional) and message. */
  title?: string;
  message: string;
  /** Left accent stripe (a theme accent token). */
  accent?: string;
  /** Optional dismiss action. */
  action?: { label: string; accessibilityLabel: string; onPress: () => void };
  /** Hides itself after this delay (ms) by calling `onTimeout`. */
  durationMs?: number;
  onTimeout?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Non-blocking message floating over the content: it never captures the screen, announces
 * itself to screen readers and enters with a soft fade (Reanimated layout animations follow the
 * system reduce-motion setting).
 */
export function Toast({ title, message, accent, action, durationMs, onTimeout, style }: ToastProps) {
  const { colors } = useTheme();
  const announcement = title ? `${title} ${message}` : message;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  useEffect(() => {
    if (!durationMs || !onTimeout) return;
    const timer = setTimeout(onTimeout, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onTimeout, announcement]);

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutUp.duration(180)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow },
        style,
      ]}>
      <View style={[styles.stripe, { backgroundColor: accent ?? colors.accent }]} />
      <View style={styles.text}>
        {title ? <AppText variant="label">{title}</AppText> : null}
        <AppText variant="caption" tone={title ? 'secondary' : 'default'}>
          {message}
        </AppText>
      </View>
      {action ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
          hitSlop={8}
          style={[styles.action, { backgroundColor: colors.surfaceAlt }]}>
          <AppText variant="label" tone="primary">
            {action.label}
          </AppText>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  stripe: { width: 6, alignSelf: 'stretch', borderRadius: radius.pill },
  text: { flex: 1, gap: 2 },
  action: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
