import { StyleSheet, View } from 'react-native';

import type { ArtworkSource } from '@/lib/artwork/types';
import type { ProgressLookup } from '@/lib/library';
import { radius, spacing, useTheme } from '@/theme';

import { ArtworkThumbnail } from './artwork-thumbnail';

export interface AlbumMosaicProps {
  artworks: readonly ArtworkSource[];
  index: ProgressLookup;
  size: number;
}

/** Up to 4 pieces: 1 fills the tile, 2 to 4 make a 2×2 grid. */
export const MOSAIC_PIECES = 4;

/**
 * Album meta-image: a mosaic of its artworks where each piece stays gray until that artwork
 * is completed. The full-color picture is revealed when the whole album is done.
 */
export function AlbumMosaic({ artworks, index, size }: AlbumMosaicProps) {
  const { colors } = useTheme();
  const pieces = artworks.slice(0, MOSAIC_PIECES);
  const inner = size - spacing.sm * 2;
  const piece = pieces.length <= 1 ? inner : (inner - spacing.xs) / 2;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size, backgroundColor: colors.surface }]}>
      <View style={styles.grid}>
        {pieces.map((a) => (
          <ArtworkThumbnail key={a.id} artworkId={a.id} size={piece} progress={index[a.id]} mode="reveal" />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, padding: spacing.sm },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignContent: 'center', justifyContent: 'center' },
});
