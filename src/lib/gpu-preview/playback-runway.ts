/**
 * How many finished pictures playback holds for before it starts or resumes, so that it can then
 * play through without stopping again.
 *
 * The producer makes pictures at `producedFps` (measured) while playback consumes them at
 * `consumedFps` (frame rate × playback rate). Playing `horizonFrames` takes horizon / consumed
 * seconds, during which the producer adds horizon × produced / consumed pictures; the runway
 * covers the rest, with a safety margin. A producer at least as fast as playback needs only the
 * minimum runway. The display buffer bounds the runway: when even a full buffer cannot cover the
 * horizon, playback runs the buffer down and holds again once, a buffer later.
 */
export type PlaybackRunwayInput = {
  /** Pictures the producer finishes per second of its own work; null before it is measured. */
  producedFps: number | null;
  /** Frame rate × playback rate. */
  consumedFps: number;
  /** Frames playback should get through without stopping (to the end of the timeline, capped). */
  horizonFrames: number;
  /** Smallest runway (Play's startup runway). */
  minFrames: number;
  /** Largest runway the display buffer can hold. */
  capacity: number;
};

/** Extra runway over the measured deficit: production time varies frame to frame. */
export const RUNWAY_MARGIN = 1.25;
/** How far ahead a runway plans; a longer stretch is covered by a later, single hold. */
export const RUNWAY_HORIZON_SECONDS = 20;

export function playbackRunwayFrames({ producedFps, consumedFps, horizonFrames, minFrames, capacity }: PlaybackRunwayInput): number {
  const most = Math.max(1, Math.floor(capacity));
  const least = Math.max(1, Math.min(most, Math.ceil(minFrames)));
  const horizon = Math.max(0, Math.floor(horizonFrames));
  if (!(consumedFps > 0) || horizon <= least) return Math.min(least, Math.max(1, horizon));
  // Unmeasured: the minimum runway; its own pictures measure the producer for the next decision.
  if (producedFps == null || producedFps >= consumedFps) return least;
  const deficit = 1 - Math.max(0, producedFps) / consumedFps;
  return Math.min(most, horizon, Math.max(least, Math.ceil(horizon * deficit * RUNWAY_MARGIN)));
}

/**
 * Measured producer throughput: pictures per second of production time over the latest
 * sequential pictures, without the slowest tenth (the first pictures after a seek wait for
 * decoders to start at a key frame, which steady playback does not). Speculative (out-of-order)
 * pictures are not counted; they are not what playback waits for.
 */
export class ProductionRate {
  private samples: number[] = [];
  constructor(private readonly window = 30, private readonly minimum = 5) {}
  record(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
    if (this.samples.length > this.window) this.samples.shift();
  }
  /** Null until enough pictures were measured. */
  get fps(): number | null {
    if (this.samples.length < this.minimum) return null;
    const kept = [...this.samples].sort((x, y) => x - y).slice(0, this.samples.length - Math.floor(this.samples.length / 10));
    const total = kept.reduce((sum, ms) => sum + ms, 0);
    return total > 0 ? kept.length * 1000 / total : Infinity;
  }
  clear() { this.samples = []; }
}
