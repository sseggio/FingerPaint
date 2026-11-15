import { emptyCatalogIndex, isCatalogIndex, type CatalogIndex } from '@/lib/catalog/catalog-index';
import type { Schema } from '@/lib/storage';

/** `fp:catalog` v1: index of the downloaded catalog (see `lib/catalog/catalog-index`). */
export const catalogSchema: Schema<CatalogIndex> = {
  version: 1,
  migrations: {},
  guard: isCatalogIndex,
  defaults: emptyCatalogIndex,
};
