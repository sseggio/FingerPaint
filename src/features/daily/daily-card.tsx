import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale } from '@/components/ui';
import { getArtwork } from '@/features/artwork/registry';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import { ArtworkThumbnail } from '@/features/library/artwork-thumbnail';
import { openArtwork } from '@/features/library/open-artwork';
import type { ArtworkSource } from '@/lib/artwork/types';
import { JOKERS_PER_WEEK, type StreakView } from '@/lib/daily';
import { percentFilled, type ProgressEntry } from '@/lib/library';
import { palette, radius, spacing, useTheme } from '@/theme';

export const DAILY_THUMB_SIZE = 104;

/** 5×6 pixel flame (0 empty, 1 outer, 2 inner): the streak icon, in the app's pixel style. */
const FLAME = [
  [0, 0, 1, 0, 0],
  [0, 1, 1, 0, 0],
  [0, 1, 1, 1, 0],
  [1, 1, 2, 1, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 2, 1, 0],
] as const;
const FLAME_PIXEL = 4;

/** Decorative pixel flame; dimmed when the streak has not started (or restarts). */
export const PixelFlame = memo(function PixelFlame({ lit }: { lit: boolean }) {
  const { colors } = useTheme();
  const outer = lit ? palette.orange : colors.border;
  const inner = lit ? palette.sun : colors.surfaceAlt;
  return (
    <View style={styles.flame} accessible={false} importantForAccessibility="no-hide-descendants">
      {FLAME.map((row, y) => (
        <View key={y} style={styles.flameRow}>
          {row.map((cell, x) => (
            <View
              key={x}
              style={[styles.flamePixel, cell === 0 ? null : { backgroundColor: cell === 1 ? outer : inner }]}
            />
          ))}
        </View>
      ))}
    </View>
  );
});

export interface DailyCardProps {
  artwork: ArtworkSource;
  progress: ProgressEntry | undefined;
  streak: StreakView;
}

/** "Artwork of the day" card at the top of the Library: thumbnail, streak, jokers left. */
export const DailyCard = memo(function DailyCard({ artwork, progress, streak }: DailyCardProps) {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const title = localizedTitle(artwork.title, locale);
  const percent = percentFilled(progress?.filledCount ?? 0, getArtwork(artwork.id)?.totalCells ?? 0);
  const done = progress?.status === 'completed';

  const state = done
    ? t('daily.done')
    : percent > 0
      ? t('daily.inProgress', { percent })
      : t('daily.new');
  const streakText =
    streak.streak > 0
      ? t('daily.streak', { count: streak.streak })
      : streak.restart
        ? t('daily.restart')
        : t('daily.streakStart');
  const jokersText = t('daily.jokers', { count: streak.jokersLeft });

  return (
    <PressableScale
      accessibilityLabel={t('daily.cardLabel', { title, state, streak: streakText, jokers: jokersText })}
      accessibilityHint={t('daily.jokersHint')}
      onPress={() => openArtwork(artwork)}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: palette.sun, shadowColor: palette.orange }]}>
      <View style={styles.top}>
        <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
          <ArtworkThumbnail artworkId={artwork.id} size={DAILY_THUMB_SIZE - spacing.sm * 2} progress={progress} />
        </View>
        <View style={styles.info}>
          <AppText variant="caption" tone="primary" style={styles.overline}>
            {t('daily.title')}
          </AppText>
          <AppText variant="heading" numberOfLines={2}>
            {title}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {state}
          </AppText>
          {done ? null : (
            <View style={[styles.cta, { backgroundColor: colors.primary }]}>
              <AppText variant="label" color={colors.onPrimary}>
                {t('daily.cta')}
              </AppText>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.footer, { backgroundColor: colors.surfaceAlt }]}>
        <View style={styles.streak}>
          <PixelFlame lit={streak.streak > 0} />
          <AppText variant="label" style={styles.shrink}>
            {streakText}
          </AppText>
        </View>
        <View style={styles.jokers}>
          {Array.from({ length: JOKERS_PER_WEEK }, (_, i) => (
            <View
              key={i}
              style={[
                styles.joker,
                { borderColor: palette.violet },
                i < streak.jokersLeft ? { backgroundColor: palette.violet } : null,
              ]}
            />
          ))}
          <AppText variant="caption" tone="secondary" style={styles.shrink}>
            {jokersText}
          </AppText>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 3,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: {
    width: DAILY_THUMB_SIZE,
    height: DAILY_THUMB_SIZE,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: spacing.xs },
  overline: { textTransform: 'uppercase', letterSpacing: 1, fontWeight: '900' },
  cta: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  streak: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  jokers: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  joker: { width: 12, height: 12, borderRadius: radius.xs, borderWidth: 2 },
  shrink: { flexShrink: 1 },
  flame: { gap: 0 },
  flameRow: { flexDirection: 'row' },
  flamePixel: { width: FLAME_PIXEL, height: FLAME_PIXEL },
});
