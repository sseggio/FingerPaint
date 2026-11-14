import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, PressableScale } from '@/components/ui';
import { listArtworks } from '@/features/artwork/registry';
import type { LockReason } from '@/features/entitlements/can-access';
import { CATALOG, ownsSku, type CatalogItem } from '@/features/entitlements/catalog';
import { useEntitlementsStore, type RestoreResult } from '@/features/entitlements/entitlements-store';
import type { PurchaseResult, Sku } from '@/features/entitlements/types';
import { useT } from '@/features/i18n';
import { parseLockReason } from '@/features/library/open-artwork';
import { MockDevPanel } from '@/features/shop/mock-dev-panel';
import { ProductCard } from '@/features/shop/product-card';
import { funAccents, palette, radius, spacing, useTheme } from '@/theme';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

type Notice = { message: string; accent: string };

/** Artworks included in a product (Pro artworks, or the pack's album), null for cosmetics. */
function useArtworkCounts(): Readonly<Record<Sku, number | null>> {
  return useMemo(() => {
    const all = listArtworks();
    const count = (item: CatalogItem): number | null => {
      if (item.kind === 'pro') return all.filter((a) => a.access === 'pro').length;
      if (item.kind === 'content') {
        return all.filter((a) => typeof a.access === 'object' && a.access.pack === item.packId).length;
      }
      return null;
    };
    return Object.fromEntries(CATALOG.map((item) => [item.sku, count(item)])) as Record<Sku, number | null>;
  }, []);
}

function CloseButton() {
  const t = useT();
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={t('shop.closeLabel')} onPress={close} hitSlop={spacing.md}>
      <AppText variant="label" tone="primary">
        {t('shop.close')}
      </AppText>
    </PressableScale>
  );
}

/**
 * The shop: honest and calm. Store prices (or "coming soon"), what each product includes,
 * "Restore purchases" always visible, an obvious way out. No timer, no forced paywall.
 */
export function ShopScreen({ reason: reasonParam }: { reason?: unknown }) {
  const t = useT();
  const { colors } = useTheme();
  const reason: LockReason | null = parseLockReason(reasonParam);
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  const products = useEntitlementsStore((s) => s.products);
  const storeStatus = useEntitlementsStore((s) => s.storeStatus);
  const busy = useEntitlementsStore((s) => s.busy);
  const available = useEntitlementsStore((s) => s.provider.available);
  const isMock = useEntitlementsStore((s) => s.provider.kind === 'mock');
  const connect = useEntitlementsStore((s) => s.connect);
  const purchase = useEntitlementsStore((s) => s.purchase);
  const restore = useEntitlementsStore((s) => s.restore);
  const counts = useArtworkCounts();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    // Prices may not be loaded yet (launch still connecting, or offline then): try again.
    const status = useEntitlementsStore.getState().storeStatus;
    if (status === 'idle' || status === 'offline') void connect();
  }, [connect]);

  const describe = (result: PurchaseResult): Notice => {
    const title = t(CATALOG.find((i) => i.sku === result.sku)?.titleKey ?? 'shop.title');
    switch (result.status) {
      case 'purchased':
        return { message: t('shop.result.purchased', { title }), accent: palette.mint };
      case 'pending':
        return { message: t('shop.result.pending'), accent: palette.sun };
      case 'cancelled':
        return { message: t('shop.result.cancelled'), accent: palette.sky };
      default:
        return { message: t(`shop.result.${result.error}`), accent: palette.orange };
    }
  };

  const describeRestore = (result: RestoreResult): Notice => {
    if (result.status === 'unavailable') return { message: t('shop.restoreUnavailable'), accent: palette.sky };
    if (result.status === 'error') return { message: t('shop.restoreFailed'), accent: palette.orange };
    return result.count > 0
      ? { message: t('shop.restored', { count: result.count }), accent: palette.mint }
      : { message: t('shop.restoredNone'), accent: palette.sky };
  };

  const buy = async (sku: Sku) => {
    setNotice(null);
    setNotice(describe(await purchase(sku)));
  };

  const onRestore = async () => {
    setNotice(null);
    setNotice(describeRestore(await restore()));
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('shop.title'), headerRight: () => <CloseButton /> }} />
      <View style={styles.pixels} accessible={false}>
        {funAccents.map((c) => (
          <View key={c} style={[styles.pixel, { backgroundColor: c }]} />
        ))}
      </View>
      <View style={styles.hero}>
        <AppText variant="title" accessibilityRole="header">
          {t(available ? 'shop.heading' : 'shop.comingSoon.heading')}
        </AppText>
        {reason ? <AppText variant="label">{t(reason === 'pro' ? 'shop.reason.pro' : 'shop.reason.pack')}</AppText> : null}
        <AppText tone="secondary">{t(available ? 'shop.intro' : 'shop.comingSoon.body')}</AppText>
      </View>

      {available && storeStatus === 'offline' ? (
        <Card style={styles.card}>
          <AppText tone="secondary">{t('shop.offline')}</AppText>
          <Button
            variant="secondary"
            label={t('shop.retry')}
            accessibilityLabel={t('shop.retryLabel')}
            onPress={() => {
              void connect();
            }}
          />
        </Card>
      ) : null}

      {notice ? (
        <View
          style={[styles.notice, { backgroundColor: colors.surface, borderColor: notice.accent }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert">
          <AppText variant="label">{notice.message}</AppText>
        </View>
      ) : null}

      {CATALOG.map((item) => (
        <ProductCard
          key={item.sku}
          item={item}
          product={products[item.sku]}
          owned={ownsSku(entitlements, item.sku)}
          artworkCount={counts[item.sku]}
          storeStatus={storeStatus}
          buying={busy === item.sku}
          disabled={busy !== null}
          onBuy={() => {
            void buy(item.sku);
          }}
        />
      ))}

      <Card style={styles.card}>
        <AppText tone="secondary">{t('shop.restoreHint')}</AppText>
        <Button
          variant="secondary"
          label={t('shop.restore')}
          accessibilityLabel={t('shop.restoreLabel')}
          loading={busy === 'restore'}
          disabled={busy !== null && busy !== 'restore'}
          onPress={() => {
            void onRestore();
          }}
        />
      </Card>

      {__DEV__ && isMock ? (
        <MockDevPanel onNotice={(message) => setNotice({ message, accent: palette.sun })} />
      ) : null}

      <AppText variant="caption" tone="secondary" style={styles.footer}>
        {t('shop.footer')}
      </AppText>
      <Button variant="ghost" label={t('shop.close')} accessibilityLabel={t('shop.closeLabel')} onPress={close} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  pixels: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  pixel: { width: spacing.xl, height: spacing.xl, borderRadius: radius.xs },
  hero: { gap: spacing.sm },
  card: { gap: spacing.md },
  notice: { borderWidth: 2, borderRadius: radius.md, padding: spacing.lg },
  footer: { textAlign: 'center', paddingHorizontal: spacing.lg },
});
