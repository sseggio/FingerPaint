import { Redirect, router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, Toast } from '@/components/ui';
import { useRegistry } from '@/features/artwork/use-registry';
import { lockReason } from '@/features/entitlements/can-access';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import { useCosmetics } from '@/features/entitlements/use-cosmetics';
import { PixelCanvas, type PixelCanvasHandle, type ReplayRequest } from '@/features/coloring/canvas/pixel-canvas';
import { replayOrder, type ColoringSession } from '@/features/coloring/coloring-session';
import { CompletionCard } from '@/features/coloring/completion-card';
import { Confetti } from '@/features/coloring/confetti';
import { coloringFeedback } from '@/features/coloring/feedback';
import { nextArtworkId } from '@/features/coloring/next-artwork';
import { PaletteBar } from '@/features/coloring/palette-bar';
import { resolveColoringArtwork } from '@/features/coloring/resolve-artwork';
import { useColoringSession, type CompletionState } from '@/features/coloring/use-coloring-session';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import { useProgressStore, type ProgressState } from '@/features/progress/progress-store';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useBreakReminder } from '@/features/wellbeing/break-reminder';
import type { Artwork } from '@/lib/artwork/types';
import { findNearestUnfilledCell } from '@/lib/hints';
import { canvasThemes, confettiPalettes, palette, radius, spacing, useTheme } from '@/theme';

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

/** A replay request, plus whether its end opens the celebration (confetti, success haptic). */
type Replay = ReplayRequest & { celebrate: boolean };

function replayFor(session: ColoringSession, id: number, celebrate: boolean): Replay {
  return { id, order: replayOrder(session), pop: celebrate, celebrate };
}

/**
 * Completion sequence (F18): the last cell starts a replay of the coloring (skippable with a
 * tap), then the drawing pops, the success haptic plays, confetti falls and the card shows.
 * With reduce motion: no replay, the finished image and the card right away (no confetti).
 * `replayOnOpen`: a finished artwork opened from "My artworks" > "Watch again".
 */
function ColoringView({ artwork, replayOnOpen = false }: { artwork: Artwork; replayOnOpen?: boolean }) {
  const locale = useLocale();
  const t = useT();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const largeNumbers = useSettingsStore((s) => s.settings.largeNumbers);
  const dragToFill = useSettingsStore((s) => s.settings.dragToFill);
  const colorblind = useSettingsStore((s) => s.settings.colorblindSymbols);
  const highContrast = useSettingsStore((s) => s.settings.highContrast);
  const leftHanded = useSettingsStore((s) => s.settings.leftHanded);
  const cosmetics = useCosmetics();
  const title = localizedTitle(artwork.title, locale);
  const { session, revision, activeColor, completion, selectColor, fill } = useColoringSession(artwork);
  const canvas = useRef<PixelCanvasHandle>(null);
  const [hint, setHint] = useState<string | null>(null);
  const breakReminder = useBreakReminder(completion === 'none');

  const [replay, setReplay] = useState<Replay | null>(null);
  const [replaySeq, setReplaySeq] = useState(0);
  /** The celebration (confetti, success haptic) is on: set once, at the end of the first replay. */
  const [celebrating, setCelebrating] = useState(false);
  // React to completion changes during render (no frame with the card before the replay).
  const [seenCompletion, setSeenCompletion] = useState<CompletionState>(completion);
  if (seenCompletion !== completion) {
    setSeenCompletion(completion);
    const wantsReplay = completion === 'celebrate' || (completion === 'done' && replayOnOpen);
    if (session && wantsReplay && !reduceMotion) {
      setReplaySeq(replaySeq + 1);
      setReplay(replayFor(session, replaySeq + 1, completion === 'celebrate'));
    } else if (completion === 'celebrate') {
      setCelebrating(true);
    }
  }
  // One success haptic per completion, when the celebration shows.
  useEffect(() => {
    if (celebrating) coloringFeedback.artworkDone();
  }, [celebrating]);
  const onReplayEnd = useCallback(
    (id: number) => {
      if (replay?.id !== id) return;
      if (replay.celebrate) setCelebrating(true);
      setReplay(null);
    },
    [replay],
  );
  const skipReplay = useCallback(() => canvas.current?.skipReplay(), []);
  const onWatchAgain = useCallback(() => {
    if (!session) return;
    // Confetti fell already: a replay asked for later never brings them back.
    setCelebrating(false);
    setReplaySeq(replaySeq + 1);
    setReplay(replayFor(session, replaySeq + 1, false));
  }, [replaySeq, session]);

  // Only the next artwork id is derived from the progress index: the screen re-renders when that
  // id changes, not on every save of the index.
  // While coloring, the selector returns null without reading the index at all.
  // "Next" never offers a locked artwork.
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  const registry = useRegistry();
  const orderedIds = useMemo(
    () => registry.listArtworks().filter((a) => a.id === artwork.id || !lockReason(a.access, entitlements)).map((a) => a.id),
    [artwork.id, entitlements, registry],
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
  const replaying = replay !== null;
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
          theme={canvasThemes[cosmetics.canvas]}
          activeColor={coloring ? activeColor : null}
          onFill={coloring ? fill : undefined}
          dragToFill={dragToFill}
          onFillStart={coloringFeedback.fillStart}
          replay={replay}
          onReplayEnd={onReplayEnd}
          smoothFit={!coloring}
          accessibilityLabel={label}
        />
        {replaying ? (
          <Pressable
            testID="replay-skip"
            accessibilityRole="button"
            accessibilityLabel={t('coloring.replay.skipLabel')}
            onPress={skipReplay}
            style={[StyleSheet.absoluteFill, styles.skip]}>
            <View style={[styles.skipPill, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
              <AppText variant="caption" tone="secondary">
                {t('coloring.replay.skip')}
              </AppText>
            </View>
          </Pressable>
        ) : null}
        {completion === 'celebrate' && celebrating && !replaying ? (
          <Confetti colors={confettiPalettes[cosmetics.confetti]} />
        ) : null}
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
      ) : replaying ? null : (
        <CompletionCard
          title={title}
          justFinished={completion === 'celebrate'}
          onNext={nextId ? onNext : null}
          onLibrary={goToLibrary}
          onReplay={reduceMotion ? null : onWatchAgain}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Full-screen coloring: canvas, palette, autosave and the completion screen. `replay` (route
 * param, "1"): replay the coloring of a finished artwork when it opens.
 */
export function ColoringScreen({ artworkId, replay }: { artworkId: unknown; replay?: unknown }) {
  const { colors } = useTheme();
  const artwork = resolveColoringArtwork(artworkId);
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  // Navigation guard (deep links included): locked content never opens the coloring screen.
  const reason = artwork ? lockReason(artwork.access, entitlements) : null;
  if (reason) return <Redirect href={{ pathname: '/shop', params: { reason } }} />;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {artwork ? (
        <ColoringView key={artwork.id} artwork={artwork} replayOnOpen={parseReplayParam(replay)} />
      ) : (
        <NotFound />
      )}
    </View>
  );
}

/** `replay` route param: "1" asks for the replay of a finished artwork. */
export function parseReplayParam(param: unknown): boolean {
  return (Array.isArray(param) ? param[0] : param) === '1';
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skip: { justifyContent: 'flex-end', alignItems: 'center', padding: spacing.lg },
  skipPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  center: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: { gap: spacing.md },
  toasts: { position: 'absolute', top: spacing.md, left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  find: { position: 'absolute', bottom: spacing.lg },
  findRight: { right: spacing.lg },
  findLeft: { left: spacing.lg },
});
