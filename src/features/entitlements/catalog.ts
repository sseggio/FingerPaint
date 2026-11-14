import type { MessageKey } from '@/features/i18n';

import { DEFAULT_ENTITLEMENTS, type Entitlements, type EntitlementsSource } from './can-access';
import { ALL_SKUS, isSku, SKUS, type Sku } from './types';

/**
 * - `pro`: the "pro" artworks + a bonus cosmetic. Never a tool, never hints.
 * - `content`: an album of illustrations (`packId` matches `access: { pack }` in the content).
 * - `cosmetic`: looks only (canvas theme, confetti), applied when owned, can be turned off.
 */
export type ProductKind = 'pro' | 'content' | 'cosmetic';

export interface CatalogItem {
  sku: Sku;
  kind: ProductKind;
  /** Pack id granted (content and cosmetic packs). */
  packId?: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  /** What is included, one line each. */
  includesKeys: readonly MessageKey[];
}

/** Display order of the shop. */
export const CATALOG: readonly CatalogItem[] = Object.freeze([
  {
    sku: SKUS.pro,
    kind: 'pro',
    titleKey: 'shop.item.pro.title',
    bodyKey: 'shop.item.pro.body',
    includesKeys: ['shop.item.pro.includes.artworks', 'shop.item.pro.includes.gold', 'shop.item.pro.includes.support'],
  },
  {
    sku: SKUS.oceanPack,
    kind: 'content',
    packId: 'ocean',
    titleKey: 'shop.item.ocean.title',
    bodyKey: 'shop.item.ocean.body',
    includesKeys: ['shop.item.ocean.includes.artworks', 'shop.item.ocean.includes.forever'],
  },
  {
    sku: SKUS.neonPack,
    kind: 'cosmetic',
    packId: 'neon',
    titleKey: 'shop.item.neon.title',
    bodyKey: 'shop.item.neon.body',
    includesKeys: ['shop.item.neon.includes.canvas', 'shop.item.neon.includes.confetti', 'shop.item.neon.includes.toggle'],
  },
]);

export function catalogItem(sku: Sku): CatalogItem {
  const item = CATALOG.find((i) => i.sku === sku);
  if (!item) throw new Error(`unknown sku ${sku}`);
  return item;
}

/** Keeps known SKUs only, without duplicates, in catalog order. */
export function normalizeSkus(values: readonly unknown[]): Sku[] {
  const owned = new Set(values.filter(isSku));
  return ALL_SKUS.filter((sku) => owned.has(sku));
}

/** What a set of owned SKUs unlocks. Nothing owned → the shared frozen defaults. */
export function entitlementsFromSkus(skus: readonly unknown[], source: EntitlementsSource): Entitlements {
  const owned = normalizeSkus(skus);
  if (owned.length === 0) return DEFAULT_ENTITLEMENTS;
  const packs = CATALOG.filter((i) => owned.includes(i.sku) && i.packId).map((i) => i.packId as string);
  return Object.freeze({ pro: owned.includes(SKUS.pro), packs: Object.freeze(packs), source });
}

/** True when the entitlements include this product. */
export function ownsSku(entitlements: Entitlements, sku: Sku): boolean {
  const item = catalogItem(sku);
  if (item.kind === 'pro') return entitlements.pro;
  return item.packId !== undefined && entitlements.packs.includes(item.packId);
}
