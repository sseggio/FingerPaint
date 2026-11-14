import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, PressableScale, ProgressBar } from '@/components/ui';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import type { AlbumSource, ArtworkSource } from '@/lib/artwork/types';
import { readableTextOn } from '@/lib/color';
import type { AlbumProgress, ProgressLookup } from '@/lib/library';
import { palette, radius, spacing, useTheme } from '@/theme';

import { AlbumMosaic } from './album-mosaic';

export interface AlbumCardProps {
  album: AlbumSource;
  artworks: readonly ArtworkSource[];
  progress: AlbumProgress;
  index: ProgressLookup;
  accent: string;
  onPress: (albumId: string) => void;
}

const MOSAIC_SIZE = 104;

/** Big colorful album card: meta-image mosaic, title, `x/y` progress. */
export const AlbumCard = memo(function AlbumCard({ album, artworks, progress, index, accent, onPress }: AlbumCardProps) {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const ink = readableTextOn(accent);
  const title = localizedTitle(album.title, locale);
  const { completed, total, complete } = progress;
  const label = complete
    ? t('library.albumLabelComplete', { title, total })
    : t('library.albumLabel', { title, done: completed, total });

  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={() => onPress(album.id)}
      style={[styles.card, { backgroundColor: accent, shadowColor: accent }]}>
      {/* Pixel confetti in the corner: pure decoration. */}
      <View style={styles.pixels} pointerEvents="none">
        <View style={[styles.pixel, { backgroundColor: colors.surface }]} />
        <View style={[styles.pixel, styles.pixelOffset, { backgroundColor: ink }]} />
        <View style={[styles.pixel, { backgroundColor: colors.surface }]} />
      </View>
      <AlbumMosaic artworks={artworks} index={index} size={MOSAIC_SIZE} />
      <View style={styles.body}>
        <View style={styles.badges}>
          {album.pack ? <Badge label={t('library.badge.pack')} color={colors.surface} /> : null}
          {complete ? <Badge label={t('library.albumComplete')} color={palette.sun} /> : null}
        </View>
        <AppText variant="heading" color={ink} numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="title" color={ink}>
          {t('library.albumProgress', { done: completed, total })}
        </AppText>
        <ProgressBar
          value={total > 0 ? completed / total : 0}
          color={ink}
          trackColor={colors.surface}
          height={8}
          style={styles.bar}
        />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  body: { flex: 1, gap: spacing.xs },
  badges: { flexDirection: 'row', gap: spacing.xs, minHeight: 0 },
  bar: { marginTop: spacing.xs, opacity: 0.9 },
  pixels: { position: 'absolute', top: spacing.md, right: spacing.md, flexDirection: 'row', gap: spacing.xs, opacity: 0.5 },
  pixel: { width: 8, height: 8, borderRadius: 2 },
  pixelOffset: { marginTop: spacing.sm },
});
