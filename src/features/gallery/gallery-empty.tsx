import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { useT } from '@/features/i18n';
import type { GallerySegment } from '@/lib/library';
import { funAccents, palette, radius, sizes, spacing, useTheme } from '@/theme';

/** 7×6 pixel easel with a little painting (0 empty, 1 wood, 2..7 canvas colors). */
const EASEL = [
  [0, 1, 1, 1, 1, 1, 0],
  [0, 1, 2, 3, 4, 1, 0],
  [0, 1, 5, 6, 7, 1, 0],
  [0, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 0, 1, 0, 0],
  [0, 1, 0, 0, 0, 1, 0],
] as const;
const EASEL_PIXEL = sizes.iconPixel * 3;

function PixelEasel({ blank }: { blank: boolean }) {
  const { colors } = useTheme();
  const colorOf = (cell: number) => {
    if (cell === 0) return undefined;
    if (cell === 1) return palette.orange;
    return blank ? colors.surface : funAccents[(cell - 2) % funAccents.length];
  };
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      {EASEL.map((row, y) => (
        <View key={y} style={styles.row}>
          {row.map((cell, x) => (
            <View key={x} style={[styles.pixel, { backgroundColor: colorOf(cell) }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

export interface GalleryEmptyProps {
  segment: GallerySegment;
  onBrowse(): void;
}

/** Friendly empty state: a pixel easel and a way back to the Library. */
export function GalleryEmpty({ segment, onBrowse }: GalleryEmptyProps) {
  const t = useT();
  const { colors } = useTheme();
  const completed = segment === 'completed';
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: palette.sun, shadowColor: palette.orange }]}>
      <PixelEasel blank={!completed} />
      <AppText variant="heading" style={styles.center} accessibilityRole="header">
        {completed ? t('gallery.empty.completed.title') : t('gallery.empty.inProgress.title')}
      </AppText>
      <AppText tone="secondary" style={styles.center}>
        {completed ? t('gallery.empty.completed.body') : t('gallery.empty.inProgress.body')}
      </AppText>
      <Button label={t('gallery.empty.cta')} onPress={onBrowse} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderStyle: 'dashed',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  row: { flexDirection: 'row' },
  pixel: { width: EASEL_PIXEL, height: EASEL_PIXEL },
  center: { textAlign: 'center' },
});
