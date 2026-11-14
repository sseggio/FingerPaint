import { StyleSheet, View } from 'react-native';

import type { ArtworkSource } from '@/lib/artwork/types';
import type { ProgressEntry } from '@/lib/library';
import { radius, spacing, useTheme } from '@/theme';

import { ArtworkThumbnail } from './artwork-thumbnail';

export interface AlbumMosaicProps {
  artworks: readonly ArtworkSource[];
  /** True once every artwork of the album is completed: the mosaic turns to full color. */
  revealed: boolean;
  size: number;
}

/** Up to 4 pieces: 1 fills the tile, 2 to 4 make a 2×2 grid. */
export const MOSAIC_PIECES = 4;

/** Stable entry that makes a `reveal` thumbnail draw in full color. */
const REVEALED: ProgressEntry = Object.freeze({ status: 'completed', filledCount: 0, updatedAt: 0 });

/**
 * Album meta-image: a mosaic of its first artworks, gray until the whole album is completed,
 * then revealed in full color. The pieces never reflect individual artworks (only 4 of the
 * album's artworks are shown, so completing one of them must not look like progress).
 */
export function AlbumMosaic({ artworks, revealed, size }: AlbumMosaicProps) {
  const { colors } = useTheme();
  const pieces = artworks.slice(0, MOSAIC_PIECES);
  const inner = size - spacing.sm * 2;
  const piece = pieces.length <= 1 ? inner : (inner - spacing.xs) / 2;
  const progress = revealed ? REVEALED : undefined;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size, backgroundColor: colors.surface }]}>
      <View style={styles.grid}>
        {pieces.map((a) => (
          <ArtworkThumbnail key={a.id} artworkId={a.id} size={piece} progress={progress} mode="reveal" />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, padding: spacing.sm },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignContent: 'center', justifyContent: 'center' },
});
