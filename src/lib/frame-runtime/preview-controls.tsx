"use client";
import {createPortal} from "react-dom";
import { Camera, LoaderCircle, Play, Pause, SkipBack, SkipForward, Maximize, Minimize, Settings } from "lucide-react";
import {useId, useState, useRef, useLayoutEffect, type ReactNode, type CSSProperties} from "react";
import type { PlayerRef } from "./player";
import "./preview-controls.css";
import {previewSettingsPlacement} from "./preview-settings-placement";

function formatTime(frames: number, fps: number) {
  const seconds = Math.max(0, Math.floor(frames / fps));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PreviewControls({ compact = false, settingsTarget, viewerToolsTarget, captureTarget, showFullscreen = true, accessory, capturingFrame, captureError, frameGrabUnavailableReason, onGrabFrame, onPreviousEditPoint, onNextEditPoint, settings, showSeek = true, transportHidden = false, playbackBlocked = false, api, playing, frame, fps, durationInFrames, volume, muted, fullscreen, onToggleFullscreen }: {
  /** Floating over the picture: just Play, with the scrubber revealed on hover or focus. */ compact?: boolean;
  settingsTarget?: HTMLElement | null; viewerToolsTarget?: HTMLElement | null; /** Where capture frame renders: omitted keeps it with the viewer options; null hides it. */ captureTarget?: HTMLElement | null; showFullscreen?: boolean; accessory?: ReactNode; capturingFrame?: boolean; captureError?: string | null; frameGrabUnavailableReason?: string; onGrabFrame?: () => void; onPreviousEditPoint?: () => void; onNextEditPoint?: () => void; showSeek?: boolean; transportHidden?: boolean; settings?: ReactNode; playbackBlocked?: boolean; api: PlayerRef; playing: boolean; frame: number; fps: number; durationInFrames: number;
  volume: number; muted: boolean; fullscreen: boolean; onToggleFullscreen: () => void;
}) {
  const settingsId=useId();
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [placement,setPlacement]=useState<CSSProperties>({});
  const settingsButton=useRef<HTMLButtonElement>(null),settingsPanel=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(!settingsOpen)return;
    const place=()=>{
      if(!settingsButton.current||!settingsPanel.current)return;
      setPlacement(previewSettingsPlacement(settingsButton.current.getBoundingClientRect(),{width:window.innerWidth,height:window.innerHeight},settingsPanel.current.scrollHeight,settingsButton.current.closest(".editor-viewer")?.getBoundingClientRect()));
    };
    place();window.addEventListener('resize',place);
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();settingsPanel.current?.hidePopover();settingsButton.current?.focus();
    }};
    window.addEventListener('keydown',escape,true);
    const observer=new ResizeObserver(place);observer.observe(settingsPanel.current!);
    // A new video shape can reflow the workspace while the panel is open; follow the gear.
    const viewer=settingsButton.current?.closest(".editor-viewer");if(viewer)observer.observe(viewer);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('keydown',escape,true);observer.disconnect();};
  },[settingsOpen]);
  const captureId=useId();
  // Frame capture is a viewer action, so it sits in the row beside fullscreen, not in settings.
  const captureControl = (onGrabFrame || frameGrabUnavailableReason || capturingFrame) && <>
    <button type="button" className="preview-play-button preview-outline-button preview-capture-button" aria-label={capturingFrame ? "Capturing frame" : "Capture frame"}
      title={capturingFrame ? "Capturing frame…" : onGrabFrame ? "Capture frame" : frameGrabUnavailableReason ?? "Frame capture is unavailable in this viewer"}
      aria-disabled={!onGrabFrame} aria-describedby={captureError ? captureId : undefined} onClick={onGrabFrame}>
      {capturingFrame ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Camera aria-hidden="true" />}</button>
    {captureError && <span id={captureId} role="alert" className="sr-only">{captureError}</span>}
  </>;
  const settingsControl = settings && <div className="preview-settings-control">
        <button type="button" className="preview-play-button preview-outline-button" aria-haspopup="dialog" aria-label="Preview settings" title="Preview settings" aria-expanded={settingsOpen} aria-controls={settingsId} popoverTarget={settingsId} popoverTargetAction="toggle" ref={settingsButton}><Settings aria-hidden="true"/></button>
        {/* A dialog only while shown: a closed panel announcing role="dialog" made drawers treat every Escape as the dialog's. */}
        <div ref={settingsPanel} id={settingsId} popover="auto" role={settingsOpen ? "dialog" : undefined} aria-label="Preview settings" className="preview-settings-panel" style={placement} onToggle={event=>setSettingsOpen(event.currentTarget.matches(':popover-open'))}>
          {settingsOpen ? settings : null}
        </div>
      </div>;
  const viewerTools = <div className="preview-utility-controls" role="group" aria-label="Viewer accessories">
      {accessory}

  </div>;
  const captureInline = captureTarget === undefined ? captureControl : null;
  const viewerOptions = <>{captureInline}{showFullscreen && <button className="preview-play-button preview-outline-button preview-fullscreen" type="button" aria-label={fullscreen ? "Exit preview fullscreen" : "Expand preview"} title={fullscreen ? "Exit preview fullscreen" : "Expand preview"} onClick={onToggleFullscreen}>
        {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
      </button>}{settingsControl}</>;
  const hasOptions = Boolean(captureInline || showFullscreen || settingsControl);
  const inlineTools = viewerToolsTarget === undefined && accessory ? viewerTools : null;
  const inlineOptions = settingsTarget === undefined && hasOptions ? viewerOptions : null;
  const label = playing ? "Pause preview" : "Play preview";
  return (
    <div className={compact ? "preview-minimal-controls preview-minimal-controls--compact" : "preview-minimal-controls"}>
      {!transportHidden && <>
      {onPreviousEditPoint && !compact && <button className="preview-play-button preview-outline-button" type="button" aria-label="Go to previous edit point" onClick={onPreviousEditPoint}><SkipBack aria-hidden="true" /></button>}
      <button
        className="preview-play-button"
        disabled={playbackBlocked}
        type="button"
        aria-label={label}
        title={label}
        onClick={() => playing ? api.pause() : api.play()}
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
      {onNextEditPoint && !compact && <button className="preview-play-button preview-outline-button" type="button" aria-label="Go to next edit point" onClick={onNextEditPoint}><SkipForward aria-hidden="true" /></button>}
      {showSeek && <input className="preview-seek" type="range" min={0} max={Math.max(0, durationInFrames - 1)} step={1} value={frame} aria-label="Seek preview" aria-valuetext={`${formatTime(frame, fps)} of ${formatTime(durationInFrames, fps)}`} onChange={event => api.seekTo(Number(event.target.value))} />}
      <span className="preview-time" aria-label="Preview time">
        {formatTime(frame, fps)} <span>/ {formatTime(durationInFrames, fps)}</span>
      </span>
      </>}
      {/* The trailing group renders only with local content, so moved controls leave no gap. */}
      {(inlineTools || inlineOptions) && <div className="preview-trailing-controls" role="group" aria-label="Viewer tools">{inlineTools}{inlineOptions}</div>}
      {viewerToolsTarget && accessory ? createPortal(viewerTools, viewerToolsTarget) : null}
      {settingsTarget && hasOptions ? createPortal(viewerOptions, settingsTarget) : null}
      {captureTarget && captureControl ? createPortal(captureControl, captureTarget) : null}
    </div>
  );
}
