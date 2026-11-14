import type { ArtworkAccess } from '@/lib/artwork/types';

import { canAccess, DEFAULT_ENTITLEMENTS, lockReason, type Entitlements } from './can-access';

const none = DEFAULT_ENTITLEMENTS;
const pro: Entitlements = { pro: true, packs: [], source: 'mock' };
const ocean: Entitlements = { pro: false, packs: ['ocean'], source: 'mock' };
const all: Entitlements = { pro: true, packs: ['ocean', 'neon'], source: 'mock' };

const free: ArtworkAccess = 'free';
const proOnly: ArtworkAccess = 'pro';
const oceanPack: ArtworkAccess = { pack: 'ocean' };
const otherPack: ArtworkAccess = { pack: 'forest' };

describe('canAccess', () => {
  it.each<[string, ArtworkAccess, Entitlements, boolean]>([
    ['free / nothing', free, none, true],
    ['free / pro', free, pro, true],
    ['free / pack', free, ocean, true],
    ['pro / nothing', proOnly, none, false],
    ['pro / pro', proOnly, pro, true],
    ['pro / pack only', proOnly, ocean, false],
    ['pack / nothing', oceanPack, none, false],
    ['pack / pro (packs are not part of Pro)', oceanPack, pro, false],
    ['pack / that pack', oceanPack, ocean, true],
    ['other pack / ocean owned', otherPack, ocean, false],
    ['pack / everything', oceanPack, all, true],
    ['pro / everything', proOnly, all, true],
  ])('%s', (_name, access, entitlements, expected) => {
    expect(canAccess(access, entitlements)).toBe(expected);
  });

  it('defaults to nothing purchased', () => {
    expect(DEFAULT_ENTITLEMENTS).toEqual({ pro: false, packs: [], source: 'none' });
    expect(Object.isFrozen(DEFAULT_ENTITLEMENTS)).toBe(true);
  });

  it('explains why an artwork is locked', () => {
    expect(lockReason(free, none)).toBeNull();
    expect(lockReason(proOnly, none)).toBe('pro');
    expect(lockReason(oceanPack, pro)).toBe('pack');
  });

  it('fails closed on a malformed access value', () => {
    expect(canAccess({} as unknown as ArtworkAccess, all)).toBe(false);
  });
});
