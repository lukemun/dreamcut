/**
 * Preview playback transport.
 *
 * Playback time comes from an anchored clock (`performance.now()` by default), or
 * from the session's media/audio clock when one is supplying time. Painting never
 * owns time: animation frames only present the current transport position, and a
 * transport timer keeps position, listeners and the end of the timeline moving when
 * the page gets no animation frames (occluded or embedded panes, a busy GPU). Both
 * drivers call the same idempotent `advance`, so a late paint simply catches up.
 */

/** Longest interval between transport commits when no animation frame arrives. */
export const TRANSPORT_HEARTBEAT_MS = 100;
/**
 * How far (wall-clock ms) the picture may trail running time, above rate 1, before playback waits
 * for it. Picture behind sound becomes detectable from about 45 ms (ITU-R BT.1359).
 */
export const MAX_PICTURE_LAG_MS = 40;

/** Anchored playback clock: position = anchor + elapsed × fps × rate while running. */
export class TransportClock {
  private anchorFrame = 0;
  private anchorTime = 0;
  private running = false;
  constructor(private fps: number, private rate = 1) {}
  /** Starts (or re-anchors) running time at `frame`. */
  start(frame: number, now: number) { this.anchorFrame = frame; this.anchorTime = now; this.running = true; }
  /** Freezes at the current position. */
  stop(now: number) { this.anchorFrame = this.position(now); this.anchorTime = now; this.running = false; }
  /** Changes timing without a jump in position. */
  retime(fps: number, rate: number, now: number) { this.anchorFrame = this.position(now); this.anchorTime = now; this.fps = fps; this.rate = rate; }
  isRunning() { return this.running; }
  position(now: number) {
    return this.running ? this.anchorFrame + Math.max(0, now - this.anchorTime) * this.fps * this.rate / 1000 : this.anchorFrame;
  }
  /** Milliseconds until the running clock reaches `frame` (Infinity while stopped). */
  msUntil(frame: number, now: number) {
    return this.running ? Math.max(0, (frame - this.position(now)) * 1000 / (this.fps * this.rate)) : Infinity;
  }
}

export type TransportScheduler = {
  now(): number;
  requestPaint(callback: (now: number) => void): number;
  cancelPaint(handle: number): void;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
};

export const browserTransportScheduler: TransportScheduler = {
  now: () => performance.now(),
  requestPaint: callback => requestAnimationFrame(callback),
  cancelPaint: handle => cancelAnimationFrame(handle),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type TransportEvent = "frameupdate" | "seeked" | "ratechange" | "play" | "pause" | "ended" | "waiting" | "resume";

/** What the transport needs from its player and frame session. */
export type TransportHost = {
  fps(): number;
  durationInFrames(): number;
  /** Playback is refused (preview warning); the transport stops. */
  blocked(): boolean;
  /** Pictures or audio are not ready; time holds at the committed frame. */
  buffering(): boolean;
  /** True when the only thing not ready is the picture still being prepared (no media is waiting). */
  pictureOnlyBuffering?(): boolean;
  /** Startup check: whether play should immediately report waiting. */
  bufferingAtStart(): boolean;
  /** The media/audio clock in composition frames, or null when none is supplying time. */
  mediaClock(): number | null;
  /** True when the session failed; the host reports it and the transport pauses. */
  failed(): boolean;
  /** Keeps decoder followers aligned even when the frame does not change. */
  syncMedia(): void;
  /** Hands a frame to the presenter (canvas renderer or React tree). */
  present(frame: number, epoch: number, playing: boolean): void;
  /** Commits a frame to the React tree; `now` lets the host throttle. */
  commitUi(frame: number, now: number, force: boolean): void;
  setPlaying(playing: boolean): void;
  setBuffering(buffering: boolean): void;
  setRate(rate: number): void;
  emit(name: TransportEvent, detail?: unknown): void;
};

export class PlaybackTransport {
  frame = 0;
  playing = false;
  rate = 1;
  /** Bumped by seeks, rate changes and play so presenters drop stale work. */
  epoch = 0;
  private waiting = false;
  /** The frame shown when the picture was last ready; null until it is ready after Play or a seek. */
  private pictureReadyFrame: number | null = null;
  private paintHandle: number | null = null;
  private timerHandle: unknown = null;
  private readonly clock: TransportClock;
  constructor(private readonly host: TransportHost, private readonly scheduler: TransportScheduler = browserTransportScheduler, private readonly heartbeatMs = TRANSPORT_HEARTBEAT_MS) {
    this.clock = new TransportClock(host.fps());
  }

  play() {
    if (this.host.blocked() || this.playing) return;
    if (this.frame >= this.host.durationInFrames() - 1) { this.frame = 0; this.host.commitUi(0, this.scheduler.now(), true); }
    this.epoch++;
    this.playing = true;
    this.pictureReadyFrame = null;
    this.host.setPlaying(true);
    this.host.present(this.frame, this.epoch, true);
    this.host.emit("play");
    this.waiting = this.host.bufferingAtStart();
    if (this.waiting) { this.host.setBuffering(true); this.host.emit("waiting"); }
    const now = this.scheduler.now();
    this.clock.retime(this.host.fps(), this.rate, now);
    this.clock.start(this.frame, now);
    this.schedule();
  }

  pause() {
    const now = this.scheduler.now();
    this.stopDrivers();
    this.clock.stop(now);
    this.playing = false;
    this.waiting = false;
    this.pictureReadyFrame = null;
    this.host.setPlaying(false);
    this.host.setBuffering(false);
    this.host.commitUi(this.frame, now, true);
    this.host.present(this.frame, this.epoch, false);
    this.host.emit("pause");
  }

  seek(value: number) {
    if (!Number.isFinite(value)) return;
    this.epoch++;
    const next = Math.max(0, Math.min(this.host.durationInFrames() - 1, Math.round(value)));
    const now = this.scheduler.now();
    this.frame = next;
    this.pictureReadyFrame = null;
    if (this.playing) this.clock.start(next, now);
    this.host.commitUi(next, now, true);
    this.host.present(next, this.epoch, this.playing);
    this.host.emit("seeked", { frame: next });
    this.host.emit("frameupdate", { frame: next });
    if (this.playing) this.schedule();
  }

  setRate(value: number) {
    if (!Number.isFinite(value) || !(value > 0)) throw new Error("Playback rate must be positive");
    this.epoch++;
    this.rate = value;
    const now = this.scheduler.now();
    this.clock.retime(this.host.fps(), value, now);
    if (this.playing) this.clock.start(this.frame, now);
    this.host.setRate(value);
    this.host.present(this.frame, this.epoch, this.playing);
    this.host.emit("ratechange", { playbackRate: value });
    if (this.playing) this.schedule();
  }

  /** Re-reads fps after the composition changes it. */
  retime() { this.clock.retime(this.host.fps(), this.rate, this.scheduler.now()); }

  /** Brings the committed frame up to transport time. Returns false once playback stops. */
  advance(now = this.scheduler.now()): boolean {
    if (!this.playing) return false;
    if (this.host.blocked()) { this.stopDrivers(); return false; }
    if (this.host.failed()) { this.pause(); return false; }
    this.host.syncMedia();
    const blocked = this.resolveBuffering(now);
    if (blocked !== this.waiting) {
      this.waiting = blocked;
      this.host.setBuffering(blocked);
      this.host.emit(blocked ? "waiting" : "resume");
    }
    // Waiting holds time at the committed frame; it resumes from there.
    if (blocked) { this.clock.start(this.frame, now); return true; }
    const duration = this.host.durationInFrames();
    const media = this.host.mediaClock();
    let raw: number;
    if (media != null && Number.isFinite(media)) {
      // The media clock never moves the picture backwards. Following it keeps the
      // anchored clock continuous if that media later stops supplying time.
      const position = Math.max(this.frame, media);
      this.clock.start(position, now);
      raw = Math.floor(position);
    } else {
      raw = Math.floor(this.clock.position(now));
    }
    const next = Math.min(duration - 1, Math.max(this.frame, raw));
    if (next !== this.frame) {
      this.frame = next;
      this.host.present(next, this.epoch, true);
      this.host.commitUi(next, now, next === duration - 1);
      this.host.emit("frameupdate", { frame: next });
    }
    // The last frame keeps its own interval before the ended event.
    if (raw >= duration) { this.pause(); this.host.emit("ended"); return false; }
    return true;
  }

  dispose() { this.stopDrivers(); }

  /**
   * Media that is not ready holds time at once. Above rate 1, a picture still being prepared may
   * trail running time by up to MAX_PICTURE_LAG_MS before time holds for it: holding for each
   * late picture paused all sound for tens of milliseconds several times a second at 2×. At rate 1
   * and below every late picture still holds at once, as do the first picture after Play or a
   * seek and a wait already in progress (Play's runway).
   */
  private resolveBuffering(now: number) {
    if (!this.host.buffering()) { this.pictureReadyFrame = this.frame; return false; }
    if (this.waiting || this.rate <= 1 || this.pictureReadyFrame == null || !this.host.pictureOnlyBuffering?.()) return true;
    const media = this.host.mediaClock();
    const position = Math.max(this.frame, media != null && Number.isFinite(media) ? media : this.clock.position(now));
    // The shown frame is correct until the next one is due; lag is time past that.
    const lagMs = (position - (this.pictureReadyFrame + 1)) * 1000 / (this.host.fps() * this.rate);
    return lagMs > MAX_PICTURE_LAG_MS;
  }

  private schedule() {
    this.stopDrivers();
    const paint = (now: number) => {
      this.paintHandle = null;
      if (this.advance(now)) this.paintHandle = this.scheduler.requestPaint(paint);
    };
    const tick = () => {
      this.timerHandle = null;
      if (this.advance(this.scheduler.now())) this.timerHandle = this.scheduler.setTimer(tick, this.nextTimerMs());
    };
    this.paintHandle = this.scheduler.requestPaint(paint);
    this.timerHandle = this.scheduler.setTimer(tick, this.nextTimerMs());
  }

  /** The heartbeat, or sooner when the running clock reaches the end of the timeline. */
  private nextTimerMs() {
    const untilEnd = this.clock.msUntil(this.host.durationInFrames(), this.scheduler.now());
    return Math.max(1, Math.min(this.heartbeatMs, Math.ceil(untilEnd)));
  }

  private stopDrivers() {
    if (this.paintHandle != null) { this.scheduler.cancelPaint(this.paintHandle); this.paintHandle = null; }
    if (this.timerHandle != null) { this.scheduler.clearTimer(this.timerHandle); this.timerHandle = null; }
  }
}
