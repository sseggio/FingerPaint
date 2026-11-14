import { router, Stack } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type ListRenderItem } from 'react-native';

import { AppText, Badge, Button, Card, ProgressBar } from '@/components/ui';
import { getRegistry } from '@/features/artwork/registry';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import { AlbumMosaic } from '@/features/library/album-mosaic';
import { ArtworkTile } from '@/features/library/artwork-tile';
import { GRID_GAP, GRID_PADDING, gridLayout } from '@/features/library/grid';
import { useLibraryIndex } from '@/features/library/use-library-index';
import type { AlbumSource, ArtworkSource } from '@/lib/artwork/types';
import { readableTextOn } from '@/lib/color';
import { parseContentIdParam } from '@/lib/content-id';
import { albumProgress, chunk } from '@/lib/library';
import { funAccents, palette, radius, spacing, useTheme } from '@/theme';

const MOSAIC_SIZE = 132;

function goToLibrary() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function NotFound() {
  const t = useT();
  return (
    <View style={styles.center}>
      <Stack.Screen options={{ title: t('album.notFound.title') }} />
      <Card style={styles.card}>
        <AppText variant="heading" accessibilityRole="header">
          {t('album.notFound.title')}
        </AppText>
        <AppText tone="secondary">{t('album.notFound.body')}</AppText>
        <Button label={t('album.notFound.back')} onPress={goToLibrary} />
      </Card>
    </View>
  );
}

function AlbumView({ album, accent }: { album: AlbumSource; accent: string }) {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { columns, tileWidth } = gridLayout(width);
  const index = useLibraryIndex();
  const artworks = useMemo(() => getRegistry().listByAlbum(album.id), [album.id]);
  const rows = useMemo(() => chunk(artworks, columns), [artworks, columns]);
  const progress = albumProgress(album.id, artworks, index);
  const title = localizedTitle(album.title, locale);
  const ink = readableTextOn(accent);

  const renderRow = useCallback<ListRenderItem<ArtworkSource[]>>(
    ({ item }) => (
      <View style={styles.row}>
        {item.map((a) => (
          <ArtworkTile key={a.id} artwork={a} progress={index[a.id]} width={tileWidth} accent={accent} />
        ))}
      </View>
    ),
    [accent, index, tileWidth],
  );

  const header = (
    <View style={[styles.banner, { backgroundColor: accent, shadowColor: accent }]}>
      <View accessible accessibilityLabel={t('album.metaLabel')}>
        <AlbumMosaic artworks={artworks} revealed={progress.complete} size={MOSAIC_SIZE} />
      </View>
      <View
        style={styles.bannerText}
        accessible
        accessibilityLabel={
          progress.complete
            ? t('library.albumLabelComplete', { title, total: progress.total })
            : t('library.albumLabel', { title, done: progress.completed, total: progress.total })
        }>
        {progress.complete ? <Badge label={t('library.albumComplete')} color={palette.sun} /> : null}
        <AppText variant="title" color={ink} accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="heading" color={ink}>
          {t('library.albumProgress', { done: progress.completed, total: progress.total })}
        </AppText>
        <ProgressBar
          value={progress.total > 0 ? progress.completed / progress.total : 0}
          color={ink}
          trackColor={colors.surface}
          height={8}
        />
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        key={`cols-${columns}`}
        data={rows}
        keyExtractor={(row) => row.map((a) => a.id).join('|')}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <AppText tone="secondary" style={styles.emptyText}>
            {t('album.empty')}
          </AppText>
        }
        ItemSeparatorComponent={Separator}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews
      />
    </>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/** One album: meta-image banner and the grid of its artworks. */
export function AlbumScreen({ albumId }: { albumId: unknown }) {
  const { colors } = useTheme();
  const id = parseContentIdParam(albumId);
  const registry = getRegistry();
  const albums = registry.listAlbums();
  const position = id ? albums.findIndex((a) => a.id === id) : -1;
  const album = position >= 0 ? albums[position] : undefined;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {album ? (
        <AlbumView key={album.id} album={album} accent={funAccents[position % funAccents.length]} />
      ) : (
        <NotFound />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: { gap: spacing.md },
  content: { padding: GRID_PADDING, paddingBottom: spacing.xxl * 3 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.xl,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  bannerText: { flex: 1, gap: spacing.xs },
  row: { flexDirection: 'row', gap: GRID_GAP },
  separator: { height: GRID_GAP + spacing.xs },
  emptyText: { textAlign: 'center', padding: spacing.xl },
});
