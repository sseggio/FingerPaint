import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, SegmentedControl } from '@/components/ui';
import { getArtwork } from '@/features/artwork/registry';
import { localizedTitle, useLocale, useT } from '@/features/i18n';
import { ArtworkThumbnail } from '@/features/library/artwork-thumbnail';
import type { ArtworkSource } from '@/lib/artwork/types';
import { exportSize } from '@/lib/export-scale';
import type { ProgressEntry } from '@/lib/library';
import { colors as themeColors, radius, spacing, useTheme } from '@/theme';

import type { PngAction } from './export-artwork';

export type ExportBackground = 'transparent' | 'light' | 'dark';

/** Background painted under empty cells: none (transparent PNG) or a theme background token. */
export function backgroundColor(choice: ExportBackground): string | null {
  if (choice === 'light') return themeColors.light.background;
  if (choice === 'dark') return themeColors.dark.background;
  return null;
}

const PREVIEW_SIZE = 168;

export interface ArtworkSheetProps {
  artwork: ArtworkSource | null;
  progress: ProgressEntry | undefined;
  busy: PngAction | null;
  onClose(): void;
  onContinue(artwork: ArtworkSource): void;
  onPng(artwork: ArtworkSource, action: PngAction, background: string | null): void;
}

/** Bottom sheet with the actions on one artwork: continue, export as PNG, share. */
export function ArtworkSheet({ artwork, progress, busy, onClose, onContinue, onPng }: ArtworkSheetProps) {
  const t = useT();
  const locale = useLocale();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [background, setBackground] = useState<ExportBackground>('transparent');
  const decoded = artwork ? getArtwork(artwork.id) : undefined;
  const size = decoded ? exportSize(decoded.width, decoded.height) : null;
  const title = artwork ? localizedTitle(artwork.title, locale) : '';
  const done = progress?.status === 'completed';
  const bg = backgroundColor(background);

  return (
    <Modal visible={artwork !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('gallery.sheet.closeLabel')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink, opacity: 0.35 }]}
        />
        {artwork ? (
          <View
            accessibilityViewIsModal
            accessibilityLabel={t('gallery.sheet.label', { title })}
            style={[
              styles.sheet,
              { backgroundColor: colors.background, shadowColor: colors.shadow, paddingBottom: spacing.xl + insets.bottom },
            ]}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <View style={styles.top}>
              <View style={[styles.preview, { backgroundColor: bg ?? colors.surfaceAlt }]}>
                <ArtworkThumbnail artworkId={artwork.id} size={PREVIEW_SIZE - spacing.md * 2} progress={progress} />
              </View>
              <AppText variant="title" accessibilityRole="header" style={styles.center}>
                {title}
              </AppText>
              {size ? (
                <AppText variant="caption" tone="secondary" style={styles.center}>
                  {t('gallery.sheet.size', { width: size.width, height: size.height })}
                </AppText>
              ) : null}
              {done ? null : (
                <AppText variant="caption" tone="primary" style={styles.center}>
                  {t('gallery.sheet.partial')}
                </AppText>
              )}
            </View>
            <View style={styles.block}>
              <AppText variant="label">{t('gallery.sheet.background')}</AppText>
              <SegmentedControl<ExportBackground>
                accessibilityLabel={t('gallery.sheet.background')}
                value={background}
                onChange={setBackground}
                options={[
                  { value: 'transparent', label: t('gallery.sheet.bg.transparent') },
                  { value: 'light', label: t('gallery.sheet.bg.light') },
                  { value: 'dark', label: t('gallery.sheet.bg.dark') },
                ]}
              />
            </View>
            <View style={styles.actions}>
              <Button
                label={done ? t('gallery.sheet.view') : t('gallery.sheet.continue')}
                accessibilityLabel={
                  done ? t('gallery.sheet.viewLabel', { title }) : t('gallery.sheet.continueLabel', { title })
                }
                onPress={() => onContinue(artwork)}
              />
              <View style={styles.row}>
                <Button
                  variant="secondary"
                  style={styles.flex}
                  label={t('gallery.sheet.export')}
                  accessibilityLabel={t('gallery.sheet.exportLabel', {
                    title,
                    width: size?.width ?? 0,
                    height: size?.height ?? 0,
                  })}
                  loading={busy === 'export'}
                  disabled={busy !== null && busy !== 'export'}
                  onPress={() => onPng(artwork, 'export', bg)}
                />
                <Button
                  variant="secondary"
                  style={styles.flex}
                  label={t('gallery.sheet.share')}
                  accessibilityLabel={t('gallery.sheet.shareLabel', { title })}
                  loading={busy === 'share'}
                  disabled={busy !== null && busy !== 'share'}
                  onPress={() => onPng(artwork, 'share', bg)}
                />
              </View>
              <Button
                variant="ghost"
                label={t('gallery.sheet.close')}
                accessibilityLabel={t('gallery.sheet.closeLabel')}
                onPress={onClose}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  grabber: { alignSelf: 'center', width: spacing.xxl + spacing.sm, height: spacing.xs, borderRadius: radius.pill },
  top: { alignItems: 'center', gap: spacing.xs },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  center: { textAlign: 'center' },
  block: { gap: spacing.sm },
  actions: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1, paddingHorizontal: spacing.md },
});
