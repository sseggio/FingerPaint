import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, PressableScale, ProgressBar } from '@/components/ui';
import { getArtwork } from '@/features/artwork/registry';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import type { ArtworkSource } from '@/lib/artwork/types';
import { artworkStatus, percentFilled, type ProgressEntry } from '@/lib/library';
import { palette, radius, spacing, useTheme } from '@/theme';

import { AccessBadge, useLockReason } from './access-badge';
import { ArtworkThumbnail } from './artwork-thumbnail';
import { openArtwork } from './open-artwork';

export interface ArtworkTileProps {
  artwork: ArtworkSource;
  progress?: ProgressEntry;
  /** Outer width of the tile. */
  width: number;
  accent: string;
}

/** Grid tile: thumbnail of the current state, title, progress, Pro/Pack badge. */
export const ArtworkTile = memo(function ArtworkTile({ artwork, progress, width, accent }: ArtworkTileProps) {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const reason = useLockReason(artwork.access);
  const title = localizedTitle(artwork.title, locale);
  const status = artworkStatus(artwork.id, progress ? { [artwork.id]: progress } : {});
  const percent = status === 'completed' ? 100 : percentFilled(progress?.filledCount ?? 0, getArtwork(artwork.id)?.totalCells ?? 0);
  const thumb = width - spacing.sm * 4;

  const state =
    status === 'completed'
      ? t('library.tileState.done')
      : status === 'in_progress'
        ? t('library.tileState.percent', { percent })
        : t('library.tileState.new');
  const label = reason
    ? t('library.lockedLabel', {
        title,
        kind: reason === 'pro' ? t('library.badge.proLong') : t('library.badge.packLong'),
      })
    : t('library.tileLabel', { title, state });

  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={() => openArtwork(artwork)}
      style={[styles.tile, { width, backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}>
        <ArtworkThumbnail artworkId={artwork.id} size={thumb} progress={progress} />
        <View style={styles.badges} pointerEvents="none">
          {reason ? <AccessBadge reason={reason} /> : <View />}
          {status === 'completed' ? <Badge label="✓" color={palette.mint} /> : null}
        </View>
      </View>
      <AppText variant="caption" numberOfLines={1}>
        {title}
      </AppText>
      {status === 'in_progress' ? (
        <ProgressBar value={percent / 100} color={accent} trackColor={colors.surfaceAlt} />
      ) : (
        <AppText variant="caption" tone="secondary" numberOfLines={1}>
          {status === 'completed' ? t('library.tile.done') : t('library.tile.new')}
        </AppText>
      )}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: {
    padding: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  thumb: {
    borderRadius: radius.sm,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    right: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
