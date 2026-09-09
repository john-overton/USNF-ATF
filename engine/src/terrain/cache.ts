/** An LRU with an explicit byte cap; callers own disposal of evicted GPU resources. */
export class ByteCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  bytes = 0;
  constructor(
    readonly capacity: number,
    private readonly dispose?: (value: T) => void,
  ) {}
  get size(): number {
    return this.entries.size;
  }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  put(key: string, value: T, bytes: number): void {
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > this.capacity)
      throw new Error('Cache entry exceeds capacity');
    this.remove(key);
    while (this.bytes + bytes > this.capacity) this.remove(this.entries.keys().next().value!);
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
  }
  remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.bytes -= entry.bytes;
      this.dispose?.(entry.value);
    }
  }
  clear(): void {
    for (const key of this.entries.keys()) this.remove(key);
  }
}
