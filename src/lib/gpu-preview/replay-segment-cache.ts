/**
 * Replay segment cache: the first time a stretch of the cut plays, its finished delivery
 * pictures are encoded into one-second compressed segments. Replaying the same scene decodes
 * those segments instead of decoding sources and compositing again, so a second pass does not
 * buffer. Preview only: segments are lossy, belong to one worker (one scene and delivery size),
 * are cleared whenever the scene changes, and are never used for export or frame capture.
 *
 * Decoding streams a few frames ahead of the playhead and closes frames once shown; holding a
 * whole decoded second would exhaust a hardware decoder's small output-frame pool.
 */

export type ReplayFrameLike = { timestamp: number; close(): void };
export type ReplayChunkLike = { timestamp: number; byteLength: number; type: "key" | "delta" };
export type ReplayEncoderLike = {
  /** Frames waiting in the encoder; recording yields when the hardware falls behind. */
  readonly encodeQueueSize?: number;
  configure(config: VideoEncoderConfig): void;
  encode(frame: ReplayFrameLike, options: { keyFrame: boolean }): void;
  flush(): Promise<void>;
  close(): void;
};
export type ReplayDecoderLike = {
  configure(config: VideoDecoderConfig): void;
  decode(chunk: ReplayChunkLike): void;
  flush(): Promise<void>;
  close(): void;
};
export type ReplayDeps<Bitmap> = {
  createEncoder(output: (chunk: ReplayChunkLike, meta?: { decoderConfig?: VideoDecoderConfig }) => void, error: (error: unknown) => void): ReplayEncoderLike;
  createDecoder(output: (frame: ReplayFrameLike) => void, error: (error: unknown) => void): ReplayDecoderLike;
  /** A frame of the finished delivery picture, at the encoder's (even) size. */
  captureFrame(timestampUs: number, durationUs: number): ReplayFrameLike;
  /** Draw a decoded frame into the delivery surface and hand back the picture. */
  present(frame: ReplayFrameLike): Bitmap;
};
/** `skipped`: recordings dropped because the encoder fell behind; `restarted`: recordings replaced by a new stream (a seek). */
export type ReplayStats = { segments: number; bytes: number; hits: number; recorded: number; failures: number; skipped: number; restarted: number;
  /** The latest restarts: [new frame, frame the abandoned recording expected next]. */
  restarts: Array<[number, number]> };

/** `first`: the segment's key frame. A stretch that started playing mid-second is kept from where it started. */
type Segment = { first: number; chunks: ReplayChunkLike[]; bytes: number; decoderConfig: VideoDecoderConfig; used: number };
type Recording = { segment: number; first: number; next: number; end: number; encoder: ReplayEncoderLike; chunks: ReplayChunkLike[]; bytes: number; decoderConfig?: VideoDecoderConfig; failed: boolean };
type Cursor = {
  segment: number; decoder: ReplayDecoderLike; fed: number; flushed: boolean; failed: boolean;
  /** Lowest frame this pass can still deliver; earlier frames were shown and released. */
  floor: number;
  frames: Map<number, ReplayFrameLike>; waiters: Set<() => void>;
};

/** A segment is skipped (not playback slowed) when this many frames wait for the encoder. */
const MAX_ENCODE_QUEUE = 8;
/** Frames the decoder is kept ahead of the playhead. */
const DECODE_AHEAD = 4;
/** How long a wanted frame may take after all of its inputs were queued before flushing. */
const OUTPUT_WAIT_MS = 120;

export class GpuReplaySegmentCache<Bitmap> {
  readonly segmentFrames: number;
  private readonly usPerFrame: number;
  private segments = new Map<number, Segment>();
  private recording: Recording | null = null;
  /** Complete recordings whose encoder is still flushing, by segment. */
  private finishing = new Map<number, Recording>();
  private cursors = new Map<number, Cursor>();
  private epoch = 0;
  private tick = 0;
  private bytesStored = 0;
  private hits = 0;
  private recorded = 0;
  private failures = 0;
  private skipped = 0;
  private restarted = 0;
  private restarts: Array<[number, number]> = [];

  constructor(
    private readonly fps: number,
    private readonly encoderConfig: VideoEncoderConfig,
    private readonly budgetBytes: number,
    private readonly deps: ReplayDeps<Bitmap>,
  ) {
    this.segmentFrames = Math.max(1, Math.round(fps));
    this.usPerFrame = 1_000_000 / fps;
  }

  get stats(): ReplayStats {
    return { segments: this.segments.size, bytes: this.bytesStored, hits: this.hits, recorded: this.recorded, failures: this.failures, skipped: this.skipped, restarted: this.restarted, restarts: [...this.restarts] };
  }

  has(frame: number) { const stored = this.segments.get(Math.floor(frame / this.segmentFrames)); return Boolean(stored && frame >= stored.first); }

  /**
   * Offer a freshly composited playback frame, in playing order (the caller never offers
   * speculative pictures). Consecutive frames are kept per one-second segment, from the
   * segment's start or from wherever playback started inside it; a frame that does not continue
   * the recording in progress (after a seek) starts a new one there.
   */
  record(frame: number, durationFrames: number) {
    const segment = Math.floor(frame / this.segmentFrames);
    const stored = this.segments.get(segment);
    const extending = this.recording?.segment === segment && this.recording.next === frame && !this.recording.failed;
    if (stored && stored.first <= frame && !(extending && this.recording!.first < stored.first)) {
      // Already kept; a recording that was heading here has nothing left to add.
      if (this.recording?.segment === segment) this.abandon(this.recording);
      return;
    }
    const start = segment * this.segmentFrames;
    const end = Math.min(start + this.segmentFrames, durationFrames);
    if (end <= frame) return;
    let recording = this.recording;
    // A picture made again (its first copy was superseded before it was shown) is already recorded,
    // also while the second it belongs to is still being flushed.
    if (recording && !recording.failed && recording.segment === segment && frame >= recording.first && frame < recording.next) return;
    const flushing = this.finishing.get(segment);
    if (flushing && frame >= flushing.first) return;
    if (!recording || recording.failed || recording.segment !== segment || frame !== recording.next) {
      if (recording && !recording.failed) {
        this.restarted++;
        this.restarts.push([frame, recording.next]);
        if (this.restarts.length > 8) this.restarts.shift();
      }
      recording = this.begin(segment, frame, end);
      if (!recording) return;
    }
    if ((recording.encoder.encodeQueueSize ?? 0) > MAX_ENCODE_QUEUE) { this.skipped++; this.abandon(recording); return; }
    let captured: ReplayFrameLike | null = null;
    try {
      captured = this.deps.captureFrame(Math.round(frame * this.usPerFrame), Math.round(this.usPerFrame));
      recording.encoder.encode(captured, { keyFrame: frame === recording.first });
    } catch {
      this.abandon(recording);
      return;
    } finally {
      captured?.close();
    }
    recording.next++;
    if (recording.next === recording.end) {
      // Hand off before the asynchronous flush so the next segment can start recording at once.
      this.recording = null;
      void this.finish(recording);
    }
  }

  /** The cached picture for `frame`, or null when this stretch has not been recorded. */
  async take(frame: number): Promise<Bitmap | null> {
    const segment = Math.floor(frame / this.segmentFrames);
    const stored = this.segments.get(segment);
    if (!stored || frame < stored.first) return null;
    stored.used = ++this.tick;
    const epoch = this.epoch;
    try {
      const decoded = await this.frameFor(segment, frame, epoch);
      if (!decoded || epoch !== this.epoch) return null;
      const bitmap = this.deps.present(decoded);
      this.hits++;
      this.prepareNext(segment, frame);
      return bitmap;
    } catch {
      this.dropSegment(segment);
      return null;
    }
  }

  /** The scene changed: every recorded picture is stale. */
  clear() {
    this.epoch++;
    this.finishing.clear();
    if (this.recording) this.abandon(this.recording);
    for (const segment of [...this.cursors.keys()]) this.closeCursor(segment);
    this.segments.clear();
    this.bytesStored = 0;
  }

  close() { this.clear(); }

  private begin(segment: number, first: number, end: number): Recording | null {
    if (this.recording) this.abandon(this.recording);
    const recording: Recording = { segment, first, next: first, end, chunks: [], bytes: 0, failed: false, encoder: undefined as unknown as ReplayEncoderLike };
    try {
      recording.encoder = this.deps.createEncoder((chunk, meta) => {
        if (meta?.decoderConfig && !recording.decoderConfig) recording.decoderConfig = meta.decoderConfig;
        recording.chunks.push(chunk);
        recording.bytes += chunk.byteLength;
      }, () => { recording.failed = true; });
      recording.encoder.configure(this.encoderConfig);
      this.recording = recording;
      return recording;
    } catch {
      this.failures++;
      this.recording = null;
      return null;
    }
  }

  private abandon(recording: Recording) {
    recording.failed = true;
    try { recording.encoder?.close(); } catch { /* Already closed. */ }
    if (this.recording === recording) this.recording = null;
  }

  private async finish(recording: Recording) {
    const epoch = this.epoch;
    this.finishing.set(recording.segment, recording);
    try { await recording.encoder.flush(); } catch { recording.failed = true; }
    finally { if (this.finishing.get(recording.segment) === recording) this.finishing.delete(recording.segment); }
    try { recording.encoder.close(); } catch { /* Already closed. */ }
    const frames = recording.end - recording.first;
    if (recording.failed || epoch !== this.epoch || !recording.decoderConfig || recording.chunks.length !== frames || recording.chunks[0]?.type !== "key") {
      if (recording.failed) this.failures++;
      return;
    }
    // A longer recording of the same second (one that started earlier) replaces a shorter one.
    const existing = this.segments.get(recording.segment);
    if (existing && existing.first <= recording.first) return;
    if (existing) this.dropSegment(recording.segment);
    this.segments.set(recording.segment, { first: recording.first, chunks: recording.chunks, bytes: recording.bytes, decoderConfig: recording.decoderConfig, used: ++this.tick });
    this.bytesStored += recording.bytes;
    this.recorded++;
    this.evict();
  }

  private evict() {
    while (this.bytesStored > this.budgetBytes && this.segments.size > 1) {
      let oldest: number | null = null, oldestUsed = Infinity;
      for (const [index, segment] of this.segments) if (segment.used < oldestUsed) { oldest = index; oldestUsed = segment.used; }
      if (oldest == null) return;
      this.dropSegment(oldest);
    }
  }

  private dropSegment(segment: number) {
    const stored = this.segments.get(segment);
    if (stored) { this.segments.delete(segment); this.bytesStored -= stored.bytes; }
    this.closeCursor(segment);
  }

  private cursorFor(segment: number, frame: number): Cursor {
    const existing = this.cursors.get(segment);
    // Decoding only moves forward from a key frame; an earlier frame needs a fresh pass.
    if (existing && !existing.failed && frame >= existing.floor) return existing;
    if (existing) this.closeCursor(segment);
    const stored = this.segments.get(segment)!;
    const cursor: Cursor = { segment, fed: 0, flushed: false, failed: false, floor: stored.first, frames: new Map(), waiters: new Set(), decoder: undefined as unknown as ReplayDecoderLike };
    cursor.decoder = this.deps.createDecoder(decoded => {
      const index = Math.round(decoded.timestamp / this.usPerFrame);
      if (cursor.failed || this.cursors.get(segment) !== cursor || index < cursor.floor) { decoded.close(); return; }
      cursor.frames.get(index)?.close();
      cursor.frames.set(index, decoded);
      for (const wake of cursor.waiters) wake();
    }, () => { cursor.failed = true; for (const wake of cursor.waiters) wake(); });
    cursor.decoder.configure({ ...stored.decoderConfig, optimizeForLatency: true });
    this.cursors.set(segment, cursor);
    // Keep at most the playing segment and the one after it.
    for (const other of [...this.cursors.keys()]) if (other !== segment && other !== segment + 1 && other !== segment - 1) this.closeCursor(other);
    return cursor;
  }

  private feed(cursor: Cursor, throughOffset: number) {
    const stored = this.segments.get(cursor.segment);
    if (!stored) return;
    const limit = Math.min(stored.chunks.length, throughOffset + 1);
    while (cursor.fed < limit) cursor.decoder.decode(stored.chunks[cursor.fed++]);
    if (cursor.fed === stored.chunks.length && !cursor.flushed) {
      cursor.flushed = true;
      // The last frames of a stream only leave the decoder on flush; nothing follows it.
      void cursor.decoder.flush().catch(() => { cursor.failed = true; }).finally(() => { for (const wake of cursor.waiters) wake(); });
    }
  }

  private async frameFor(segment: number, frame: number, epoch: number): Promise<ReplayFrameLike | null> {
    const offset = frame - this.segments.get(segment)!.first;
    const cursor = this.cursorFor(segment, frame);
    // Frames before this one have been shown; release them so the decoder can keep going.
    cursor.floor = frame;
    for (const [index, decoded] of cursor.frames) if (index < frame) { decoded.close(); cursor.frames.delete(index); }
    this.feed(cursor, offset + DECODE_AHEAD);
    const deadline = Date.now() + 2000;
    while (!cursor.frames.has(frame)) {
      if (cursor.failed || epoch !== this.epoch || this.cursors.get(segment) !== cursor) return null;
      if (Date.now() > deadline) throw Error("Replay segment decode timed out");
      await new Promise<void>(resolve => {
        const wake = () => { cursor.waiters.delete(wake); clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          cursor.waiters.delete(wake);
          // Inputs are queued but the decoder is holding output: drain it by finishing the stream.
          const stored = this.segments.get(segment);
          if (stored) this.feed(cursor, stored.chunks.length - 1);
          resolve();
        }, OUTPUT_WAIT_MS);
        cursor.waiters.add(wake);
      });
    }
    const decoded = cursor.frames.get(frame)!;
    return decoded;
  }

  private prepareNext(segment: number, frame: number) {
    const start = segment * this.segmentFrames;
    const cursor = this.cursors.get(segment), first = this.segments.get(segment)?.first ?? start;
    if (cursor) this.feed(cursor, frame - first + DECODE_AHEAD);
    // Warm the next segment's decoder shortly before the boundary.
    const next = segment + 1, upcoming = this.segments.get(next);
    if (frame >= start + this.segmentFrames - DECODE_AHEAD && upcoming && upcoming.first === next * this.segmentFrames && !this.cursors.has(next)) {
      const warmed = this.cursorFor(next, upcoming.first);
      this.feed(warmed, DECODE_AHEAD - 1);
    }
  }

  private closeCursor(segment: number) {
    const cursor = this.cursors.get(segment);
    if (!cursor) return;
    this.cursors.delete(segment);
    cursor.failed = true;
    for (const decoded of cursor.frames.values()) decoded.close();
    cursor.frames.clear();
    try { cursor.decoder.close(); } catch { /* Already closed. */ }
    for (const wake of cursor.waiters) wake();
  }
}

/** Encoder candidates, most efficient first. The cache is off when none is supported. */
export async function chooseReplayEncoderConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") return null;
  const bitrate = Math.round(width * height * fps * 0.12);
  const base = { width, height, bitrate, framerate: fps, latencyMode: "realtime" as const };
  const candidates: VideoEncoderConfig[] = [
    // Software H.264 first: creating the first hardware encoder holds back every decoder created
    // in the next ~5 s on macOS, which froze the first scrub or the start of playback. Software
    // encoding kept 1080p playback unchanged (pnpm benchmark:gpu-seeks, 2026-10-10).
    { ...base, codec: "avc1.640034", avc: { format: "avc" }, hardwareAcceleration: "prefer-software" },
    { ...base, codec: "vp09.00.41.08", hardwareAcceleration: "prefer-hardware" },
    { ...base, codec: "vp8" },
  ];
  for (const config of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return support.config ?? config;
    } catch { /* Try the next codec. */ }
  }
  return null;
}

/** H.264 and VP9 need even dimensions; segments are encoded at this size and scaled back. */
export function replayEncodeSize(width: number, height: number) {
  return { width: Math.max(2, width - (width % 2)), height: Math.max(2, height - (height % 2)) };
}
