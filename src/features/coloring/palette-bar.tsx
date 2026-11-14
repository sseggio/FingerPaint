import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { AppText, PressableScale } from '@/components/ui';
import type { Translate } from '@/features/i18n';
import { useLocale, useT } from '@/features/i18n';
import type { PaletteColor } from '@/lib/artwork/types';
import { readableTextOn } from '@/lib/color';
import { colorName } from '@/lib/color-name';
import { radius, spacing, useTheme } from '@/theme';

import { coloringFeedback } from './feedback';
import { SymbolIcon } from './symbol-icon';

/** Swatch diameter (points): a comfortable 44 pt+ touch target. */
export const SWATCH_SIZE = 52;
const SWATCH_GAP = spacing.md;
/** Symbol drawn inside a swatch (colorblind mode). */
const SYMBOL_SIZE = 22;

/**
 * Screen-reader label of one swatch: its number and its progress, plus its color name when
 * given (colorblind mode).
 */
export function swatchLabel(t: Translate, number: number, filled: number, total: number, name?: string): string {
  if (name) {
    if (filled >= total) return t('coloring.palette.colorNamedDone', { number, name });
    return t('coloring.palette.colorNamed', { number, name, filled, total });
  }
  if (filled >= total) return t('coloring.palette.colorDone', { number });
  return t('coloring.palette.color', { number, filled, total });
}

/**
 * Horizontal offset that centers swatch `index` in a bar `barWidth` points wide. With
 * `reversed` (left-handed mode) the swatches are laid out right to left: `count` is needed to
 * find the slot of `index`.
 */
export function swatchScrollOffset(index: number, barWidth: number, reversed = false, count = 0): number {
  const slot = reversed ? Math.max(0, count - 1 - index) : index;
  const center = spacing.lg + slot * (SWATCH_SIZE + SWATCH_GAP) + SWATCH_SIZE / 2;
  return Math.max(0, center - barWidth / 2);
}

interface SwatchProps {
  color: PaletteColor;
  filled: number;
  total: number;
  selected: boolean;
  label: string;
  /** Colorblind mode: the swatch shows its symbol. */
  showSymbol: boolean;
  onSelect(index: number): void;
}

const Swatch = memo(function Swatch({ color, filled, total, selected, label, showSymbol, onSelect }: SwatchProps) {
  const { colors } = useTheme();
  const done = filled >= total;
  const ratio = total > 0 ? Math.min(1, filled / total) : 1;
  const ink = readableTextOn(color.hex);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      // Selection haptic (setting-aware) instead of the generic press impact.
      haptic={false}
      onPress={() => {
        coloringFeedback.select();
        onSelect(color.number - 1);
      }}
      style={styles.swatchSlot}>
      <View
        style={[
          styles.ring,
          { borderColor: selected ? colors.ink : 'transparent' },
        ]}>
        <View style={[styles.swatch, { backgroundColor: color.hex, opacity: done && !selected ? 0.55 : 1 }]}>
          {showSymbol && !done ? (
            <SymbolIcon symbol={color.symbol} size={SYMBOL_SIZE} color={ink} />
          ) : (
            <AppText variant="label" color={ink} maxFontSizeMultiplier={1.3} style={styles.swatchText}>
              {done ? '✓' : String(color.number)}
            </AppText>
          )}
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
  /** Colorblind mode: symbols on the swatches and color names (shown and read). */
  colorblind?: boolean;
  /** Left-handed mode: swatches laid out from the right edge. */
  leftHanded?: boolean;
}

/**
 * Palette of the artwork: one swatch per color with its number, its progress and a check once
 * finished. The active swatch is ringed and kept in view (the session moves on to the next
 * color by itself when one is done).
 */
export function PaletteBar({
  colors: paletteColors,
  colorCounts,
  colorFilled,
  activeColor,
  onSelect,
  colorblind = false,
  leftHanded = false,
}: PaletteBarProps) {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const scroll = useRef<ScrollViewInstance>(null);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    if (barWidth <= 0) return;
    const x = swatchScrollOffset(activeColor, barWidth, leftHanded, paletteColors.length);
    scroll.current?.scrollTo({ x, animated: !reduceMotion });
  }, [activeColor, barWidth, reduceMotion, leftHanded, paletteColors.length]);

  const names = colorblind ? paletteColors.map((c) => colorName(c.hex, locale)) : null;
  const ordered = leftHanded ? [...paletteColors].reverse() : paletteColors;
  const active = paletteColors[activeColor];

  const onLayout = (e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width);

  return (
    <View
      style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityLabel={t('coloring.palette.label')}
      onLayout={onLayout}>
      {names && active ? (
        <View style={[styles.nameRow, leftHanded && styles.nameRowReversed]}>
          <SymbolIcon symbol={active.symbol} size={16} color={colors.ink} />
          <AppText variant="caption" importantForAccessibility="no" accessibilityElementsHidden>
            {t('coloring.palette.activeName', { number: active.number, name: names[activeColor] })}
          </AppText>
        </View>
      ) : null}
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.content, leftHanded && styles.contentReversed]}>
        {ordered.map((color) => {
          const i = color.number - 1;
          return (
            <Swatch
              key={color.hex}
              color={color}
              filled={colorFilled[i]}
              total={colorCounts[i]}
              selected={i === activeColor}
              label={swatchLabel(t, color.number, colorFilled[i], colorCounts[i], names?.[i])}
              showSymbol={colorblind}
              onSelect={onSelect}
            />
          );
        })}
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
  // Left-handed: short palettes hug the right edge.
  contentReversed: { flexGrow: 1, justifyContent: 'flex-end' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  nameRowReversed: { flexDirection: 'row-reverse' },
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
  track: { width: SWATCH_SIZE - spacing.sm, height: 4, borderRadius: radius.xs, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.xs },
});
