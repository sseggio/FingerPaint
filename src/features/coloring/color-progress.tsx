import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import type { Translate } from '@/features/i18n';
import { useT } from '@/features/i18n';
import type { PaletteColor } from '@/lib/artwork/types';
import { readableTextOn } from '@/lib/color';
import { radius, spacing, useTheme } from '@/theme';

import { SymbolIcon } from './symbol-icon';

/**
 * How long a just-finished color stays active (bar full, check) before the session moves on to
 * the next one (F23). With reduce motion the session moves on right away.
 */
export const COLOR_DONE_HOLD_MS = 600;

/** Dot of the active color, in front of its name. */
const DOT_SIZE = 28;
const DOT_SYMBOL_SIZE = 16;
/** Height of the bar: well visible, still a thin strip. */
const BAR_HEIGHT = 10;

/** Fill spring for each batch: lively, a hint of overshoot. */
const FILL_SPRING = { damping: 18, stiffness: 180, mass: 0.8 } as const;
/** "Pop" of the finished bar. */
const POP_UP = { damping: 8, stiffness: 420 } as const;
const POP_SETTLE = { damping: 12, stiffness: 260 } as const;
const POP_SCALE = 1.06;

/** Filled share of a color, clamped to 0..1 (an empty color counts as done). */
export function colorRatio(filled: number, total: number): number {
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, filled / total));
}

/** Screen-reader label of the active color's progress bar. */
export function colorProgressLabel(
  t: Translate,
  number: number,
  filled: number,
  total: number,
  name?: string,
): string {
  const done = filled >= total;
  if (name) {
    return done
      ? t('coloring.progress.labelNamedDone', { number, name, total })
      : t('coloring.progress.labelNamed', { number, name, filled, total });
  }
  return done ? t('coloring.progress.labelDone', { number, total }) : t('coloring.progress.label', { number, filled, total });
}

export interface ColorProgressProps {
  color: PaletteColor;
  filled: number;
  total: number;
  /** Colorblind mode: the color's name (shown and read) and its symbol in the dot. */
  name?: string;
  /** Left-handed mode: mirrored layout. */
  leftHanded?: boolean;
}

/**
 * Progress of the active color (F23): its dot, number (or symbol) and name, a bar that springs
 * forward with every batch the session accepts and a "12 / 40 · 30 %" counter. Reaching 100 %
 * pops the bar and shows a check (the session then moves on to the next color after
 * `COLOR_DONE_HOLD_MS`). It only re-renders with the session counters (JS side), never during a
 * gesture. With reduce motion the bar jumps to its value, without spring or pop.
 */
export function ColorProgress({ color, filled, total, name, leftHanded = false }: ColorProgressProps) {
  const t = useT();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const ratio = colorRatio(filled, total);
  const done = filled >= total;
  const percent = Math.floor(ratio * 100);

  const progress = useSharedValue(ratio);
  const pop = useSharedValue(1);
  const previous = useRef({ number: color.number, done });

  useEffect(() => {
    progress.set(reduceMotion ? ratio : withSpring(ratio, FILL_SPRING));
  }, [progress, ratio, reduceMotion]);

  useEffect(() => {
    const before = previous.current;
    previous.current = { number: color.number, done };
    // Pop only when this color has just been finished (not when an earlier one is selected).
    if (reduceMotion || !done || before.done || before.number !== color.number) return;
    pop.set(withSequence(withSpring(POP_SCALE, POP_UP), withSpring(1, POP_SETTLE)));
  }, [color.number, done, pop, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, progress.get())) * 100}%` }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const ink = readableTextOn(color.hex);
  const title = name
    ? t('coloring.progress.titleNamed', { number: color.number, name })
    : t('coloring.progress.title', { number: color.number });
  const count = t('coloring.progress.count', { filled: Math.min(filled, total), total });

  return (
    <View
      testID="color-progress"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={colorProgressLabel(t, color.number, filled, total, name)}
      accessibilityValue={{ min: 0, max: total, now: Math.min(filled, total) }}
      style={styles.root}>
      <View style={[styles.header, leftHanded && styles.reversed]}>
        <View style={[styles.dot, { backgroundColor: color.hex, borderColor: colors.border }]}>
          {done ? (
            <AppText variant="caption" color={ink} maxFontSizeMultiplier={1.2} style={styles.dotText}>
              ✓
            </AppText>
          ) : name ? (
            <SymbolIcon symbol={color.symbol} size={DOT_SYMBOL_SIZE} color={ink} />
          ) : (
            <AppText variant="caption" color={ink} maxFontSizeMultiplier={1.2} style={styles.dotText}>
              {String(color.number)}
            </AppText>
          )}
        </View>
        <AppText variant="label" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        <AppText variant="caption" color={done ? colors.primaryText : colors.inkSecondary} style={styles.count}>
          {done ? t('coloring.progress.done') : `${count} · ${t('coloring.progress.percent', { percent })}`}
        </AppText>
      </View>
      <Animated.View style={[styles.track, { backgroundColor: colors.border }, popStyle]}>
        <Animated.View
          testID="color-progress-fill"
          style={[styles.fill, { backgroundColor: done ? colors.success : colors.ink }, fillStyle]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reversed: { flexDirection: 'row-reverse' },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { fontWeight: '800' },
  title: { flex: 1, fontWeight: '800' },
  count: { fontVariant: ['tabular-nums'] },
  track: { height: BAR_HEIGHT, borderRadius: radius.xs, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.xs },
});
