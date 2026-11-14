import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card } from '@/components/ui';
import type { CatalogItem } from '@/features/entitlements/catalog';
import type { StoreStatus } from '@/features/entitlements/entitlements-store';
import type { StoreProduct } from '@/features/entitlements/types';
import { useT } from '@/features/i18n';
import { palette, radius, spacing, useTheme } from '@/theme';

const ACCENTS: Readonly<Record<CatalogItem['kind'], string>> = {
  pro: palette.violet,
  content: palette.sky,
  cosmetic: palette.pink,
};

export interface ProductCardProps {
  item: CatalogItem;
  /** Store product (price); missing when the store does not sell it (yet). */
  product: StoreProduct | undefined;
  owned: boolean;
  /** Number of artworks included (content and Pro), null for cosmetics. */
  artworkCount: number | null;
  storeStatus: StoreStatus;
  /** This product's purchase is in flight. */
  buying: boolean;
  /** Another purchase / restore is in flight. */
  disabled: boolean;
  onBuy(): void;
}

/** One product, described plainly: what it is, what is included, its store price. No pressure. */
export function ProductCard({ item, product, owned, artworkCount, storeStatus, buying, disabled, onBuy }: ProductCardProps) {
  const t = useT();
  const { colors } = useTheme();
  const accent = ACCENTS[item.kind];
  const title = t(item.titleKey);

  let action: React.ReactNode;
  if (owned) {
    action = (
      <View accessible accessibilityLabel={t('shop.ownedLabel', { title })}>
        <Badge label={t('shop.owned')} color={palette.mint} />
      </View>
    );
  } else if (product) {
    action = (
      <Button
        label={t('shop.buy', { price: product.displayPrice })}
        accessibilityLabel={t('shop.buyLabel', { title, price: product.displayPrice })}
        loading={buying}
        disabled={disabled}
        onPress={onBuy}
      />
    );
  } else if (storeStatus === 'connecting') {
    action = <ActivityIndicator color={colors.primaryText} accessibilityLabel={t('shop.priceSoon')} />;
  } else {
    action = (
      <AppText variant="label" tone="secondary">
        {t(storeStatus === 'offline' ? 'shop.priceUnavailable' : 'shop.priceSoon')}
      </AppText>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: accent }]} accessible={false} />
      <View style={styles.header}>
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          {title}
        </AppText>
        <Badge label={t('shop.oneTime')} color={accent} />
      </View>
      <AppText tone="secondary">{t(item.bodyKey)}</AppText>
      {artworkCount !== null && artworkCount > 0 ? (
        <AppText variant="label">{t('shop.artworkCount', { count: artworkCount })}</AppText>
      ) : null}
      <View style={styles.includes}>
        {item.includesKeys.map((key) => (
          <View key={key} style={styles.line}>
            <View style={[styles.dot, { backgroundColor: accent }]} accessible={false} />
            <AppText style={styles.flex}>{t(key)}</AppText>
          </View>
        ))}
      </View>
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, overflow: 'hidden' },
  stripe: { height: spacing.xs, borderRadius: radius.xs, marginBottom: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  includes: { gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.xs },
});
