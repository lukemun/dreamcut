/** A two-ended media fragment is a playback window; a lone start remains a poster hint. */
export function previewWindow(source: string): { start: number; end: number } | null {
  const match = /#t=([\d.]+),([\d.]+)$/.exec(source);
  if (!match) return null;
  const start = Number(match[1]), end = Number(match[2]);
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start ? { start, end } : null;
}

/** Keeps gallery, detail and full-view players on the same marked reference interval. */
export function bindPreviewWindow(video: HTMLVideoElement, interval: ReturnType<typeof previewWindow>, loop: boolean) {
  if (!interval) return () => {};
  const bounds = () => ({ start: Math.min(interval.start, Number.isFinite(video.duration) ? Math.max(0, video.duration - .001) : interval.start), end: Math.min(interval.end, video.duration || interval.end) });
  const seekStart = () => { video.currentTime = bounds().start; };
  const constrain = (lead = 0) => {
    const { start, end } = bounds();
    if (video.currentTime < start) video.currentTime = start;
    else if (video.currentTime >= end - lead) {
      if (loop) video.currentTime = start;
      else { video.pause(); video.currentTime = Math.max(start, end - .001); }
    }
  };
  const ended = () => { if (loop) { seekStart(); void video.play().catch(() => {}); } };
  let frame = 0;
  const cancelFrame = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  // timeupdate can be hundreds of milliseconds apart. Check each display frame while
  // playing, leaving one refresh interval to seek before the next source frame appears.
  const tick = () => {
    frame = 0;
    if (video.paused) return;
    constrain(Math.min((bounds().end - bounds().start) / 2, Math.abs(video.playbackRate || 1) / 60));
    if (!video.paused) frame = requestAnimationFrame(tick);
  };
  const startFrames = () => {
    constrain();
    if (typeof requestAnimationFrame !== 'undefined' && !frame) frame = requestAnimationFrame(tick);
  };
  const constrainEvent = () => constrain();
  video.addEventListener('pause', cancelFrame);
  video.addEventListener('loadedmetadata', seekStart);
  video.addEventListener('timeupdate', constrainEvent);
  video.addEventListener('seeking', constrainEvent);
  video.addEventListener('play', startFrames);
  video.addEventListener('ended', ended);
  if (video.readyState >= 1) constrain();
  if (!video.paused) startFrames();
  return () => {
    cancelFrame();
    video.removeEventListener('pause', cancelFrame);
    video.removeEventListener('loadedmetadata', seekStart);
    video.removeEventListener('timeupdate', constrainEvent);
    video.removeEventListener('seeking', constrainEvent);
    video.removeEventListener('play', startFrames);
    video.removeEventListener('ended', ended);
  };
}
