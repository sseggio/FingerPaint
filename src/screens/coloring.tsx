import { Redirect, router, Stack } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, Toast } from '@/components/ui';
import { listArtworks } from '@/features/artwork/registry';
import { lockReason } from '@/features/entitlements/can-access';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { PixelCanvas, type PixelCanvasHandle } from '@/features/coloring/canvas/pixel-canvas';
import { CompletionCard } from '@/features/coloring/completion-card';
import { Confetti } from '@/features/coloring/confetti';
import { nextArtworkId } from '@/features/coloring/next-artwork';
import { PaletteBar } from '@/features/coloring/palette-bar';
import { resolveColoringArtwork } from '@/features/coloring/resolve-artwork';
import { useColoringSession } from '@/features/coloring/use-coloring-session';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import { useProgressStore, type ProgressState } from '@/features/progress/progress-store';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useBreakReminder } from '@/features/wellbeing/break-reminder';
import type { Artwork } from '@/lib/artwork/types';
import { findNearestUnfilledCell } from '@/lib/hints';
import { palette, spacing, useTheme } from '@/theme';

/** How long the "Find" messages stay on screen. */
const HINT_TOAST_MS = 2500;
/** The break reminder fades by itself after a while if left alone. */
const BREAK_TOAST_MS = 20_000;

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
  const reduceMotion = useReducedMotion();
  const largeNumbers = useSettingsStore((s) => s.settings.largeNumbers);
  const dragToFill = useSettingsStore((s) => s.settings.dragToFill);
  const colorblind = useSettingsStore((s) => s.settings.colorblindSymbols);
  const highContrast = useSettingsStore((s) => s.settings.highContrast);
  const leftHanded = useSettingsStore((s) => s.settings.leftHanded);
  const title = localizedTitle(artwork.title, locale);
  const { session, revision, activeColor, completion, selectColor, fill } = useColoringSession(artwork);
  const canvas = useRef<PixelCanvasHandle>(null);
  const [hint, setHint] = useState<string | null>(null);
  const breakReminder = useBreakReminder(completion === 'none');

  // Only the next artwork id is derived from the progress index: the screen re-renders when that
  // id changes, not on every save of the index.
  // While coloring, the selector returns null without reading the index at all.
  // "Next" never offers a locked artwork.
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  const orderedIds = useMemo(
    () => listArtworks().filter((a) => a.id === artwork.id || !lockReason(a.access, entitlements)).map((a) => a.id),
    [artwork.id, entitlements],
  );
  const nextId = useProgressStore(
    useCallback(
      (s: ProgressState) => (completion === 'none' ? null : nextArtworkId(artwork.id, orderedIds, s.index)),
      [artwork.id, completion, orderedIds],
    ),
  );
  const onNext = useCallback(() => {
    if (nextId) router.replace({ pathname: '/color/[artworkId]', params: { artworkId: nextId } });
  }, [nextId]);

  const onFind = useCallback(() => {
    if (!session) return;
    const center = canvas.current?.getViewCenter() ?? { x: artwork.width / 2, y: artwork.height / 2 };
    const index = findNearestUnfilledCell(
      { width: artwork.width, height: artwork.height, cells: artwork.cells, filled: session.filled },
      activeColor,
      center.x,
      center.y,
    );
    if (index === null) {
      setHint(t('coloring.findNone'));
      return;
    }
    setHint(null);
    canvas.current?.focusCell(index, !reduceMotion);
    const col = (index % artwork.width) + 1;
    const row = Math.floor(index / artwork.width) + 1;
    AccessibilityInfo.announceForAccessibility(t('coloring.findFound', { row, col }));
  }, [activeColor, artwork, reduceMotion, session, t]);
  const clearHint = useCallback(() => setHint(null), []);

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
          ref={canvas}
          artwork={artwork}
          colorPixels={session.colorPixels}
          colorRevision={revision}
          largeNumbers={largeNumbers}
          colorblindSymbols={colorblind}
          highContrast={highContrast}
          activeColor={coloring ? activeColor : null}
          onFill={coloring ? fill : undefined}
          dragToFill={dragToFill}
          accessibilityLabel={label}
        />
        {completion === 'celebrate' ? <Confetti /> : null}
        <View style={styles.toasts} pointerEvents="box-none">
          {coloring && breakReminder.visible ? (
            <Toast
              title={t('coloring.break.title')}
              message={t('coloring.break.body', { count: breakReminder.minutes })}
              accent={palette.mint}
              action={{
                label: t('coloring.break.dismiss'),
                accessibilityLabel: t('coloring.break.dismissLabel'),
                onPress: breakReminder.dismiss,
              }}
              durationMs={BREAK_TOAST_MS}
              onTimeout={breakReminder.dismiss}
            />
          ) : null}
          {coloring && hint ? (
            <Toast message={hint} accent={palette.sun} durationMs={HINT_TOAST_MS} onTimeout={clearHint} />
          ) : null}
        </View>
        {coloring ? (
          <Button
            label={t('coloring.find')}
            accessibilityLabel={t('coloring.findLabel', { number: activeColor + 1 })}
            onPress={onFind}
            style={[styles.find, leftHanded ? styles.findLeft : styles.findRight]}
          />
        ) : null}
      </View>
      {coloring ? (
        <PaletteBar
          colors={artwork.palette.colors}
          colorCounts={artwork.colorCounts}
          colorFilled={session.colorFilled}
          revision={revision}
          activeColor={activeColor}
          onSelect={selectColor}
          colorblind={colorblind}
          leftHanded={leftHanded}
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
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  // Navigation guard (deep links included): locked content never opens the coloring screen.
  const reason = artwork ? lockReason(artwork.access, entitlements) : null;
  if (reason) return <Redirect href={{ pathname: '/shop', params: { reason } }} />;
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
  toasts: { position: 'absolute', top: spacing.md, left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  find: { position: 'absolute', bottom: spacing.lg },
  findRight: { right: spacing.lg },
  findLeft: { left: spacing.lg },
});
