/** Options of a weighted cache: entries are also evicted while their total weight exceeds `maxWeight`. */
export interface LruWeightOptions<V> {
  maxWeight: number;
  /** Weight of one value (e.g. bytes); must be ≥ 0. */
  weigh: (value: V) => number;
}

/**
 * Small least-recently-used cache (Map insertion order = recency), bounded by entry count and,
 * optionally, by total weight (the most recent entry is always kept, even if heavier alone).
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly weights = new Map<K, number>();
  private total = 0;

  constructor(
    readonly capacity: number,
    private readonly onEvict?: (key: K, value: V) => void,
    private readonly weight?: LruWeightOptions<V>,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    if (weight && !(weight.maxWeight > 0)) throw new RangeError('maxWeight must be positive');
  }

  get size(): number {
    return this.map.size;
  }

  /** Sum of the weights of the cached values (0 without weight options). */
  get totalWeight(): number {
    return this.total;
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
    if (this.map.has(key)) this.remove(key);
    this.map.set(key, value);
    if (this.weight) {
      const w = Math.max(0, this.weight.weigh(value) || 0);
      this.weights.set(key, w);
      this.total += w;
    }
    while (this.map.size > this.capacity || (this.weight && this.total > this.weight.maxWeight && this.map.size > 1)) {
      const oldest = this.map.keys().next().value as K;
      const evicted = this.map.get(oldest) as V;
      this.remove(oldest);
      this.onEvict?.(oldest, evicted);
    }
  }

  clear(): void {
    this.map.clear();
    this.weights.clear();
    this.total = 0;
  }

  private remove(key: K): void {
    this.map.delete(key);
    this.total -= this.weights.get(key) ?? 0;
    this.weights.delete(key);
  }
}
