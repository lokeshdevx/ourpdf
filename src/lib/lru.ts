/** Size-aware LRU cache. `sizeOf` is in bytes; entries are evicted (and `onEvict` called) when over budget. */
export class LruCache<K, V> {
  private map = new Map<K, { value: V; size: number }>()
  private bytes = 0
  constructor(
    private maxBytes: number,
    private sizeOf: (v: V) => number,
    private onEvict?: (v: V, k: K) => void,
  ) {}

  get(key: K): V | undefined {
    const e = this.map.get(key)
    if (!e) return undefined
    this.map.delete(key)
    this.map.set(key, e)
    return e.value
  }
  has(key: K): boolean {
    return this.map.has(key)
  }
  set(key: K, value: V): void {
    this.delete(key)
    const size = this.sizeOf(value)
    if (size > this.maxBytes) {
      this.onEvict?.(value, key)
      return
    }
    this.map.set(key, { value, size })
    this.bytes += size
    this.trim()
  }
  delete(key: K): void {
    const e = this.map.get(key)
    if (!e) return
    this.map.delete(key)
    this.bytes -= e.size
    this.onEvict?.(e.value, key)
  }
  deleteWhere(pred: (k: K) => boolean): void {
    for (const k of [...this.map.keys()]) if (pred(k)) this.delete(k)
  }
  setBudget(maxBytes: number): void {
    this.maxBytes = maxBytes
    this.trim()
  }
  clear(): void {
    for (const [k, e] of this.map) this.onEvict?.(e.value, k)
    this.map.clear()
    this.bytes = 0
  }
  get size(): number {
    return this.map.size
  }
  get usedBytes(): number {
    return this.bytes
  }
  private trim() {
    while (this.bytes > this.maxBytes && this.map.size) {
      const oldest = this.map.keys().next().value as K
      this.delete(oldest)
    }
  }
}
