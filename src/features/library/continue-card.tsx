import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale, ProgressBar } from '@/components/ui';
import { getArtwork } from '@/features/artwork/registry';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import type { ArtworkSource } from '@/lib/artwork/types';
import { percentFilled, type ProgressEntry } from '@/lib/library';
import { radius, spacing, useTheme } from '@/theme';

import { ArtworkThumbnail } from './artwork-thumbnail';
import { openArtwork } from './open-artwork';

export const CONTINUE_CARD_WIDTH = 148;

export interface ContinueCardProps {
  artwork: ArtworkSource;
  progress: ProgressEntry | undefined;
  accent: string;
}

/** "Continue" carousel card: current state, title and how far along it is. */
export const ContinueCard = memo(function ContinueCard({ artwork, progress, accent }: ContinueCardProps) {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const title = localizedTitle(artwork.title, locale);
  const percent = percentFilled(progress?.filledCount ?? 0, getArtwork(artwork.id)?.totalCells ?? 0);
  const thumb = CONTINUE_CARD_WIDTH - spacing.md * 2 - spacing.sm * 2;

  return (
    <PressableScale
      accessibilityLabel={t('library.continueLabel', { title, percent })}
      onPress={() => openArtwork(artwork)}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: accent, shadowColor: accent }]}>
      <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
        <ArtworkThumbnail artworkId={artwork.id} size={thumb} progress={progress} />
      </View>
      <AppText variant="label" numberOfLines={1}>
        {title}
      </AppText>
      <View style={styles.row}>
        <ProgressBar value={percent / 100} color={accent} trackColor={colors.surfaceAlt} style={styles.bar} />
        <AppText variant="caption" tone="secondary">
          {t('library.tile.percent', { percent })}
        </AppText>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    width: CONTINUE_CARD_WIDTH,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  thumb: { borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bar: { flex: 1, alignSelf: 'center' },
});
