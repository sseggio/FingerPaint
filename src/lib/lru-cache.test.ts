import { LruCache } from './lru-cache';

describe('LruCache', () => {
  it('evicts the least recently used entry beyond capacity', () => {
    const evicted: string[] = [];
    const cache = new LruCache<string, number>(2, (k) => evicted.push(k));
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a becomes most recent
    cache.set('c', 3);
    expect(evicted).toEqual(['b']);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('overwrites without evicting and clears', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBe(2);
    expect(cache.get('missing')).toBeUndefined();
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new LruCache(0)).toThrow(RangeError);
  });
});
