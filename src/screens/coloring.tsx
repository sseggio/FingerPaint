import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { PixelCanvas } from '@/features/coloring/canvas/pixel-canvas';
import { createColorPixels } from '@/features/coloring/canvas/layers';
import { resolveColoringArtwork } from '@/features/coloring/resolve-artwork';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
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
        <Button
          label={t('coloring.notFound.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Card>
    </View>
  );
}

function ColoringView({ artwork }: { artwork: Artwork }) {
  const locale = useLocale();
  const t = useT();
  const largeNumbers = useSettingsStore((s) => s.settings.largeNumbers);
  const title = localizedTitle(artwork.title, locale);
  // Empty color layer for now; the coloring session (F06) mutates it and bumps the revision.
  const [colorPixels] = useState(() => createColorPixels(artwork.width, artwork.height));

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.root}>
      <Stack.Screen options={{ title }} />
      <PixelCanvas
        artwork={artwork}
        colorPixels={colorPixels}
        colorRevision={0}
        largeNumbers={largeNumbers}
        // Read-only until F06: one finger pans (later only when drag-to-fill is off).
        panMinPointers={1}
        accessibilityLabel={t('coloring.canvasLabel', { title })}
      />
    </SafeAreaView>
  );
}

/** Full-screen coloring canvas (read-only in F05: render, zoom, pan). */
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
