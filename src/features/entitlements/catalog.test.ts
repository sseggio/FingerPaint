import albums from '@/content/albums.json';
import { listArtworks } from '@/features/artwork/registry';
import { en } from '@/features/i18n/en';

import { DEFAULT_ENTITLEMENTS } from './can-access';
import { CATALOG, catalogItem, entitlementsFromSkus, normalizeSkus, ownsSku } from './catalog';
import { ALL_SKUS, isSku, SKUS } from './types';

describe('catalog', () => {
  it('sells exactly the three V1 non-consumables, in order', () => {
    expect(CATALOG.map((i) => i.sku)).toEqual([
      'com.fingerpaint.app.pro',
      'com.fingerpaint.app.pack.ocean',
      'com.fingerpaint.app.pack.neon',
    ]);
    expect(ALL_SKUS).toEqual(CATALOG.map((i) => i.sku));
    expect(CATALOG.map((i) => i.kind)).toEqual(['pro', 'content', 'cosmetic']);
  });

  it('has a translated title, description and included lines for every product', () => {
    for (const item of CATALOG) {
      for (const key of [item.titleKey, item.bodyKey, ...item.includesKeys]) expect(en[key]).toBeTruthy();
      expect(item.includesKeys.length).toBeGreaterThan(0);
    }
  });

  it('maps the content pack to a real album and real artworks', () => {
    const ocean = catalogItem(SKUS.oceanPack);
    expect(albums.albums.find((a) => 'pack' in a && a.pack === ocean.packId)?.id).toBe('deep-ocean');
    const inPack = listArtworks().filter((a) => typeof a.access === 'object' && a.access.pack === ocean.packId);
    expect(inPack.length).toBeGreaterThan(0);
    // Pro unlocks content too, but never a tool: no product of kind "tool" exists.
    expect(listArtworks().some((a) => a.access === 'pro')).toBe(true);
  });

  it('keeps about 75% of the artworks free', () => {
    const all = listArtworks();
    const free = all.filter((a) => a.access === 'free').length;
    expect(free / all.length).toBeGreaterThanOrEqual(0.6);
  });

  it('recognizes SKUs strictly', () => {
    expect(isSku('com.fingerpaint.app.pro')).toBe(true);
    expect(isSku('com.fingerpaint.app.PRO')).toBe(false);
    expect(isSku(42)).toBe(false);
    expect(normalizeSkus([SKUS.neonPack, 'junk', SKUS.pro, SKUS.pro, null])).toEqual([SKUS.pro, SKUS.neonPack]);
  });

  it('turns owned SKUs into entitlements', () => {
    expect(entitlementsFromSkus([], 'storekit')).toBe(DEFAULT_ENTITLEMENTS);
    expect(entitlementsFromSkus(['nope'], 'storekit')).toBe(DEFAULT_ENTITLEMENTS);
    expect(entitlementsFromSkus([SKUS.pro], 'mock')).toEqual({ pro: true, packs: [], source: 'mock' });
    expect(entitlementsFromSkus([SKUS.neonPack, SKUS.oceanPack], 'storekit')).toEqual({
      pro: false,
      packs: ['ocean', 'neon'],
      source: 'storekit',
    });
    const all = entitlementsFromSkus(ALL_SKUS, 'mock');
    expect(Object.isFrozen(all)).toBe(true);
    for (const sku of ALL_SKUS) expect(ownsSku(all, sku)).toBe(true);
    for (const sku of ALL_SKUS) expect(ownsSku(DEFAULT_ENTITLEMENTS, sku)).toBe(false);
  });
});
