"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { PreviewControls } from "./preview-controls";
import type { PlayerRef } from "./player";

const FPS = 30;
type Listener = (event: { detail: unknown }) => void;

/**
 * One media file (such as a generated result) with the shared preview transport: the
 * same scrubber, play, volume and fullscreen as the editor's Player, without building a
 * composition. Use Player for timelines and compositions; use this for a plain file.
 */
export const SourceVideoPlayer = forwardRef<PlayerRef, { src: string; label: string; onError?: () => void; children?: ReactNode }>(
  function SourceVideoPlayer({ src, label, onError, children }, ref) {
    const video = useRef<HTMLVideoElement>(null), container = useRef<HTMLDivElement>(null);
    const listeners = useRef(new Map<string, Set<Listener>>());
    const [frame, setFrame] = useState(0), [durationInFrames, setDuration] = useState(1);
    const [playing, setPlaying] = useState(false), [volume, setVolume] = useState(1), [muted, setMuted] = useState(true), [fullscreen, setFullscreen] = useState(false);
    const emit = useCallback((name: string, detail?: unknown) => listeners.current.get(name)?.forEach(listener => listener({ detail })), []);
    const api = useMemo<PlayerRef>(() => ({
      toggleFullscreen() { if (document.fullscreenElement) void document.exitFullscreen(); else void container.current?.requestFullscreen?.(); },
      isFullscreen: () => document.fullscreenElement === container.current,
      seekTo(next) { const node = video.current; if (node) node.currentTime = Math.max(0, Math.min(node.duration || Infinity, next / FPS)); },
      getCurrentFrame: () => Math.round((video.current?.currentTime ?? 0) * FPS),
      isPlaying: () => Boolean(video.current && !video.current.paused),
      play() { void video.current?.play().catch(() => {}); },
      pause() { video.current?.pause(); },
      getVolume: () => video.current?.volume ?? 1,
      setVolume(value) { if (video.current) video.current.volume = value; },
      isMuted: () => video.current?.muted ?? true,
      mute() { if (video.current) video.current.muted = true; },
      unmute() { if (video.current) video.current.muted = false; },
      setPlaybackRate(value) { if (video.current) video.current.playbackRate = value; },
      getPlaybackRate: () => video.current?.playbackRate ?? 1,
      addEventListener(name, listener) { const set = listeners.current.get(name) ?? new Set(); set.add(listener as Listener); listeners.current.set(name, set); },
      removeEventListener(name, listener) { listeners.current.get(name)?.delete(listener as Listener); },
    }), []);
    useImperativeHandle(ref, () => api, [api]);
    // A frame-accurate readout while playing; seeks update it directly.
    useEffect(() => {
      if (!playing) return;
      let raf = 0;
      const tick = () => { const next = api.getCurrentFrame(); setFrame(next); emit("frameupdate", { frame: next }); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [api, emit, playing]);
    useEffect(() => {
      const change = () => { const active = document.fullscreenElement === container.current; setFullscreen(active); emit("fullscreenchange", { isFullscreen: active }); };
      document.addEventListener("fullscreenchange", change);
      return () => document.removeEventListener("fullscreenchange", change);
    }, [emit]);
    const sync = () => { const next = api.getCurrentFrame(); setFrame(next); emit("frameupdate", { frame: next }); };
    return <div ref={container} className="dreamcut-frame-player source-video-player" data-playing={String(playing)}
      style={{ position: "relative", overflow: "hidden", background: "#000" }}>
      <video ref={video} src={src} aria-label={label} playsInline muted preload="metadata" className="block h-auto w-full"
        style={fullscreen ? { height: "100%", objectFit: "contain" } : undefined}
        onLoadedMetadata={event => { setDuration(Math.max(1, Math.round(event.currentTarget.duration * FPS))); sync(); }}
        onPlay={() => { setPlaying(true); emit("play"); }} onPause={() => { setPlaying(false); sync(); emit("pause"); }}
        onEnded={() => { setPlaying(false); emit("ended"); }} onSeeked={() => { sync(); emit("seeked", { frame: api.getCurrentFrame() }); }}
        onVolumeChange={event => { setVolume(event.currentTarget.volume); setMuted(event.currentTarget.muted); }}
        onError={onError} onClick={() => (api.isPlaying() ? api.pause() : api.play())} />
      {children}
      <PreviewControls api={api} playing={playing} frame={frame} fps={FPS} durationInFrames={durationInFrames}
        volume={volume} muted={muted} fullscreen={fullscreen} onToggleFullscreen={() => api.toggleFullscreen()} />
    </div>;
  });
