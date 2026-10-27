import {FrameStore, type CachedFrame, type FrameLease} from './frame-store';
export type FrameNeed = Readonly<{slot: string; sourceKey: string; timeUs: number}>;
export type FrameTicket = Readonly<{generation: number; serial: number; sceneKey: string; timelineFrame: number; needs: readonly FrameNeed[]}>;
export type FramePacket<T> = {ticket: FrameTicket; frames: ReadonlyMap<string, Readonly<CachedFrame<T>>>; release(): void};

/** One current target. Transport owns time; this controller only certifies resources. */
export class GpuFrameController<T> {
  private generation = 0;
  private serial = 0;
  private current: FrameTicket | null = null;
  private closed = false;
  private pending = new Map<string, FrameLease<T>>();
  private reserving = false;
  private packets = new WeakSet<FramePacket<T>>();
  constructor(readonly store: FrameStore<T>) {}
  /** Called for explicit seek, source/scene replacement, or device recovery. */
  invalidatePending() { this.releasePending(); this.generation++; this.current = null; }
  private releasePending() {
    this.reserving = false;
    for (const lease of this.pending.values()) lease.release();
    this.pending.clear();
  }
  /** End asynchronous preparation without releasing a newer request's resources. */
  finish(ticket: FrameTicket) { if (this.isCurrent(ticket)) this.releasePending(); }
  private pinAvailable() {
    if (!this.reserving || !this.current) return;
    for (const need of this.current.needs) {
      if (this.pending.has(need.slot)) continue;
      const lease = this.store.acquire(need.sourceKey, need.timeUs);
      if (lease) this.pending.set(need.slot, lease);
    }
  }
  /** Cache-only lookahead also protects resources awaited by the current packet. */
  cache(frame: CachedFrame<T>) {
    const accepted = this.store.put(frame);
    this.pinAvailable();
    return accepted;
  }
  request(sceneKey: string, timelineFrame: number, needs: readonly FrameNeed[]): FrameTicket {
    if (this.closed) throw new Error('Frame controller closed');
    if (!sceneKey || !Number.isSafeInteger(timelineFrame) || timelineFrame < 0
      || new Set(needs.map(n => n.slot)).size !== needs.length
      || needs.some(n => !n.slot || !n.sourceKey || !Number.isSafeInteger(n.timeUs))) throw new Error('Invalid frame request');
    const ticket = Object.freeze({generation: this.generation, serial: ++this.serial, sceneKey, timelineFrame,
      needs: Object.freeze(needs.map(n => Object.freeze({...n})))});
    this.releasePending();
    this.current = ticket;
    this.reserving = true;
    this.pinAvailable();
    return ticket;
  }
  isCurrent(ticket: FrameTicket) { return !this.closed && ticket === this.current; }
  /** Old seeks cannot inject newly decoded resources; same-generation lookahead may cache. */
  offer(ticket: FrameTicket, frame: CachedFrame<T>) {
    if (this.closed || ticket.generation !== this.generation
      || !ticket.needs.some(n => n.sourceKey === frame.sourceKey)) { frame.release(); return false; }
    return this.cache(frame);
  }
  acquire(ticket: FrameTicket): FramePacket<T> | null {
    if (!this.isCurrent(ticket)) return null;
    const leases: FrameLease<T>[] = [], frames = new Map<string, Readonly<CachedFrame<T>>>();
    for (const need of ticket.needs) {
      const lease = this.store.acquire(need.sourceKey,need.timeUs);
      if (!lease) { for (const held of leases) held.release(); return null; }
      leases.push(lease); frames.set(need.slot,lease.frame);
    }
    let released = false;
    const packet: FramePacket<T> = {ticket, frames, release: () => {
      if (released) return;
      released = true; this.packets.delete(packet);
      for (const lease of leases) lease.release();
    }};
    this.packets.add(packet);
    return packet;
  }
  /** Call immediately before synchronous GPU command submission; async preparation is outside. */
  submit(packet: FramePacket<T>, draw: (frames: FramePacket<T>['frames']) => void): boolean {
    try {
      if (!this.packets.has(packet) || !this.isCurrent(packet.ticket)) return false;
      draw(packet.frames);
      return true;
    } finally { packet.release(); this.finish(packet.ticket); }
  }
  close() { this.closed = true; this.invalidatePending(); this.store.close(); }
}
