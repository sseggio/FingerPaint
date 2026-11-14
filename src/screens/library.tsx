import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, PressableScale } from '@/components/ui';
import { listAlbums, listArtworks } from '@/features/artwork/registry';
import { PERF_ARTWORK_ID } from '@/features/coloring/perf-artwork-id';
import { useT } from '@/features/i18n';
import { AlbumCard } from '@/features/library/album-card';
import { ArtworkTile } from '@/features/library/artwork-tile';
import { ContinueCard } from '@/features/library/continue-card';
import { FilterBar } from '@/features/library/filter-bar';
import { GRID_GAP, GRID_PADDING, gridLayout } from '@/features/library/grid';
import { useLibraryIndex } from '@/features/library/use-library-index';
import type { AlbumSource, ArtworkSource } from '@/lib/artwork/types';
import {
  albumProgress,
  chunk,
  continueList,
  filterArtworks,
  hasActiveFilters,
  NO_FILTERS,
  type AlbumProgress,
  type LibraryFilters,
} from '@/lib/library';
import { funAccents, radius, spacing, useTheme } from '@/theme';

type Item =
  | { kind: 'album'; key: string; album: AlbumSource; artworks: readonly ArtworkSource[]; progress: AlbumProgress; accent: string }
  | { kind: 'row'; key: string; artworks: ArtworkSource[] }
  | { kind: 'empty'; key: string };

const accentOf = (i: number) => funAccents[i % funAccents.length];

function openAlbum(albumId: string) {
  router.push({ pathname: '/album/[albumId]', params: { albumId } });
}

/** Row of colored squares under the title: the app's pixel signature. */
function PixelStrip() {
  return (
    <View style={styles.strip} accessible={false}>
      {funAccents.map((c, i) => (
        <View key={c} style={[styles.stripPixel, { backgroundColor: c, transform: [{ rotate: `${(i % 2 ? 1 : -1) * 6}deg` }] }]} />
      ))}
    </View>
  );
}

/** Home screen: greeting, "Continue" carousel, filters, album cards (or filtered artworks). */
export function LibraryScreen() {
  const t = useT();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { columns, tileWidth } = gridLayout(width);
  const index = useLibraryIndex();
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);
  // Static content: listed once.
  const albums = useMemo(() => listAlbums(), []);
  const artworks = useMemo(() => listArtworks(), []);
  const accentById = useMemo(() => {
    const map = new Map<string, string>();
    albums.forEach((a, i) => map.set(a.id, accentOf(i)));
    return map;
  }, [albums]);

  const continueItems = useMemo(() => continueList(artworks, index), [artworks, index]);
  const filtering = hasActiveFilters(filters);
  const filtered = useMemo(
    () => (filtering ? filterArtworks(artworks, index, filters) : []),
    [artworks, filtering, filters, index],
  );
  const totals = useMemo(() => {
    let done = 0;
    let inProgress = 0;
    for (const a of artworks) {
      const status = index[a.id]?.status;
      if (status === 'completed') done++;
      else if (status === 'in_progress') inProgress++;
    }
    return { done, inProgress };
  }, [artworks, index]);

  // Each album's artworks, computed once: a stable array per card keeps AlbumCard memoized.
  const artworksByAlbum = useMemo(() => {
    const map = new Map<string, ArtworkSource[]>();
    for (const album of albums) map.set(album.id, []);
    for (const a of artworks) map.get(a.album)?.push(a);
    return map;
  }, [albums, artworks]);

  const data = useMemo<Item[]>(() => {
    if (filtering) {
      if (filtered.length === 0) return [{ kind: 'empty', key: 'empty' }];
      return chunk(filtered, columns).map((row) => ({ kind: 'row', key: row.map((a) => a.id).join('|'), artworks: row }));
    }
    return albums
      .map((album, i) => {
        const albumArtworks = artworksByAlbum.get(album.id) ?? [];
        return {
          kind: 'album' as const,
          key: album.id,
          album,
          artworks: albumArtworks,
          progress: albumProgress(album.id, albumArtworks, index),
          accent: accentOf(i),
        };
      })
      // Albums without artworks yet (announced packs) are hidden until content ships.
      .filter((item) => item.artworks.length > 0);
  }, [albums, artworksByAlbum, columns, filtered, filtering, index]);

  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item }) => {
      if (item.kind === 'album') {
        return (
          <AlbumCard
            album={item.album}
            artworks={item.artworks}
            progress={item.progress}
            accent={item.accent}
            onPress={openAlbum}
          />
        );
      }
      if (item.kind === 'row') {
        return (
          <View style={styles.gridRow}>
            {item.artworks.map((a) => (
              <ArtworkTile
                key={a.id}
                artwork={a}
                progress={index[a.id]}
                width={tileWidth}
                accent={accentById.get(a.album) ?? colors.primary}
              />
            ))}
          </View>
        );
      }
      return (
        <View style={[styles.empty, { backgroundColor: colors.surfaceAlt }]}>
          <AppText tone="secondary" style={styles.center}>
            {t('library.noResults')}
          </AppText>
        </View>
      );
    },
    [accentById, colors.primary, colors.surfaceAlt, index, t, tileWidth],
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.hero}>
        <AppText variant="display" accessibilityRole="header">
          {t('library.title')}
        </AppText>
        <AppText variant="label" tone="primary">
          {t('library.greeting')}
        </AppText>
        <PixelStrip />
        <View style={[styles.stats, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="caption" tone="secondary">
            {t('library.artworkCount', { count: artworks.length })}
          </AppText>
          <AppText variant="caption">{t('library.stats', totals)}</AppText>
        </View>
      </View>

      {continueItems.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="heading" accessibilityRole="header">
            {t('library.continueTitle')}
          </AppText>
          <FlatList
            horizontal
            data={continueItems}
            keyExtractor={(a) => a.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
            style={styles.carouselBleed}
            renderItem={({ item: a }) => (
              <ContinueCard artwork={a} progress={index[a.id]} accent={accentById.get(a.album) ?? colors.primary} />
            )}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <FilterBar filters={filters} onChange={setFilters} />
      </View>

      <View style={styles.sectionTitle}>
        <AppText variant="heading" accessibilityRole="header">
          {filtering ? t('library.results', { count: filtered.length }) : t('library.albumsTitle')}
        </AppText>
        {filtering ? (
          <PressableScale accessibilityLabel={t('library.filters.clear')} onPress={() => setFilters(NO_FILTERS)} style={styles.clear}>
            <AppText variant="caption" tone="primary">
              {t('library.filters.clear')}
            </AppText>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );

  const footer = __DEV__ ? (
    <PressableScale
      accessibilityLabel={t('library.openArtwork', { title: t('library.devPerf') })}
      onPress={() => router.push({ pathname: '/color/[artworkId]', params: { artworkId: PERF_ARTWORK_ID } })}
      style={[styles.dev, { borderColor: colors.border }]}>
      <AppText variant="caption" tone="secondary">
        {t('library.devPerf')}
      </AppText>
    </PressableScale>
  ) : undefined;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        key={filtering ? `grid-${columns}` : 'albums'}
        data={data}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Separator}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: GRID_PADDING, paddingBottom: spacing.xxl * 3 },
  header: { gap: spacing.xl, marginBottom: spacing.lg },
  hero: { gap: spacing.sm, marginTop: spacing.sm },
  strip: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.xs },
  stripPixel: { width: 18, height: 18, borderRadius: radius.xs },
  stats: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  section: { gap: spacing.md },
  carousel: { gap: spacing.md, paddingHorizontal: GRID_PADDING, paddingVertical: spacing.sm },
  carouselBleed: { marginHorizontal: -GRID_PADDING },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  gridRow: { flexDirection: 'row', gap: GRID_GAP },
  separator: { height: GRID_GAP + spacing.xs },
  empty: { padding: spacing.xl, borderRadius: radius.md },
  center: { textAlign: 'center' },
  dev: { marginTop: spacing.xl, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center' },
});
