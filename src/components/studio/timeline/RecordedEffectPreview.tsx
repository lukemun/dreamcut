'use client';
import { useEffect, useRef, type SyntheticEvent } from 'react';
import manifest from '../../../../public/inspector-previews/manifest.json';

let activePreview: HTMLVideoElement | null = null;
function reset(video: HTMLVideoElement) {
  video.pause();
  if (activePreview === video) activePreview = null;
  // A poster shows the effect in action; after a preview has played, reloading brings it back instead of frame 0.
  if (video.poster && video.played.length) { video.load(); return; }
  // Without a poster, a `#t=` fragment names the still to rest on (where the effect shows), not frame 0.
  const start = Number(/#t=([\d.]+)/.exec(video.getAttribute?.('src') ?? '')?.[1] ?? 0);
  try { video.currentTime = start; } catch { /* Poster remains visible before metadata loads. */ }
}
function start(event: SyntheticEvent<HTMLElement>) {
  if (event.currentTarget.matches(':disabled')) return;
  const video = event.currentTarget.querySelector<HTMLVideoElement>('video[data-inspector-preview]');
  if (!video) return;
  if (activePreview && activePreview !== video) reset(activePreview);
  activePreview = video;
  void video.play().then(() => { if (activePreview !== video) reset(video); }).catch(() => reset(video));
}
function stop(event: SyntheticEvent<HTMLElement>) {
  const video = event.currentTarget.querySelector<HTMLVideoElement>('video[data-inspector-preview]');
  if (video) reset(video);
}
/** Preview is read-only. Clicking the enclosing control still owns selection/application. */
export const recordedPreviewEvents = { onPointerEnter: start, onPointerLeave: stop, onFocus: start, onBlur: stop };

/** `gallery` lets MediaGallery read the example's natural shape: it marks the video and loads its metadata. */
export function RecordedEffectPreview({ name, src, poster, className, style, controls = false, label, loop = true, gallery = false }: { name?: string; src?: string; poster?: string; className?: string; style?: React.CSSProperties; controls?: boolean; label?: string; loop?: boolean; gallery?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const recording = manifest.entries.find(entry => entry.name === name);
  const mediaSource = src ?? `/inspector-previews/${name}.mp4?v=${recording?.video_sha256.slice(0, 12) ?? 'unversioned'}`;
  const mediaPoster = poster ?? (name ? `/inspector-previews/${name}.jpg?v=${recording?.poster_sha256.slice(0, 12) ?? 'unversioned'}` : undefined);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const stop = () => { if (loop) reset(video); else video.pause(); };
    const visibility = () => { if (document.hidden) stop(); };
    const observer = new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting) stop(); });
    observer.observe(video);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => { observer.disconnect(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility); stop(); };
  }, [mediaSource, loop]);
  return <video ref={ref} data-inspector-preview data-media-preview={gallery || undefined} aria-hidden={label ? undefined : true} aria-label={label} controls={controls} muted={loop} loop={loop} playsInline preload={(poster || name) && !gallery ? "none" : "metadata"}
    poster={mediaPoster} src={mediaSource}
    className={className ?? "mx-auto block h-28 w-auto max-w-full rounded object-contain"} style={style} />;
}
