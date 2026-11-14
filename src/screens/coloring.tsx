import { router, Stack } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { listArtworks } from '@/features/artwork/registry';
import { PixelCanvas } from '@/features/coloring/canvas/pixel-canvas';
import { CompletionCard } from '@/features/coloring/completion-card';
import { Confetti } from '@/features/coloring/confetti';
import { nextArtworkId } from '@/features/coloring/next-artwork';
import { PaletteBar } from '@/features/coloring/palette-bar';
import { resolveColoringArtwork } from '@/features/coloring/resolve-artwork';
import { useColoringSession } from '@/features/coloring/use-coloring-session';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import { useProgressStore } from '@/features/progress/progress-store';
import { useSettingsStore } from '@/features/settings/settings-store';
import type { Artwork } from '@/lib/artwork/types';
import { spacing, useTheme } from '@/theme';

function NotFound() {
  const t = useT();
  return (
    <View style={styles.center}>
      <Stack.Screen options={{ title: t('coloring.notFound.title') }} />
      <Card style={styles.card}>
        <AppText variant="heading" accessibilityRole="header">
          {t('coloring.notFound.title')}
        </AppText>
        <AppText tone="secondary">{t('coloring.notFound.body')}</AppText>
        <Button label={t('coloring.notFound.back')} onPress={goToLibrary} />
      </Card>
    </View>
  );
}

function goToLibrary() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function ColoringView({ artwork }: { artwork: Artwork }) {
  const locale = useLocale();
  const t = useT();
  const { colors } = useTheme();
  const largeNumbers = useSettingsStore((s) => s.settings.largeNumbers);
  const dragToFill = useSettingsStore((s) => s.settings.dragToFill);
  const progressIndex = useProgressStore((s) => s.index);
  const title = localizedTitle(artwork.title, locale);
  const { session, revision, activeColor, completion, selectColor, fill } = useColoringSession(artwork);

  const nextId = useMemo(
    () => (completion === 'none' ? null : nextArtworkId(artwork.id, listArtworks().map((a) => a.id), progressIndex)),
    [artwork.id, completion, progressIndex],
  );
  const onNext = useCallback(() => {
    if (nextId) router.replace({ pathname: '/color/[artworkId]', params: { artworkId: nextId } });
  }, [nextId]);

  if (!session) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.primaryText} accessibilityLabel={t('coloring.loading')} />
      </View>
    );
  }

  const coloring = completion === 'none';
  const percent = artwork.totalCells > 0 ? Math.floor((session.filledCount / artwork.totalCells) * 100) : 100;
  const label = coloring
    ? t('coloring.canvasLabelFill', { title, percent, number: activeColor + 1 })
    : t('coloring.canvasLabel', { title });

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.root}>
      <Stack.Screen options={{ title }} />
      <View style={styles.root}>
        <PixelCanvas
          artwork={artwork}
          colorPixels={session.colorPixels}
          colorRevision={revision}
          largeNumbers={largeNumbers}
          activeColor={coloring ? activeColor : null}
          onFill={coloring ? fill : undefined}
          dragToFill={dragToFill}
          accessibilityLabel={label}
        />
        {completion === 'celebrate' ? <Confetti /> : null}
      </View>
      {coloring ? (
        <PaletteBar
          colors={artwork.palette.colors}
          colorCounts={artwork.colorCounts}
          colorFilled={session.colorFilled}
          revision={revision}
          activeColor={activeColor}
          onSelect={selectColor}
        />
      ) : (
        <CompletionCard
          title={title}
          justFinished={completion === 'celebrate'}
          onNext={nextId ? onNext : null}
          onLibrary={goToLibrary}
        />
      )}
    </SafeAreaView>
  );
}

/** Full-screen coloring: canvas, palette, autosave and the completion screen. */
export function ColoringScreen({ artworkId }: { artworkId: unknown }) {
  const { colors } = useTheme();
  const artwork = resolveColoringArtwork(artworkId);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {artwork ? <ColoringView key={artwork.id} artwork={artwork} /> : <NotFound />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: { gap: spacing.md },
});
