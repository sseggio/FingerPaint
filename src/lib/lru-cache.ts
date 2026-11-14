/** Small least-recently-used cache (Map insertion order = recency). */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(
    readonly capacity: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Returns the value and marks it as most recently used. */
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as K;
      const evicted = this.map.get(oldest) as V;
      this.map.delete(oldest);
      this.onEvict?.(oldest, evicted);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
