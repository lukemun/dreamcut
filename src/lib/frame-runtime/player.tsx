"use client";
import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { FrameContext, FrameSession } from ".";
import { retryPlaybackPermission } from "./session";
import { createPortal } from "react-dom";
import { PreviewControls } from "./preview-controls";
import { PlaybackTransport } from "./transport-clock";

type Events = { fullscreenchange: { isFullscreen: boolean }; frameupdate: { frame: number }; seeked: { frame: number }; ratechange: { playbackRate: number }; volumechange: { volume: number }; mutechange: { isMuted: boolean }; play: undefined; pause: undefined; ended: undefined; waiting: undefined; resume: undefined };
type Listener<K extends keyof Events> = (event: { detail: Events[K] }) => void;
export type PlayerRef = {
  toggleFullscreen(): void;
  isFullscreen(): boolean;
  setPreviewClock?(clock: (() => number | null) | null, buffering?: (() => boolean) | null): void;
  seekTo(frame: number): void; getCurrentFrame(): number; isPlaying(): boolean; play(): void; pause(): void;
  getVolume(): number; setVolume(value: number): void; isMuted(): boolean; mute(): void; unmute(): void;
  setPlaybackRate(value: number): void; getPlaybackRate(): number;
  addEventListener<K extends keyof Events>(name: K, listener: Listener<K>): void;
  removeEventListener<K extends keyof Events>(name: K, listener: Listener<K>): void;
};
type Props = { settingsTarget?: HTMLElement | null; viewerToolsTarget?: HTMLElement | null; captureTarget?: HTMLElement | null; controlsAccessory?: React.ReactNode; allowFrameGrab?: boolean; captureFrame?: (frame: number) => Promise<Blob>; onPreviousEditPoint?: () => void; onNextEditPoint?: () => void; controlsTarget?: HTMLElement | null; resumeWhenUnblocked?: boolean; autoPlayWhenReady?: boolean; playbackBlocked?: boolean; component: ComponentType<any>; inputProps: any; durationInFrames: number; compositionWidth: number; compositionHeight: number; fps: number; controls?: boolean; settings?: React.ReactNode; style?: CSSProperties; numberOfSharedAudioTags?: number };
export const Player = forwardRef<PlayerRef, Props>(function Player({ settingsTarget, viewerToolsTarget, captureTarget, controlsAccessory, allowFrameGrab = false, captureFrame, onPreviousEditPoint, onNextEditPoint, controlsTarget, component: Component, inputProps, durationInFrames, compositionWidth, compositionHeight, fps, controls, settings, style, playbackBlocked = false, autoPlayWhenReady = false, resumeWhenUnblocked = false }, ref) {
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false), [volume, setVolume] = useState(1), [muted, setMuted] = useState(false), [rate, setRate] = useState(1), [scale, setScale] = useState(1);
  const [windowFullscreen, setWindowFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const lifecycle = useRef(0);
  const [session] = useState(() => new FrameSession());
  const container = useRef<HTMLDivElement>(null);
  const state = useRef({ volume, muted, durationInFrames, fps });
  Object.assign(state.current, { durationInFrames, fps });
  const blockedRef = useRef(playbackBlocked); blockedRef.current = playbackBlocked;
  const listeners = useRef(new Map<keyof Events, Set<Function>>());
  // Time comes from the transport clock; animation frames only present it.
  const [clock] = useState(() => {
    let lastUiFrameAt = -Infinity;
    return new PlaybackTransport({
      fps: () => state.current.fps,
      durationInFrames: () => state.current.durationInFrames,
      blocked: () => blockedRef.current,
      buffering: () => session.buffering(),
      bufferingAtStart: () => Boolean(session.previewFrameRenderer && session.buffering()),
      mediaClock: () => session.previewClock(state.current.fps),
      failed: () => {
        if (!session.error) return false;
        // Browser autoplay permission is not a broken preview. Leave Play usable
        // without a fatal overlay; a subsequent user gesture starts normally.
        const deniedAutoplay = retryPlaybackPermission(session);
        setFailure(deniedAutoplay ? null : session.error!.message);
        return true;
      },
      syncMedia: () => { for (const entry of session.media.values()) entry.syncPreview?.(); },
      present: (next, epoch, playing) => session.requestPreviewFrame(next, epoch, playing),
      // A canvas presenter follows the exact transport without forcing the
      // React editor tree to reconcile at the media frame rate.
      commitUi: (next, now, force) => { if (force || !session.previewFrameRenderer || now - lastUiFrameAt >= 100) { setFrame(next); lastUiFrameAt = now; } },
      setPlaying, setBuffering, setRate,
      emit: (name, detail) => listeners.current.get(name)?.forEach(fn => fn({ detail })),
    });
  });
  const fullscreenState = useRef(false);
  const resumeAfterBlock = useRef(false);
  const api = useMemo<PlayerRef>(() => {
    const emit = <K extends keyof Events>(name: K, detail: Events[K]) => listeners.current.get(name)?.forEach(fn => fn({ detail }));
    return {
      toggleFullscreen: () => setWindowFullscreen(value => !value),
      isFullscreen: () => fullscreenState.current,
      setPreviewClock: (clock, buffering) => { session.externalClock = clock; session.externalBuffering = buffering ?? null; },
      getCurrentFrame: () => clock.frame,
      isPlaying: () => clock.playing,
      getVolume: () => state.current.volume,
      isMuted: () => state.current.muted,
      getPlaybackRate: () => clock.rate,
      seekTo: value => { if (!Number.isFinite(value)) return; resumeAfterBlock.current=false; clock.seek(value); },
      play: () => { if (blockedRef.current) return; if (retryPlaybackPermission(session)) setFailure(null); clock.play(); },
      pause: () => { resumeAfterBlock.current=false; clock.pause(); },
      setVolume: value => { state.current.volume = Math.max(0, Math.min(1, value)); setVolume(state.current.volume); emit("volumechange", { volume: state.current.volume }); },
      mute: () => { state.current.muted = true; setMuted(true); emit("mutechange", { isMuted: true }); },
      unmute: () => { state.current.muted = false; setMuted(false); emit("mutechange", { isMuted: false }); },
      setPlaybackRate: value => clock.setRate(value),
      addEventListener: (name, listener) => { if (!listeners.current.has(name)) listeners.current.set(name, new Set()); listeners.current.get(name)!.add(listener); },
      removeEventListener: (name, listener) => { listeners.current.get(name)?.delete(listener); },
    };
  }, []);
  useImperativeHandle(ref, () => api, [api]);
  const wasPlaybackBlocked = useRef(playbackBlocked);
  useLayoutEffect(()=>{
    const becameReady = wasPlaybackBlocked.current && !playbackBlocked;
    wasPlaybackBlocked.current = playbackBlocked;
    if(playbackBlocked){const shouldResume=clock.playing;api.pause();resumeAfterBlock.current=shouldResume;}
    else if(becameReady && resumeWhenUnblocked && resumeAfterBlock.current){resumeAfterBlock.current=false;api.play();}
    else if(becameReady && autoPlayWhenReady){api.seekTo(0);api.play();}
  },[playbackBlocked,autoPlayWhenReady,resumeWhenUnblocked,api]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setScale(Math.min(width / compositionWidth, height / compositionHeight));
    });
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, [compositionWidth, compositionHeight]);
  useLayoutEffect(() => {
    if (!windowFullscreen) return;
    const player = container.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The top layer escapes editor clipping/stacking without native app fullscreen
    // or moving/remounting the player, its decoders, or its playback session.
    player.setAttribute("popover", "manual");
    player.showPopover();
    const background: Array<{ element: HTMLElement; inert: boolean }> = [];
    let branch: HTMLElement = player;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          background.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    player.querySelector<HTMLButtonElement>(".preview-fullscreen")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (player.querySelector(":popover-open")) return;
        event.preventDefault(); event.stopImmediatePropagation(); setWindowFullscreen(false);
      } else if (event.key === "Tab") {
        const controls = [...player.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      player.hidePopover();
      player.removeAttribute("popover");
      background.forEach(({ element, inert }) => { element.inert = inert; });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [windowFullscreen]);
  useLayoutEffect(() => {
    fullscreenState.current = windowFullscreen;
    listeners.current.get("fullscreenchange")?.forEach(fn => fn({ detail: { isFullscreen: windowFullscreen } }));
  }, [windowFullscreen]);
  useEffect(() => {
    lifecycle.current++;
    const hidden = () => { if (document.hidden) api.pause(); };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      const generation = ++lifecycle.current;
      queueMicrotask(() => { if (lifecycle.current === generation) { clock.dispose(); session.dispose(); } });
    };
  }, [session, api, clock]);
  useEffect(() => { clock.retime(); }, [fps, clock]);
  const grabFrame = async () => {
    api.pause();
    if (capturingFrame) return;
    setCapturingFrame(true);
    setCaptureError(null);
    try {
      let capturedFrame = clock.frame;
      let blob: Blob | null;
      if (captureFrame) {
        blob = await captureFrame(capturedFrame);
      } else {
        const canvas = container.current?.querySelector<HTMLCanvasElement>("canvas[data-gpu-preview]");
        if (!canvas || canvas.dataset.gpuPreviewFrame === undefined) throw new Error("The preview frame is not ready yet.");
        // A compressed replay picture is swapped for the exact composite after pausing.
        for (let waited = 0; canvas.dataset.gpuReplayFrame === "1" && waited < 3000; waited += 50) await new Promise(resolve => setTimeout(resolve, 50));
        if (canvas.dataset.gpuReplayFrame === "1") throw new Error("The exact frame is still being prepared. Try again.");
        capturedFrame = Number(canvas.dataset.gpuPreviewFrame);
        blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      }
      if (!blob) throw new Error("The frame could not be captured. Try again.");
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `dreamcut-frame-${capturedFrame}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Frame capture failed.");
    } finally { setCapturingFrame(false); }
  };
  const transport = (controls || settings) && <PreviewControls settingsTarget={windowFullscreen ? undefined : settingsTarget} captureTarget={windowFullscreen ? undefined : captureTarget} viewerToolsTarget={windowFullscreen ? undefined : viewerToolsTarget} showFullscreen accessory={controlsAccessory} capturingFrame={capturingFrame} captureError={captureError} frameGrabUnavailableReason={capturingFrame ? "Capturing the composition…" : !allowFrameGrab && !captureFrame ? "Frame capture is not available for this renderer." : playbackBlocked ? "Resolve the preview warning before capturing a frame." : "Waiting for the preview frame to finish loading."} onGrabFrame={!capturingFrame && (captureFrame || (allowFrameGrab && !buffering && !playbackBlocked)) ? grabFrame : undefined} onPreviousEditPoint={onPreviousEditPoint} onNextEditPoint={onNextEditPoint} showSeek compact={Boolean(controlsTarget) && !windowFullscreen} transportHidden={!controls} settings={settings} playbackBlocked={playbackBlocked} api={api} playing={playing} frame={frame} fps={fps} durationInFrames={durationInFrames} volume={volume} muted={muted} fullscreen={windowFullscreen} onToggleFullscreen={api.toggleFullscreen} />;
  return <div ref={container} className={`dreamcut-frame-player${windowFullscreen ? " preview-window-fullscreen" : ""}`} role={windowFullscreen ? "dialog" : undefined} aria-modal={windowFullscreen || undefined} aria-label={windowFullscreen ? "Preview playback" : undefined} data-playing={String(playing)} data-dreamcut-player="independent" style={{ position: "relative", overflow: "hidden", ...style }}>
    <div style={{ width: compositionWidth, height: compositionHeight, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center", position: "absolute", left: "50%", top: "50%" }}>
      <FrameContext.Provider value={{ frame, absoluteFrame: frame, fps, width: compositionWidth, height: compositionHeight, durationInFrames, seekVersion: clock.epoch, rendering: false, transportPlaying: playing, playing: playing && !buffering && !playbackBlocked, volume, muted, playbackRate: rate, session }}><Component {...inputProps} /></FrameContext.Provider>
    </div>
    {failure && <div role="alert" style={{ position: "absolute", inset: 10, color: "var(--ink)", background: "var(--glass-bar)", padding: 12 }}>{failure}</div>}
    {controlsTarget && !windowFullscreen ? createPortal(transport, controlsTarget) : controlsTarget === null && !windowFullscreen ? null : transport}
  </div>;
});
