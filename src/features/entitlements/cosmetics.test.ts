import { DEFAULT_ENTITLEMENTS } from './can-access';
import { entitlementsFromSkus } from './catalog';
import { CLASSIC_COSMETICS, resolveCosmetics } from './cosmetics';
import { SKUS } from './types';

const on = { neonTheme: true, goldConfetti: true };
const neon = entitlementsFromSkus([SKUS.neonPack], 'mock');
const pro = entitlementsFromSkus([SKUS.pro], 'mock');
const both = entitlementsFromSkus([SKUS.pro, SKUS.neonPack], 'mock');

describe('resolveCosmetics', () => {
  it.each([
    ['nothing owned', DEFAULT_ENTITLEMENTS, on, CLASSIC_COSMETICS],
    ['neon owned', neon, on, { canvas: 'neon', confetti: 'neon' }],
    ['neon owned but turned off', neon, { ...on, neonTheme: false }, CLASSIC_COSMETICS],
    ['pro: golden confetti, classic canvas', pro, on, { canvas: 'classic', confetti: 'gold' }],
    ['pro with gold turned off', pro, { ...on, goldConfetti: false }, CLASSIC_COSMETICS],
    ['both: neon wins', both, on, { canvas: 'neon', confetti: 'neon' }],
    ['both, neon off: gold', both, { ...on, neonTheme: false }, { canvas: 'classic', confetti: 'gold' }],
    ['ocean pack is not a cosmetic', entitlementsFromSkus([SKUS.oceanPack], 'mock'), on, CLASSIC_COSMETICS],
  ])('%s', (_name, entitlements, prefs, expected) => {
    expect(resolveCosmetics(entitlements, prefs)).toEqual(expected);
  });
});
