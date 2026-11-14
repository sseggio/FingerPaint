import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, PressableScale, Screen } from '@/components/ui';
import { listArtworks } from '@/features/artwork/registry';
import { PERF_ARTWORK_ID } from '@/features/coloring/canvas/__fixtures__/perf-artwork';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import { funAccents, radius, spacing, useTheme } from '@/theme';

interface RowProps {
  id: string;
  title: string;
  meta: string;
  accent: string;
  accessibilityLabel: string;
}

function ArtworkRow({ id, title, meta, accent, accessibilityLabel }: RowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      onPress={() => router.push({ pathname: '/color/[artworkId]', params: { artworkId: id } })}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.swatch, { backgroundColor: accent }]} />
      <View style={styles.rowText}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" tone="secondary">
          {meta}
        </AppText>
      </View>
    </PressableScale>
  );
}

/** Temporary library: a plain list of the bundled artworks (the real library comes with F08). */
export function LibraryScreen() {
  const t = useT();
  const locale = useLocale();
  // The registry is static content: list it once.
  const artworks = useMemo(() => listArtworks(), []);

  return (
    <Screen title={t('library.title')} subtitle={t('library.subtitle')}>
      <Card style={styles.card}>
        <AppText variant="heading" accessibilityRole="header">
          {t('library.artworksTitle')}
        </AppText>
        <AppText tone="secondary">{t('library.artworkCount', { count: artworks.length })}</AppText>
      </Card>
      <View style={styles.list}>
        {artworks.map((a, i) => {
          const title = localizedTitle(a.title, locale);
          return (
            <ArtworkRow
              key={a.id}
              id={a.id}
              title={title}
              meta={t('library.artworkMeta', { size: `${a.w}×${a.h}`, count: a.palette.length })}
              accent={funAccents[i % funAccents.length]}
              accessibilityLabel={t('library.openArtwork', { title })}
            />
          );
        })}
        {__DEV__ ? (
          <ArtworkRow
            id={PERF_ARTWORK_ID}
            title={t('library.devPerf')}
            meta="128×128"
            accent={funAccents[artworks.length % funAccents.length]}
            accessibilityLabel={t('library.openArtwork', { title: t('library.devPerf') })}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  list: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatch: { width: 40, height: 40, borderRadius: radius.sm },
  rowText: { flex: 1, gap: spacing.xs },
});
