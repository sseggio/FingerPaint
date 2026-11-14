import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import type { LockReason } from '@/features/entitlements/can-access';
import { useT } from '@/features/i18n';
import { parseLockReason } from '@/features/library/open-artwork';
import { funAccents, radius, spacing, useTheme } from '@/theme';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Placeholder shop (F12 brings the real one): honest "coming soon", no pressure, no timer,
 * nothing to buy yet.
 */
export function ShopScreen({ reason: reasonParam }: { reason?: unknown }) {
  const t = useT();
  const { colors } = useTheme();
  const reason: LockReason | null = parseLockReason(reasonParam);
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('shop.title') }} />
      <View style={styles.pixels} accessible={false}>
        {funAccents.map((c) => (
          <View key={c} style={[styles.pixel, { backgroundColor: c }]} />
        ))}
      </View>
      <Card style={styles.card}>
        <AppText variant="title" accessibilityRole="header">
          {t('shop.heading')}
        </AppText>
        {reason ? <AppText variant="label">{t(reason === 'pro' ? 'shop.reason.pro' : 'shop.reason.pack')}</AppText> : null}
        <AppText tone="secondary">{t('shop.body')}</AppText>
        <Button label={t('shop.back')} accessibilityLabel={t('shop.backLabel')} onPress={close} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  pixels: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  pixel: { width: 24, height: 24, borderRadius: radius.sm / 2 },
  card: { gap: spacing.md },
});
