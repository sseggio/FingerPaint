import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText, PressableScale } from '@/components/ui';
import type { Translate } from '@/features/i18n';
import { useT } from '@/features/i18n';
import type { PaletteColor } from '@/lib/artwork/types';
import { readableTextOn } from '@/lib/color';
import { radius, spacing, useTheme } from '@/theme';

/** Swatch diameter (points): a comfortable 44 pt+ touch target. */
export const SWATCH_SIZE = 52;
const SWATCH_GAP = spacing.md;

/** Screen-reader label of one swatch: its number and its progress. */
export function swatchLabel(t: Translate, number: number, filled: number, total: number): string {
  if (filled >= total) return t('coloring.palette.colorDone', { number });
  return t('coloring.palette.color', { number, filled, total });
}

/** Horizontal offset that centers swatch `index` in a bar `barWidth` points wide. */
export function swatchScrollOffset(index: number, barWidth: number): number {
  const center = spacing.lg + index * (SWATCH_SIZE + SWATCH_GAP) + SWATCH_SIZE / 2;
  return Math.max(0, center - barWidth / 2);
}

interface SwatchProps {
  color: PaletteColor;
  filled: number;
  total: number;
  selected: boolean;
  label: string;
  onSelect(index: number): void;
}

const Swatch = memo(function Swatch({ color, filled, total, selected, label, onSelect }: SwatchProps) {
  const { colors } = useTheme();
  const done = filled >= total;
  const ratio = total > 0 ? Math.min(1, filled / total) : 1;
  const ink = readableTextOn(color.hex);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => onSelect(color.number - 1)}
      style={styles.swatchSlot}>
      <View
        style={[
          styles.ring,
          { borderColor: selected ? colors.ink : 'transparent' },
        ]}>
        <View style={[styles.swatch, { backgroundColor: color.hex, opacity: done && !selected ? 0.55 : 1 }]}>
          <AppText variant="label" color={ink} maxFontSizeMultiplier={1.3} style={styles.swatchText}>
            {done ? '✓' : String(color.number)}
          </AppText>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: done ? colors.success : colors.ink }]} />
      </View>
    </PressableScale>
  );
});

export interface PaletteBarProps {
  colors: readonly PaletteColor[];
  /** Cells of each color, from the artwork. */
  colorCounts: ArrayLike<number>;
  /** Filled cells of each color (live session counters). */
  colorFilled: ArrayLike<number>;
  /** Re-render signal: the counters above are mutated in place. */
  revision: number;
  activeColor: number;
  onSelect(colorIndex: number): void;
}

/**
 * Palette of the artwork: one swatch per color with its number, its progress and a check once
 * finished. The active swatch is ringed and kept in view (the session moves on to the next
 * color by itself when one is done).
 */
export function PaletteBar({ colors: paletteColors, colorCounts, colorFilled, activeColor, onSelect }: PaletteBarProps) {
  const t = useT();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const scroll = useRef<ScrollViewInstance>(null);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    if (barWidth <= 0) return;
    scroll.current?.scrollTo({ x: swatchScrollOffset(activeColor, barWidth), animated: !reduceMotion });
  }, [activeColor, barWidth, reduceMotion]);

  const onLayout = (e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width);

  return (
    <View
      style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityLabel={t('coloring.palette.label')}
      onLayout={onLayout}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {paletteColors.map((color, i) => (
          <Swatch
            key={color.hex}
            color={color}
            filled={colorFilled[i]}
            total={colorCounts[i]}
            selected={i === activeColor}
            label={swatchLabel(t, color.number, colorFilled[i], colorCounts[i])}
            onSelect={onSelect}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  content: { paddingHorizontal: spacing.lg, gap: SWATCH_GAP },
  swatchSlot: { alignItems: 'center', gap: spacing.sm, width: SWATCH_SIZE },
  ring: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: 3,
    padding: 3,
  },
  swatch: { flex: 1, borderRadius: SWATCH_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  swatchText: { fontWeight: '800' },
  track: { width: SWATCH_SIZE - spacing.sm, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
