import { parseCatalogUrl } from '@/lib/catalog/manifest';

export interface CatalogConfig {
  /** `https://host[/path]`, no trailing slash. */
  base: string;
  /** Lowercase `host[:port]`: every artwork URL must be on it. */
  host: string;
}

/**
 * Online catalog location, from `EXPO_PUBLIC_CATALOG_URL` (set per EAS profile in eas.json, or
 * in `.env.local` for development). Empty, missing or not HTTPS: null, the feature is off and
 * the app behaves exactly as with bundled content only.
 * (Must be read as `process.env.EXPO_PUBLIC_CATALOG_URL` to be inlined by Expo.)
 */
export function readCatalogConfig(value: string | undefined = process.env.EXPO_PUBLIC_CATALOG_URL): CatalogConfig | null {
  return parseCatalogUrl(value);
}
