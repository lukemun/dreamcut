/** Session-local observations of pixels actually presented by a video canvas.
 * These never advance the timeline or alter export timing. */
export class PresentedFrames {
  private times = new Map<string, number>();
  private listeners = new Map<string, Set<(time: number) => void>>();
  get(key: string) { return this.times.get(key); }
  publish(key: string, time: number) {
    if (!Number.isFinite(time)) return;
    this.times.set(key, time);
    for (const listener of this.listeners.get(key) ?? []) listener(time);
  }
  subscribe(key: string, listener: (time: number) => void) {
    const set = this.listeners.get(key) ?? new Set();
    set.add(listener); this.listeners.set(key, set);
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(key); };
  }
  remove(key: string) { this.times.delete(key); }
  clear() { this.times.clear(); this.listeners.clear(); }
}
