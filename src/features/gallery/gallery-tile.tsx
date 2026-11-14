import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, PressableScale, ProgressBar } from '@/components/ui';
import { getArtwork } from '@/features/artwork/registry';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import { ArtworkThumbnail } from '@/features/library/artwork-thumbnail';
import type { ArtworkSource } from '@/lib/artwork/types';
import { galleryDate, percentFilled, type ProgressEntry } from '@/lib/library';
import { palette, radius, spacing, useTheme } from '@/theme';

import { useFormatDate } from './format-date';

export interface GalleryTileProps {
  artwork: ArtworkSource;
  progress: ProgressEntry;
  width: number;
  accent: string;
  onPress(artwork: ArtworkSource): void;
}

/** "My artworks" tile: current state, title, date (and progress for unfinished ones). */
export const GalleryTile = memo(function GalleryTile({ artwork, progress, width, accent, onPress }: GalleryTileProps) {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const formatDate = useFormatDate();
  const title = localizedTitle(artwork.title, locale);
  const done = progress.status === 'completed';
  const percent = done ? 100 : percentFilled(progress.filledCount, getArtwork(artwork.id)?.totalCells ?? 0);
  const date = formatDate(galleryDate(progress));
  const state = done ? t('gallery.state.completed', { date }) : t('gallery.state.inProgress', { percent, date });
  const thumb = width - spacing.sm * 4;
  return (
    <PressableScale
      accessibilityLabel={t('gallery.tileLabel', { title, state })}
      onPress={() => onPress(artwork)}
      style={[
        styles.tile,
        { width, backgroundColor: colors.surface, borderColor: done ? accent : colors.border, shadowColor: accent },
      ]}>
      <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
        <ArtworkThumbnail artworkId={artwork.id} size={thumb} progress={progress} />
        {done ? (
          <View style={styles.badge} pointerEvents="none">
            <Badge label="✓" color={palette.mint} />
          </View>
        ) : null}
      </View>
      <AppText variant="caption" numberOfLines={1}>
        {title}
      </AppText>
      {done ? null : <ProgressBar value={percent / 100} color={accent} trackColor={colors.surfaceAlt} />}
      <AppText variant="caption" tone="secondary" numberOfLines={1}>
        {done ? t('gallery.caption.completed', { date }) : t('gallery.caption.inProgress', { percent, date })}
      </AppText>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: {
    padding: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 2,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  thumb: { borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: spacing.xs, right: spacing.xs },
});
