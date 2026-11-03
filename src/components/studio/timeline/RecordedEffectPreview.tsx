'use client';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { bindPreviewWindow, previewWindow } from './preview-window';
import manifest from '../../../../public/inspector-previews/manifest.json';

let activePreview: HTMLVideoElement | null = null;
function reset(video: HTMLVideoElement) {
  video.pause();
  if (activePreview === video) activePreview = null;
  // A poster shows the effect in action. Seeking would hide it for frame 0, so leave an unplayed
  // video alone; after a preview has played, reloading brings the poster back.
  if (video.poster) { if (video.played.length) video.load(); return; }
  // Without a poster, a `#t=` fragment names the still to rest on (where the effect shows), not frame 0.
  const start = Number(/#t=([\d.]+)/.exec((video.getAttribute?.('data-preview-source') ?? video.getAttribute?.('src')) ?? '')?.[1] ?? 0);
  try { video.currentTime = start; } catch { /* Poster remains visible before metadata loads. */ }
}
function start(event: SyntheticEvent<HTMLElement>) {
  if (event.currentTarget.matches(':disabled')) return;
  const video = event.currentTarget.querySelector<HTMLVideoElement>('video[data-inspector-preview]');
  if (!video || video.controls) return;
  if (activePreview && activePreview !== video) reset(activePreview);
  activePreview = video;
  // A card resting on a chosen still (`#t=`) plays the whole effect from its start, not from that still.
  if (!video.poster && /#t=[\d.]+/.test((video.getAttribute('data-preview-source') ?? video.getAttribute('src')) ?? '') && video.paused) {
    try { video.currentTime = 0; } catch { /* Plays from the still if metadata is not ready yet. */ }
  }
  void video.play().then(() => { if (activePreview !== video) reset(video); }).catch(() => reset(video));
}
function stop(event: SyntheticEvent<HTMLElement>) {
  const video = event.currentTarget.querySelector<HTMLVideoElement>('video[data-inspector-preview]');
  if (video && !video.controls) reset(video);
}
/** Preview is read-only. Clicking the enclosing control still owns selection/application. */
export const recordedPreviewEvents = { onPointerEnter: start, onPointerLeave: stop, onFocus: start, onBlur: stop };

/**
 * `gallery` loads the example's metadata so its shape is known (MediaGallery packing, the template detail layout) and marks it for MediaGallery.
 * `deferLoad` keeps a postered video unloaded until it plays (hover/focus). A grid of cards that each
 * preloaded metadata held every browser connection to the editor open at once (87 template previews),
 * so the project's own media, the GPU preview and replay all stalled behind them.
 */
/** The nearest scrolling ancestor, so a poster loads a little before it scrolls into view. */
function scrollRoot(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}

/** `posterNearView` holds the poster back until the card is near its scroller's view. Only use it
 * where the frame already has its shape, since a video takes its size from the poster: a Looks
 * panel requested all 87 posters at once and held the editor's connections while 4 were on screen. */
export function RecordedEffectPreview({ name, src, poster, className, style, controls = false, label, loop = true, gallery = false, autoPlay = false, deferLoad = false, posterNearView = false }: { name?: string; src?: string; poster?: string; className?: string; style?: React.CSSProperties; controls?: boolean; label?: string; loop?: boolean; gallery?: boolean; autoPlay?: boolean; deferLoad?: boolean; posterNearView?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [nearView, setNearView] = useState(!posterNearView);
  useEffect(() => {
    const video = ref.current;
    if (nearView || !video) return;
    if (typeof IntersectionObserver === 'undefined') { setNearView(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); setNearView(true); }
    }, { root: scrollRoot(video), rootMargin: '600px 0px' });
    observer.observe(video);
    return () => observer.disconnect();
  }, [nearView]);
  const recording = manifest.entries.find(entry => entry.name === name);
  const mediaSource = src ?? `/inspector-previews/${name}.mp4?v=${recording?.video_sha256.slice(0, 12) ?? 'unversioned'}`;
  const mediaPoster = poster ?? (name ? `/inspector-previews/${name}.jpg?v=${recording?.poster_sha256.slice(0, 12) ?? 'unversioned'}` : undefined);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const unbindWindow = bindPreviewWindow(video, previewWindow(mediaSource), loop);
    const stop = () => { if (loop && !controls) reset(video); else video.pause(); };
    const visibility = () => { if (document.hidden) stop(); };
    const observer = new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting) stop(); });
    observer.observe(video);
    if (!controls) window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => { unbindWindow(); observer.disconnect(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility); stop(); };
  }, [mediaSource, loop, controls]);
  return <video ref={ref} autoPlay={autoPlay} data-inspector-preview data-media-preview={gallery || undefined} aria-hidden={label ? undefined : true} aria-label={label} controls={controls} muted={loop} loop={loop} playsInline preload={(poster || name) && (!gallery || deferLoad) ? "none" : "metadata"}
    poster={nearView ? mediaPoster : undefined} data-preview-source={mediaSource} src={previewWindow(mediaSource) ? mediaSource.split("#")[0] : mediaSource}
    className={className ?? "mx-auto block h-28 w-auto max-w-full rounded object-contain"} style={style} />;
}
