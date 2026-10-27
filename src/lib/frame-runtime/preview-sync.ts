/** Preview may correct drift; it must not chase the decoder with repeated seeks. */
export const PREVIEW_SEEK_COOLDOWN_MS = 250;
/** A newly mounted decoder reports NaN duration until loadedmetadata. Keep the
 * authored target available while waiting; metadata readiness still gates seeks. */
export function previewTargetTime(time: number, trim: number, duration: number): number {
  const end = Number.isFinite(duration) ? Math.max(0, duration - .00001) : Infinity;
  return Math.max(trim, Math.min(time, end));
}
export function shouldSeekPreview(input: {
  currentTime: number; target: number; rate: number; tolerance: number;
  playing: boolean; seeking: boolean; ready: boolean; explicitSeek: boolean;
  now: number; lastSeekAt: number;
  clockOwner?: boolean;
}) {
  if (!input.ready || input.seeking || !Number.isFinite(input.target)) return false;
  const drift = Math.abs(input.currentTime - input.target);
  if (!input.playing || input.explicitSeek) return drift > .000001;
  // The timeline follows this audible decoder. Seeking it toward the rounded
  // frame it just produced creates a self-correction/buffering feedback loop.
  if (input.clockOwner) return false;
  // Tolerance is measured on the timeline, not in accelerated source seconds.
  return drift / Math.max(.01, input.rate) > input.tolerance
    && input.now - input.lastSeekAt >= PREVIEW_SEEK_COOLDOWN_MS;
}

/** Silent picture follows the audible clock with small rate corrections. Seeking
 * for every small error repeatedly restarts native decoder/audio preroll. */
export function previewFollowerRate(baseRate: number, timelineDrift: number): number {
  const rate = Number.isFinite(baseRate) && baseRate > 0 ? Math.max(1 / 16, Math.min(16, baseRate)) : 1;
  if (!Number.isFinite(timelineDrift) || Math.abs(timelineDrift) < 1 / 60) return rate;
  return Math.max(1 / 16, Math.min(16, rate * Math.max(.5, Math.min(1.5, 1 + 4 * timelineDrift))));
}
