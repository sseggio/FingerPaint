import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type ListRenderItem } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, SegmentedControl, Toast } from '@/components/ui';
import { listAlbums, listArtworks } from '@/features/artwork/registry';
import { ArtworkSheet } from '@/features/gallery/artwork-sheet';
import { exportArtworkPng, type PngAction } from '@/features/gallery/export-artwork';
import { GalleryEmpty } from '@/features/gallery/gallery-empty';
import { GalleryTile } from '@/features/gallery/gallery-tile';
import { useT } from '@/features/i18n';
import { GRID_GAP, GRID_PADDING, gridLayout } from '@/features/library/grid';
import { openArtwork } from '@/features/library/open-artwork';
import { useLibraryIndex } from '@/features/library/use-library-index';
import type { ArtworkSource } from '@/lib/artwork/types';
import { chunk, galleryList, type GallerySegment } from '@/lib/library';
import { funAccents, palette, spacing, useTheme } from '@/theme';

type Row = { key: string; artworks: ArtworkSource[] };
type Notice = { message: string; accent: string };

/** "My artworks" tab: finished / in-progress artworks, newest first, with export and share. */
export function GalleryScreen() {
  const t = useT();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { columns, tileWidth } = gridLayout(width);
  const index = useLibraryIndex();
  const [segment, setSegment] = useState<GallerySegment>('completed');
  const [selected, setSelected] = useState<ArtworkSource | null>(null);
  const [busy, setBusy] = useState<PngAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const artworks = useMemo(() => listArtworks(), []);
  const accentById = useMemo(() => {
    const map = new Map<string, string>();
    listAlbums().forEach((a, i) => map.set(a.id, funAccents[i % funAccents.length]));
    return map;
  }, []);
  const completed = useMemo(() => galleryList(artworks, index, 'completed'), [artworks, index]);
  const inProgress = useMemo(() => galleryList(artworks, index, 'in_progress'), [artworks, index]);
  const items = segment === 'completed' ? completed : inProgress;
  const rows = useMemo<Row[]>(
    () => chunk(items, columns).map((row) => ({ key: row.map((a) => a.id).join('|'), artworks: row })),
    [columns, items],
  );

  const close = useCallback(() => {
    if (busy === null) setSelected(null);
  }, [busy]);

  const onContinue = useCallback((artwork: ArtworkSource) => {
    setSelected(null);
    openArtwork(artwork);
  }, []);

  const onPng = useCallback(
    async (artwork: ArtworkSource, action: PngAction, background: string | null) => {
      setBusy(action);
      try {
        const outcome = await exportArtworkPng(
          artwork.id,
          index[artwork.id],
          background,
          action,
          action === 'export' ? t('gallery.export.dialog') : t('gallery.share.dialog'),
        );
        if (outcome === 'unavailable') setNotice({ message: t('gallery.export.unavailable'), accent: palette.sun });
        else if (outcome === 'missing') setNotice({ message: t('gallery.export.failed'), accent: palette.orange });
        else if (action === 'export') setNotice({ message: t('gallery.export.done'), accent: palette.mint });
      } catch {
        setNotice({ message: t('gallery.export.failed'), accent: palette.orange });
      } finally {
        setBusy(null);
        // Close the sheet so the result message (drawn on the screen) is visible.
        setSelected(null);
      }
    },
    [index, t],
  );

  const renderRow = useCallback<ListRenderItem<Row>>(
    ({ item }) => (
      <View style={styles.row}>
        {item.artworks.map((a) => {
          const progress = index[a.id];
          if (!progress) return null;
          return (
            <GalleryTile
              key={a.id}
              artwork={a}
              progress={progress}
              width={tileWidth}
              accent={accentById.get(a.album) ?? colors.primary}
              onPress={setSelected}
            />
          );
        })}
      </View>
    ),
    [accentById, colors.primary, index, tileWidth],
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.hero}>
        <AppText variant="display" accessibilityRole="header">
          {t('gallery.title')}
        </AppText>
        <AppText tone="secondary">{t('gallery.subtitle')}</AppText>
      </View>
      <SegmentedControl<GallerySegment>
        accessibilityLabel={t('gallery.segments')}
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'completed', label: t('gallery.segment.completed', { count: completed.length }) },
          { value: 'in_progress', label: t('gallery.segment.inProgress', { count: inProgress.length }) },
        ]}
      />
      {items.length > 0 ? (
        <AppText variant="caption" tone="secondary">
          {t('gallery.sortHint')}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        key={`gallery-${columns}`}
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={<GalleryEmpty segment={segment} onBrowse={() => router.navigate('/')} />}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Separator}
        initialNumToRender={4}
        windowSize={7}
      />
      <ArtworkSheet
        artwork={selected}
        progress={selected ? index[selected.id] : undefined}
        busy={busy}
        onClose={close}
        onContinue={onContinue}
        onPng={(artwork, action, background) => {
          void onPng(artwork, action, background);
        }}
      />
      {notice ? (
        <View style={styles.toast} pointerEvents="box-none">
          <Toast message={notice.message} accent={notice.accent} durationMs={2500} onTimeout={() => setNotice(null)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: GRID_PADDING, paddingBottom: spacing.xxl * 3 },
  header: { gap: spacing.lg, marginBottom: spacing.lg },
  hero: { gap: spacing.xs, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: GRID_GAP },
  separator: { height: GRID_GAP + spacing.xs },
  toast: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xl },
});
