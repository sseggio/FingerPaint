import { PERF_ARTWORK_ID } from './canvas/__fixtures__/perf-artwork';
import { parseArtworkIdParam, resolveColoringArtwork } from './resolve-artwork';

describe('coloring route params', () => {
  it('accepts kebab-case ids only', () => {
    expect(parseArtworkIdParam('tabby-cat')).toBe('tabby-cat');
    expect(parseArtworkIdParam(['tabby-cat', 'x'])).toBe('tabby-cat');
    for (const bad of [undefined, null, 42, '', 'Tabby', '../etc', 'a b', 'cat-', 'x'.repeat(65), []]) {
      expect(parseArtworkIdParam(bad)).toBeNull();
    }
  });

  it('resolves bundled artworks and rejects unknown ids', () => {
    expect(resolveColoringArtwork('tabby-cat')?.id).toBe('tabby-cat');
    expect(resolveColoringArtwork('does-not-exist')).toBeUndefined();
    expect(resolveColoringArtwork('../tabby-cat')).toBeUndefined();
  });

  it('serves the perf fixture in development only', () => {
    expect(resolveColoringArtwork(PERF_ARTWORK_ID, { allowDev: true })?.width).toBe(128);
    expect(resolveColoringArtwork(PERF_ARTWORK_ID, { allowDev: false })).toBeUndefined();
  });
});
