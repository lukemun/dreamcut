/** Pure recovery policy for a paused decoder whose load has stopped progressing.
 * This never grants readiness. The adapter reloads at most once per target episode;
 * actual media readiness still controls playback. Network downloads are left alone.
 */
export type RecoveryObservation = {
  source: string; target: number; readyState: number; networkState: number;
  paused: boolean; seeking: boolean; ended: boolean; bufferedEnd: number;
};
export class MediaRecovery {
  private episode = '';
  private progress = '';
  private changedAt = 0;
  private retried = false;
  observe(value: RecoveryObservation, now: number): boolean {
    const episode = `${value.source}:${Math.round(value.target * 1000)}`;
    if (episode !== this.episode) {
      this.episode = episode; this.progress = ''; this.changedAt = now; this.retried = false;
    }
    if (value.readyState >= 3 || value.ended || !value.paused) {
      this.progress = ''; this.changedAt = now; this.retried = false;
      return false;
    }
    const progress = `${value.readyState}:${value.networkState}:${value.seeking}:${value.bufferedEnd}`;
    if (progress !== this.progress) { this.progress = progress; this.changedAt = now; }
    // An unfinished seek can itself wedge after all bytes are buffered. Give
    // active seeks a longer grace period, then recover an idle stuck seek too.
    const graceMs = value.seeking ? 4000 : 2000;
    if (this.retried || value.networkState !== 1 || now - this.changedAt < graceMs) return false;
    this.retried = true;
    return true;
  }
}

export function observeMediaRecovery(media: HTMLMediaElement, target: number): RecoveryObservation {
  return { source: media.currentSrc || media.src, target, readyState: media.readyState,
    networkState: media.networkState, paused: media.paused, seeking: media.seeking,
    ended: media.ended, bufferedEnd: media.buffered.length ? media.buffered.end(media.buffered.length - 1) : 0 };
}

/** Adapter lifetime is explicit; recovery runs even when the timeline is held.
 * Never starts playback. Metadata handlers restore the authored source target.
 */
export function watchMediaRecovery(media: HTMLMediaElement, target: () => number | null, onReload: () => void = () => {}) {
  const policy = new MediaRecovery();
  const timer = setInterval(() => {
    const sourceTime = target();
    if (sourceTime == null || !Number.isFinite(sourceTime) || media.error) return;
    if (policy.observe(observeMediaRecovery(media, sourceTime), performance.now())) {
      onReload();
      media.load();
    }
  }, 250);
  return () => clearInterval(timer);
}
