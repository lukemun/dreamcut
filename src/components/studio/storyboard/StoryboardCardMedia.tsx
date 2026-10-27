"use client";
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoryboardAsset } from "@/lib/storyboard/model";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";
import styles from "./storyboard.module.css";

/** Card playback is transient; it never selects, marks, or edits a source. */
export function StoryboardCardMedia({ asset, start = 0, duration, label, playable: inline = true, onPlay }: {
  asset?: StoryboardAsset; start?: number; duration?: number; label?: string; playable?: boolean;
  /** Plays this card somewhere larger (the story preview) instead of inside the card, which then shows a still. */ onPlay?: () => void;
}) {
  const playable = inline && !onPlay;
  const host = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), still = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false), [failed, setFailed] = useState(false), [playing, setPlaying] = useState(false);
  const [retry, setRetry] = useState(0);
  const name = label || asset?.name || "footage";
  const end = duration == null ? asset?.duration ?? Infinity : start + duration;
  // Stills come from the server's cached frame at the shot start, so cards never download a whole
  // video just to show one frame. The video itself loads only metadata until someone presses play.
  const stillUrl = asset?.preview ? thumbnailUrl(asset.preview, playable ? 640 : 320, start) : undefined;
  const stillServed = !!stillUrl && stillUrl !== asset?.preview;
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (!entry.isIntersecting) video.current?.pause();
    }, { rootMargin: "100px" });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setFailed(false); setPlaying(false); }, [asset?.source, retry]);
  useEffect(() => {
    if (!playing || duration == null) return;
    let frame: number;
    const checkEnd = () => {
      const node = video.current;
      if (!node || node.paused) return;
      if (node.currentTime >= end) {
        node.pause();
        node.currentTime = end;
      } else frame = requestAnimationFrame(checkEnd);
    };
    frame = requestAnimationFrame(checkEnd);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, end]);
  const captureFrame = (node: HTMLVideoElement) => {
    if (playable || node.seeking || node.readyState < 2 || !node.videoWidth) return;
    const canvas = still.current;
    if (!canvas) return;
    canvas.width = node.videoWidth; canvas.height = node.videoHeight;
    canvas.getContext("2d")?.drawImage(node, 0, 0);
  };
  const seekStart = (node: HTMLVideoElement) => { node.currentTime = Math.min(start, Math.max(0, node.duration - 1 / 30)); };
  useEffect(() => {
    const node = video.current;
    if (node && node.readyState >= 1 && !(stillServed && playable)) node.currentTime = Math.min(start, Math.max(0, node.duration - 1 / 30));
  }, [start]);
  const playButton = onPlay && <Button className={styles.cardPlay} size="icon" variant="secondary" title={`Play ${name}`} aria-label={`Play ${name}`} onClick={onPlay}><Play aria-hidden="true" size={18} fill="currentColor" /></Button>;
  return <div ref={host} className={styles.cardPreview}>
    {!asset ? <p>Footage unavailable</p> : failed ? <div role="status"><p>Preview could not load.</p>{playable && <Button size="sm" variant="outline" onClick={() => setRetry(n => n + 1)}>Retry preview</Button>}</div>
      : asset.kind === "audio" ? <div><span>Audio recording</span>{playable && <audio aria-label={`Play ${name}`} controls preload="metadata" src={asset.url} style={{width:"100%"}} />}</div>
      : asset.kind === "image" ? <><img key={retry} data-media-preview draggable={false} className={styles.thumb} src={thumbnailUrl(asset.preview || asset.url, 640)} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />{playButton}</>
        : (asset.ready || asset.previewReady) && asset.preview && !playable && stillServed ? <><img key={`${stillUrl}-${retry}`} data-media-preview draggable={false} className={styles.thumb} src={stillUrl} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />{playButton}</>
        : (asset.ready || asset.previewReady) && asset.preview ? <>
          <video key={`${asset.source}-${retry}`} ref={video} data-media-preview data-storyboard-card-video className={styles.thumb}
            aria-label={`Inline preview: ${name}`} src={visible ? asset.preview : undefined} poster={visible ? stillUrl : undefined} preload={stillServed ? "metadata" : "auto"} controls={playable && playing} muted playsInline
            style={playable ? undefined : { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
            onLoadedData={e => captureFrame(e.currentTarget)} onSeeked={e => captureFrame(e.currentTarget)}
            draggable={false} onDragStart={e => e.preventDefault()} onError={() => setFailed(true)}
            onLoadedMetadata={e => { if (!stillServed || !playable) seekStart(e.currentTarget); }}
            onPlay={e => {
              const node = e.currentTarget;
              host.current?.closest('[aria-label="Storyboard workspace"]')?.querySelectorAll<HTMLVideoElement>('[data-storyboard-card-video]').forEach(other => { if (other !== node) other.pause(); });
              if (node.currentTime < start || node.currentTime >= end - .02) seekStart(node);
              setPlaying(true);
            }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onTimeUpdate={e => {
              const node = e.currentTarget;
              if (duration != null && node.currentTime >= end) {
                node.pause();
                if (node.currentTime > end + .001) node.currentTime = end;
              }
            }} />
          {!playable && <canvas ref={still} className={styles.thumb} role="img" aria-label={name} />}
          {playButton}
          {playable && !playing && <Button className={styles.cardPlay} size="icon" variant="secondary" title={`Play ${name}`} aria-label={`${playing ? "Pause" : "Play"} preview: ${name}`} onClick={() => {
            const node = video.current; if (!node) return;
            if (node.paused) void node.play().catch(() => setFailed(true)); else node.pause();
          }}><Play aria-hidden="true" size={18} fill="currentColor" /></Button>}
        </> : <p>Preview needs preparation</p>}
  </div>;
}
