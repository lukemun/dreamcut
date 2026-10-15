/** Timestamp-indexed, session-local resources. No clock or decoder is owned here. */
export type CachedFrame<T> = {
  /** Includes source bytes, selected proxy, stream, quality and color policy. */
  sourceKey: string;
  timestampUs: number;
  durationUs: number;
  bytes: number;
  value: T;
  release(): void;
};
export type FrameLease<T> = {frame: Readonly<CachedFrame<T>>; release(): void};
type Entry<T> = {frame: CachedFrame<T>; pins: number; used: number; retired: boolean};

export class FrameStore<T> {
  private entries = new Map<string, Entry<T>>();
  private retired = new Set<Entry<T>>();
  private tick = 0;
  private closed = false;
  private total = 0;
  constructor(readonly budgetBytes: number) {
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 1) throw new Error('Invalid frame budget');
  }
  get bytes() { return this.total; }
  get size() { return this.entries.size; }
  /** For failure messages: what the cache holds when a picture cannot be assembled. */
  describe() {
    const pinned = [...this.entries.values()].filter((entry) => entry.pins > 0);
    return `${this.entries.size} frames, ${Math.round(this.total / 1048576)} of ${Math.round(this.budgetBytes / 1048576)} MiB, ${pinned.length} held (${Math.round(pinned.reduce((sum, entry) => sum + entry.frame.bytes, 0) / 1048576)} MiB)`;
  }
  private key(frame: CachedFrame<T>) { return JSON.stringify([frame.sourceKey, frame.timestampUs]); }
  private dispose(entry: Entry<T>) {
    this.total -= entry.frame.bytes;
    this.retired.delete(entry);
    entry.frame.release();
  }
  private retire(key: string, entry: Entry<T>) {
    this.entries.delete(key);
    entry.retired = true;
    if (entry.pins) this.retired.add(entry); else this.dispose(entry);
  }
  /** Takes ownership, including rejected/duplicate resources. Never evicts a lease. */
  put(frame: CachedFrame<T>): boolean {
    if (this.closed || !frame.sourceKey || !Number.isSafeInteger(frame.timestampUs)
      || !Number.isSafeInteger(frame.durationUs) || frame.durationUs <= 0
      || !Number.isSafeInteger(frame.bytes) || frame.bytes < 1 || frame.bytes > this.budgetBytes) {
      frame.release(); return false;
    }
    const key = this.key(frame);
    const existing = this.entries.get(key);
    if (existing) {
      // The same picture can arrive twice: once with its container duration (read-ahead) and
      // once stretched to the next picture across a millisecond-rounding gap. Keep the longer
      // span, or a request inside that gap never finds the picture.
      if (frame.durationUs > existing.frame.durationUs) existing.frame = {...existing.frame, durationUs: frame.durationUs};
      frame.release(); return true;
    }
    while (this.total + frame.bytes > this.budgetBytes) {
      const candidate = [...this.entries].filter(([, e]) => !e.pins).sort((a,b) => a[1].used-b[1].used)[0];
      if (!candidate) { frame.release(); return false; }
      this.retire(...candidate);
    }
    this.entries.set(key, {frame, pins: 0, used: ++this.tick, retired: false});
    this.total += frame.bytes;
    return true;
  }
  /** Presentation intervals are half-open; no preceding-frame tolerance. */
  has(sourceKey: string, timeUs: number): boolean {
    if (this.closed || !Number.isSafeInteger(timeUs)) return false;
    for (const {frame} of this.entries.values()) {
      if (frame.sourceKey === sourceKey && frame.timestampUs <= timeUs
        && timeUs < frame.timestampUs + frame.durationUs) return true;
    }
    return false;
  }
  /** Only actual consumers promote retention priority; speculative probes use has. */
  acquire(sourceKey: string, timeUs: number): FrameLease<T> | null {
    if (this.closed || !Number.isSafeInteger(timeUs)) return null;
    const entry = [...this.entries.values()].filter(e => e.frame.sourceKey === sourceKey
      && e.frame.timestampUs <= timeUs && timeUs < e.frame.timestampUs + e.frame.durationUs)
      .sort((a,b) => b.frame.timestampUs-a.frame.timestampUs)[0];
    if (!entry) return null;
    entry.pins++; entry.used = ++this.tick;
    let released = false;
    return {frame: entry.frame, release: () => {
      if (released) return;
      released = true; entry.pins--;
      if (entry.retired && !entry.pins) this.dispose(entry);
    }};
  }
  invalidate(sourceKey: string) {
    for (const [key,entry] of this.entries) if (entry.frame.sourceKey === sourceKey) this.retire(key,entry);
  }
  close() {
    this.closed = true;
    for (const [key,entry] of this.entries) this.retire(key,entry);
  }
}
