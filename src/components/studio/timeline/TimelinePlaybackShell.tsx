"use client";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";
import { useWorkspaceChrome } from "@/app/WorkspaceChrome";
import {NO_GPU_DEVICE_MESSAGE,previewFallbackMessage,type PreviewRendererSelection} from '@/lib/preview-renderer-selection';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type RefObject } from "react";
import { usePanelSize, useWorkspaceSize, WorkspaceResizeHandle } from "@/components/ui/workspace-resize";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { Player, type PlayerRef } from "@/lib/frame-runtime/player";

import {nativePreviewAudioElements} from "@/lib/native-preview/preview-audio";
import {PreviewPlaybackSettings} from "./PreviewPlaybackSettings";
import {usePreviewPreparation} from "./usePreviewPreparation";
import {resolvePreviewPreparation,shouldUsePreparedPicture} from "@/lib/preview-preparation";
import {preparedPlaybackPlan} from "@/lib/timeline/prepared-playback-plan";
import {usePreparedPlayback,usePreparedPlaybackBlocks,type PreparedPlaybackBlock} from './usePreparedPlayback';
import {previewCacheRanges} from '@/lib/timeline/preview-cache-plan';
import {preparedPictureInput,preparedPreviewIdentity} from '@/lib/timeline/prepared-preview';
import {PreparedPlaybackComposition,PreparedPlaybackStatus} from './PreparedPlayback';
import { TimelineComposition } from "@/lib/remotion/TimelineComposition";
import { TimelinePreviewAudioMixer } from "./TimelinePreviewAudioMixer";
import {
  TIMELINE_PLAYER_SHARED_AUDIO_TAGS,
  clampPlayerFrame,
  createPreviewPlayerRuntimeKey,
  restoreAttachedPlayerFrame,
  shouldReleaseStuckPreviewPointer,
} from "./playback-shell-helpers";
import type { PreviewReadinessState } from "./preview-readiness-state";
import type { PreviewReadinessApi } from "./usePreviewReadiness";
import { chrome } from "./theme";
import { useAutomaticPreviewQuality } from "./useAutomaticPreviewQuality";
import type { PreviewAspectRatio } from "./types";

type CompositionDimensions = {
  width: number;
  height: number;
};

const PLAYER_RUNTIME_KEY = createPreviewPlayerRuntimeKey(
  process.env.NODE_ENV === "development",
  Math.random().toString(36).slice(2),
);

// Re-exported so existing importers keep one entry point. The definitions live in a
// module free of Remotion component imports, because `@remotion/media` ships ESM-only
// and Node's CJS test loader cannot follow this file's render-graph imports.
export {
  TIMELINE_PLAYER_SHARED_AUDIO_TAGS,
  clampPlayerFrame,
  shouldReleaseStuckPreviewPointer,
} from "./playback-shell-helpers";

type Props = {
  projectId: string;
  rendererNeedsConfirmation?:boolean;
  onRendererFailure?:(reason:string|null)=>void;
  renderBackend: "standard"|"rust"|"gpu";
  onRenderBackendChange: (backend:"standard"|"rust"|"gpu")=>void;
  /** The computer could not start the Graphics card: preview and export use Browser for this visit. */
  onGpuUnavailable: ()=>void;
  showPositionGrid?: boolean;
  playerRef: RefObject<PlayerRef | null>;
  setPlayerInstance: (instance: PlayerRef | null) => void;
  playerInputProps: ComponentProps<typeof TimelineComposition>;
  /** A previewed proposal's stretch, flattened ahead of time: played instead of decoding every layer there. */
  readyBlocks?: PreparedPlaybackBlock[] | null;
  durationInFrames: number;
  playheadSec: number;
  compositionDimensions: CompositionDimensions;
  previewAspectRatio: PreviewAspectRatio;
  toolNode?: ReactNode;
  /** Wide only: the tool panel is folded to its rail, so the viewer takes the rest of the width. */
  toolsCollapsed?: boolean;
  /** Vertical workspace only: Properties (with Text and Captions tabs) above the timeline on the right. */
  inspectorNode?: ReactNode;
  viewerAccessory?: ReactNode;
  /** Video shape (output aspect ratio) control, first in the preview settings. */
  shapeControl?: ReactNode;
  toolbarNode: ReactNode;
  timelineNode: ReactNode;
  bottomPanelNode?: ReactNode;
  onPreviousEditPoint?: () => void;
  onNextEditPoint?: () => void;
  /** Properties stays docked beside the wide preview. */
  landscapeRightPanelNode?: (mode: "tabs" | "inspector") => ReactNode;
  /** Optional, evidence-gated layer rendered inside the exact composition frame. */
  analysisOverlayNode?: ReactNode;
  /** Editor-only hit targets rendered above the Player but never into the output. */
  interactionOverlayNode?: ReactNode;
  /** Replaces the picture while shown (e.g. a template's example played full size). */
  viewerTakeoverNode?: ReactNode;
  /** Status that belongs to the viewer but not on the picture, e.g. an active proposal preview; sits at its bottom-right edge. */
  viewerEdgeNode?: ReactNode;
  /** Required readiness gate: all preview transport uses one lifecycle. */
  readiness: {
    state: PreviewReadinessState;
    api: PreviewReadinessApi;
  };
  /** Coarse Player buffering (public waiting/resume) — covers the canvas
   * decode path the DOM sampler cannot see. Audible muxed video may own this
   * pause; detached narration remains the sole speech clock. */
  isPlayerBuffering?: boolean;
  /** Proposal replay reports normal warmup in its visible action button. */
  inlineStartupLoading?: boolean;
};

export function TimelinePlaybackShell({
  projectId,
  renderBackend,
  rendererNeedsConfirmation,
  onRendererFailure,
  onRenderBackendChange,
  onGpuUnavailable,
  showPositionGrid = false,
  playerRef,
  setPlayerInstance,
  playerInputProps,
  readyBlocks = null,
  durationInFrames,
  playheadSec,
  compositionDimensions,
  previewAspectRatio,
  toolNode,
  toolsCollapsed = false,
  inspectorNode,
  viewerAccessory,
  shapeControl,
  toolbarNode,
  timelineNode,
  bottomPanelNode,
  onPreviousEditPoint,
  onNextEditPoint,
  landscapeRightPanelNode,
  analysisOverlayNode,
  interactionOverlayNode,
  viewerTakeoverNode,
  viewerEdgeNode,
  readiness,
  isPlayerBuffering = false,
  inlineStartupLoading = false,
}: Props) {
  const [savedPreparation,setPreparationMode]=usePreviewPreparation();
  const preparationMode=resolvePreviewPreparation(renderBackend,savedPreparation);
  const [gpuReason,setGpuReason]=useState<string|null>(null);
  const gpuRequested=preparationMode==='gpu';
  const gpuEnabled=gpuRequested&&!gpuReason;
  const [noGpuDevice,setNoGpuDevice]=useState(false);
  const gpuFailed=useCallback((reason:string,device=false)=>{
    console.warn('[GPU preview fallback]',reason);
    // The computer cannot start the GPU path at all: move preview and export to Browser together for this
    // visit, so the creator reviews what will be exported and export needs no manual step. Nothing is saved,
    // so a failure in a hidden tab never pins every later export to the slower renderer.
    if(device){setNoGpuDevice(true);onGpuUnavailable();return;}
    setGpuReason(/^Decoded picture|Invalid GPU scene/.test(reason)?'A video frame could not be synchronized. Select GPU preview again to retry.':reason);
  },[onGpuUnavailable]);
  const selectPreparation=useCallback((mode:typeof preparationMode)=>{setGpuReason(null);setPreparationMode(mode);},[setPreparationMode]);
  const nativeAvailable=(process.env.NEXT_PUBLIC_DREAMCUT_NATIVE_PREVIEW ?? process.env.NEXT_PUBLIC_OPENEDIT_NATIVE_PREVIEW)==='1';
  const nativeEnabled=nativeAvailable&&renderBackend==='rust';
  const [nativeReason,setNativeReason]=useState<string|null>(null);
  const selectRenderer=useCallback((renderer:PreviewRendererSelection)=>{
    setNativeReason(null);setGpuReason(null);onRenderBackendChange(renderer);
  },[onRenderBackendChange]);
  const nativeFailed=useCallback((reason:string)=>{setNativeReason(reason);},[]);
  useEffect(()=>{setGpuReason(null);setNativeReason(null);},[renderBackend]);
  useEffect(()=>{onRendererFailure?.(renderBackend==='gpu'?gpuReason:renderBackend==='rust'?nativeReason??(!nativeAvailable?'Rust is unavailable on this server':null):null);},[renderBackend,gpuReason,nativeReason,nativeAvailable,onRendererFailure]);
  const needsPreparedPlayback=shouldUsePreparedPicture(preparationMode,durationInFrames);
  const usesBlocks=(preparationMode==='rolling'||preparationMode==='selective') && durationInFrames>0 && durationInFrames<=1800;
  const usesCache=needsPreparedPlayback||usesBlocks;
  // Block handoffs keep all sound on one persistent mixer, never per-block AAC.
  const blockLive=useMemo(()=>({...playerInputProps,...preparedPictureInput({width:compositionDimensions.width,height:compositionDimensions.height,fps:currentFrameRate(),durationInFrames,inputProps:playerInputProps}).inputProps,externalAudioPreview:true}),[playerInputProps,compositionDimensions.width,compositionDimensions.height,durationInFrames]);
  const previewLive=usesBlocks||gpuRequested?blockLive:playerInputProps;
  // A clip placed before its proxy finished preparing is refused only until the proxy arrives with the next input.
  useEffect(()=>{setGpuReason(reason=>reason&&/verified video proxy/.test(reason)?null:reason);},[previewLive]);
  const preparationPlan=useMemo(()=>preparedPlaybackPlan({backend:nativeEnabled?'rust':'standard',...compositionDimensions,fps:currentFrameRate(),durationInFrames,inputProps:previewLive}),[nativeEnabled,previewLive,compositionDimensions.width,compositionDimensions.height,durationInFrames]);
  const ranges=useMemo(()=>usesBlocks?previewCacheRanges(preparationPlan.input,preparationMode==='rolling'?'rolling':'selective'):[],[usesBlocks,preparationPlan.input,preparationMode]);
  const fullPrepared=usePreparedPlayback(projectId,preparationPlan.input,needsPreparedPlayback);
  const blockPrepared=usePreparedPlaybackBlocks(projectId,preparationPlan.input,ranges,Math.round(playheadSec*currentFrameRate()),usesBlocks,preparationMode==='selective');
  const prepared=usesBlocks?blockPrepared:fullPrepared;
  // A proposal stretch prepared in the background plays as one video, whatever the renderer.
  const usesReady=Boolean(readyBlocks?.some(block=>block.url));
  const mixedAudioElements=useMemo(()=>usesBlocks||gpuRequested||nativeEnabled&&!needsPreparedPlayback?nativePreviewAudioElements(playerInputProps.elements):playerInputProps.elements,[nativeEnabled,needsPreparedPlayback,usesBlocks,gpuRequested,playerInputProps.elements]);
  const timelineWorkspaceRef = useRef<HTMLDivElement>(null);
  const viewerStageRef = useRef<HTMLDivElement>(null);
  useAutomaticPreviewQuality(projectId, viewerStageRef, compositionDimensions);
  const [mediaRetryGeneration, setMediaRetryGeneration] = useState(0);
  const timelinePanelRef = useRef<HTMLDivElement>(null);
  const activePreviewPointerRef = useRef<{ pointerId: number; pointerType: string } | null>(null);
  const lastKnownPlayerFrameRef = useRef(
    clampPlayerFrame(playheadSec * currentFrameRate(), durationInFrames),
  );
  const resumePlaybackAfterAttachRef = useRef(false);
  lastKnownPlayerFrameRef.current = clampPlayerFrame(
    playheadSec * currentFrameRate(),
    durationInFrames,
  );
  const isPortraitPreview = previewAspectRatio === "9:16";
  const workspaceSize = useWorkspaceSize(timelineWorkspaceRef);
  const workspaceWidth = workspaceSize.width || 960;
  const workspaceHeight = workspaceSize.height || 700;
  const layoutKey = isPortraitPreview ? "tall" : "wide";
  // Stop widening the viewer when the composition already fills its height.
  // The remainder belongs to editing tools rather than unused side gutters.
  const fullHeightViewerWidth = workspaceHeight * compositionDimensions.width / compositionDimensions.height;
  // The preview keeps the width the creator gives it; the editing panel takes what is left.
  // So widening Chat (which narrows this workspace) shrinks the panel first and only shrinks
  // the preview once the panel reaches its minimum. A tall viewer never grows past the width
  // at which the composition fills the full height. (v3 keys: earlier ones stored the panel.)
  const timelineMax = Math.max(160, workspaceHeight - 180);
  const timelineSize = usePanelSize(`dreamcut:${layoutKey}:timeline-height`, workspaceHeight * .4, 160, timelineMax);
  // Wide: room for the rail plus a Library column whose two-part filters stay on one line (a docked drawer narrows the workspace).
  const panelMin = isPortraitPreview ? Math.min(360, workspaceWidth * .5) : Math.min(380, workspaceWidth * .5);
  const previewMax = Math.max(1, isPortraitPreview ? Math.min(fullHeightViewerWidth, workspaceWidth - panelMin) : workspaceWidth - panelMin);
  const previewMin = Math.min(previewMax, isPortraitPreview ? Math.max(240, workspaceWidth * .28) : Math.max(360, workspaceWidth * .4));
  // Defaults depend on height only, so an untouched layout also keeps its preview while Chat widens:
  // tall fills the full height; wide fills the space above the timeline (less its transport row).
  const widePreviewFallback = Math.max(0, workspaceHeight - timelineSize.value - 56) * compositionDimensions.width / compositionDimensions.height;
  const preview = usePanelSize(`dreamcut:${layoutKey}:preview-width-v3`, isPortraitPreview ? fullHeightViewerWidth : widePreviewFallback, previewMin, previewMax);
  const firstPanel = {
    value: workspaceWidth - preview.value,
    change: (next: number, persist?: boolean) => preview.change(workspaceWidth - next, persist),
    reset: preview.reset,
  };
  const firstMin = workspaceWidth - previewMax;
  const firstMax = workspaceWidth - previewMin;
  // Vertical: the full-height viewer on the left; Properties (with Text and Captions) over the
  // timeline on the right. Library, Music, Sounds and Recipes open in a drawer, not a column.
  // The right column keeps at least `rightMin`; the viewer gives way first.
  const rightMin = Math.min(420, workspaceWidth * .45);
  const tallViewer = Math.max(160, Math.min(preview.value, workspaceWidth - rightMin));
  const tallRight = Math.max(0, workspaceWidth - tallViewer);

  // Square frames sit in the Tall viewer like vertical ones, so they share its framed treatment.
  const isPortraitComposition = compositionDimensions.height >= compositionDimensions.width;
  const compositionAspectRatio = `${compositionDimensions.width} / ${compositionDimensions.height}`;
  // Width-over-height of the REAL output canvas. Every ideal-fit computation below must use
  // this, not a hardcoded 16/9 or 9/16: the workspace layout says where the player column
  // sits, but only the composition knows the shape of the video inside it. Sizing the column
  // for a hardcoded shape is how a vertical video ended up floating small in a
  // landscape-proportioned viewer.
  const compositionRatio = compositionDimensions.width / compositionDimensions.height;
  const horizontalScrollEpsilonPx = 6;

  // Depend on the stable api, never the composite readiness object: a ref
  // callback whose identity changes per render is re-invoked by React with
  // null + instance, which would dispatch detach/attach every render — a loop.
  const readinessApi = readiness.api;
  const handlePlayerRef = useCallback((instance: PlayerRef | null) => {
    const previousInstance = playerRef.current;
    if (!instance && previousInstance) {
      lastKnownPlayerFrameRef.current = clampPlayerFrame(
        previousInstance.getCurrentFrame(),
        durationInFrames,
      );
      resumePlaybackAfterAttachRef.current = previousInstance.isPlaying();
    }

    playerRef.current = instance;
    if (instance) {
      // Two-stage restore: preserve the frame NOW; a prior playing state only
      // QUEUES its resume with the readiness session — playback starts when
      // the required media are actually ready, never synchronously on attach.
      const { queuedResume } = restoreAttachedPlayerFrame(
        instance,
        lastKnownPlayerFrameRef.current,
        resumePlaybackAfterAttachRef.current,
      );
      resumePlaybackAfterAttachRef.current = false;
      readinessApi.playerAttached(lastKnownPlayerFrameRef.current, queuedResume);
    } else {
      readinessApi.playerDetached();
    }
    setPlayerInstance(instance);
    setAttachedPlayer(instance);
  }, [durationInFrames, playerRef, readinessApi, setPlayerInstance]);

  // ── Readiness gate UI (Stage C) ─────────────────────────────────────────
  const readinessPhase = readiness.state.phase;
  const gateClosedNow = readinessPhase === "warming" || readinessPhase === "degraded";
  // Grace period before the closed gate becomes VISIBLE: every scrub/frame-step
  // re-warms for a few ms on a warm cache, and flashing the overlay (or
  // remounting the native controls) per keystroke would make the editor feel
  // broken. Gating LOGIC stays instant — a Play during the grace is still
  // queued and executes on ready, typically imperceptibly.
  const [isStartGateClosed, setIsStartGateClosed] = useState(false);
  const [attachedPlayer, setAttachedPlayer] = useState<PlayerRef | null>(null);
  useEffect(() => {
    if (!gateClosedNow) {
      setIsStartGateClosed(false);
      return;
    }
    const timer = setTimeout(() => setIsStartGateClosed(true), 300);
    return () => clearTimeout(timer);
  }, [gateClosedNow]);
  const showTimedOut = readiness.state.timedOut === true;
  const readinessError = readiness.state.error ?? null;
  const readinessOverlayNode = isStartGateClosed && (!inlineStartupLoading || readinessPhase === "degraded" || showTimedOut) ? (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "rgba(0, 0, 0, 0.45)",
        color: "rgba(255, 255, 255, 0.92)",
        fontSize: 13,
        zIndex: 30,
        // The overlay reports; it must never trap seeks/pause interactions
        // outside its own Retry button.
        pointerEvents: "none",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.25)",
          borderTopColor: "rgba(255,255,255,0.9)",
          animation: "spin 0.9s linear infinite",
        }}
      />
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      <div role="status">
        {readinessPhase === "degraded"
          ? `Preview media failed to load${readinessError ? `: ${readinessError}` : ""}`
          : showTimedOut
            ? "Preview is still loading"
            : "Loading preview…"}
      </div>
      {(readinessPhase === "degraded" || showTimedOut) ? (
        <button
          type="button"
          onClick={() => {
            setMediaRetryGeneration((generation) => generation + 1);
            readiness.api.retry();
          }}
          style={{
            pointerEvents: "auto",
            background: "rgba(255,255,255,0.14)",
            color: "inherit",
            border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: "var(--edge-control-inner)",
            padding: "6px 14px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      ) : null}
    </div>
  ) : null;

  const handlePreviewPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    activePreviewPointerRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
    };
  }, []);

  useEffect(() => {
    const clearPointer = (event: PointerEvent) => {
      if (activePreviewPointerRef.current?.pointerId === event.pointerId) {
        activePreviewPointerRef.current = null;
      }
    };
    const releasePointer = () => {
      const active = activePreviewPointerRef.current;
      if (!active) return;
      activePreviewPointerRef.current = null;
      // Remotion's seek bar currently ends a drag only on `pointerup` at the document
      // root. Forward cancellation/lost-release cases through that same public event
      // path so its internal play/pause and onSeekEnd behavior still runs.
      document.documentElement.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerId: active.pointerId,
        pointerType: active.pointerType,
        button: 0,
        buttons: 0,
      }));
    };
    const onPointerMove = (event: PointerEvent) => {
      if (shouldReleaseStuckPreviewPointer(
        activePreviewPointerRef.current?.pointerId ?? null,
        event.pointerId,
        event.buttons,
      )) {
        releasePointer();
        // Do not let this first no-button move reach Remotion's stale drag listener;
        // otherwise it performs one final seek before React removes that listener.
        event.stopPropagation();
      }
    };
  const onPointerCancel = (event: PointerEvent) => {
      if (activePreviewPointerRef.current?.pointerId === event.pointerId) releasePointer();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") releasePointer();
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", clearPointer, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("blur", releasePointer);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", clearPointer, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("blur", releasePointer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const handler = (event: WheelEvent) => {
      const workspace = timelineWorkspaceRef.current;
      if (!workspace) return;
      const target = event.target;
      if (!(target instanceof Node) || !workspace.contains(target)) return;
      if (target instanceof Element && target.closest("[data-asset-shelf-root]")) return;
      const scrollContainer =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-timeline-scroll-container='true']")
          : null;
      if (scrollContainer) return;

      const absDeltaX = Math.abs(event.deltaX);
      const absDeltaY = Math.abs(event.deltaY);
      const isHorizontal = event.shiftKey || (absDeltaX > horizontalScrollEpsilonPx && absDeltaX > absDeltaY);
      const isZoom = event.ctrlKey || event.metaKey;
      if (isHorizontal || isZoom) event.preventDefault();
    };

    document.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", handler, true);
  }, []);

  useEffect(() => {
    const panel = timelinePanelRef.current;
    if (!panel) return;
    const handler = (event: WheelEvent) => {
      const target = event.target;
      const scrollContainer =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-timeline-scroll-container='true']")
          : null;
      if (scrollContainer) return;
      const absDeltaX = Math.abs(event.deltaX);
      const absDeltaY = Math.abs(event.deltaY);
      const isHorizontal = event.shiftKey || (absDeltaX > horizontalScrollEpsilonPx && absDeltaX > absDeltaY);
      const isZoom = event.ctrlKey || event.metaKey;
      if (isHorizontal || isZoom) event.preventDefault();
    };
    panel.addEventListener("wheel", handler, { passive: false });
    return () => panel.removeEventListener("wheel", handler);
  }, []);

  const { settingsActions, setSettingsActions } = useWorkspaceChrome();
  const [controlsTarget, setControlsTarget] = useState<HTMLDivElement | null>(null);
  const playerNode = (
    <div
      style={{
        overflow: "hidden",
        // The field around the frame. Neutral D65 grey at ~5 cd/m² — the eye adapts to
        // this, so a tint here biases how the image inside it reads. See
        // docs/plans/2026-07-13-editor-chrome-redesign.md. Carries no text, by convention.
        background: "var(--viewing-surround)",
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        data-composition-master-frame="true"
        onPointerDownCapture={handlePreviewPointerDownCapture}
        style={{
          // Keep the composition frame square. Rounded editor chrome makes the
          // footage itself look masked even though the radius is not rendered.
          borderRadius: 0,
          // Unlike `hidden`, `clip` cannot become a programmatically scrolled
          // container when an editor overlay briefly extends beyond the canvas.
          // A hidden scroll container let focus/selection move the entire Player
          // upward, including Remotion's native transport.
          overflow: "clip",
          // A landscape frame needs no edge: the surround frames it. A border on only some sides let the
          // black backing show through as a dark line along the top and left.
          border: isPortraitComposition ? "1px solid rgba(255, 255, 255, 0.3)" : "none",
          background: "#000000",
          width: `min(calc(100cqw - 2 * var(--viewer-side-gutter, 0px)), calc(100cqh * ${compositionRatio}))`,
          height: "auto",
          maxWidth: "100%",
          maxHeight: "100%",
          aspectRatio: compositionAspectRatio,
          boxShadow: isPortraitComposition
            ? "0 0 0 1px rgba(0, 0, 0, 0.75), 0 18px 40px rgba(0, 0, 0, 0.28)"
            : "none",
          position: "relative",
        }}
        data-preview-state={readinessPhase}
        data-preview-session-id={readiness.state.sessionId}
        data-preview-required-pending={readiness.state.pendingCount}
      >
        <Player
          controlsTarget={controlsTarget}
          settingsTarget={settingsActions ?? undefined}
          onPreviousEditPoint={onPreviousEditPoint}
          onNextEditPoint={onNextEditPoint}
          key={PLAYER_RUNTIME_KEY}
          ref={handlePlayerRef}
          settings={<PreviewPlaybackSettings shape={shapeControl} accessory={viewerAccessory} projectId={projectId} nativeAvailable={nativeAvailable} renderer={renderBackend} needsConfirmation={rendererNeedsConfirmation} preparation={preparationMode} onPreparationChange={selectPreparation} onRendererChange={selectRenderer} reason={gpuRequested?gpuReason:nativeReason}/>}
          component={PreparedPlaybackComposition}
          // Cache modes use the selected engine to prepare effects. Ordinary
          // single-source footage uses the browser decoder; transferring Rust
          // RGBA frames for these cheap shots was slower than real time.
          inputProps={{projectId,live:previewLive,blocks:usesReady?readyBlocks!:usesBlocks?blockPrepared.blocks:undefined,url:needsPreparedPlayback&&prepared.status?.state==='ready'?prepared.status.url:undefined,overlayCaptions:preparationPlan.overlayCaptions,nativeProjectId:nativeEnabled&&!usesCache&&!gpuRequested?projectId:undefined,onNativeFailure:nativeFailed,gpu:gpuEnabled,onGpuFailure:gpuFailed}}
          playbackBlocked={prepared.blocked}
          autoPlayWhenReady={needsPreparedPlayback && prepared.status?.state==='ready'}
          resumeWhenUnblocked
          durationInFrames={durationInFrames}
          compositionWidth={compositionDimensions.width}
          compositionHeight={compositionDimensions.height}
          fps={currentFrameRate()}
          numberOfSharedAudioTags={TIMELINE_PLAYER_SHARED_AUDIO_TAGS}
          style={{
            width: "100%",
            display: "block",
            aspectRatio: compositionAspectRatio,
          }}
          // While the start gate is closed the native transport is REMOVED
          // rather than covered: an overlay cannot reliably intercept it at
          // every responsive size, and a native Play that bypasses the gate
          // permits a false playing interval with partial audio.
          controls={gpuRequested || nativeEnabled || usesCache || !isStartGateClosed}
        />
        <div ref={setControlsTarget} className={`editor-floating-transport${settingsActions ? "" : " editor-floating-transport--local-settings"}`} />
        {/* Preview options sit bottom-right inside the picture, level with the transport opposite; both appear on hover. */}
        <div className="editor-viewer-corner" role="group" aria-label="Preview options">
          <div ref={setSettingsActions} className="editor-viewer-corner-slot" />
        </div>
        {(gpuRequested || usesBlocks || (((nativeEnabled&&!needsPreparedPlayback)||playerInputProps.externalAudioPreview) && !prepared.blocked)) ? (
          <TimelinePreviewAudioMixer
            elements={mixedAudioElements}
            player={attachedPlayer}
            retryGeneration={mediaRetryGeneration}
          />
        ) : null}
        {noGpuDevice && renderBackend==='standard' && !(gpuRequested?gpuReason:nativeReason) && <ViewerNotice message={NO_GPU_DEVICE_MESSAGE} />}
        {(gpuRequested?gpuReason:nativeReason) && <ViewerNotice message={previewFallbackMessage(gpuRequested?'gpu':'rust',gpuRequested?gpuReason:nativeReason)} />}
        {interactionOverlayNode ?? null}
        {showPositionGrid ? (
          <svg data-preview-position-grid aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 20 }}>
            {[25, 50, 75].map((position) => (
              <g key={position} strokeWidth={position === 50 ? 1.5 : 1}>
                <path d={`M ${position} 0 V 100 M 0 ${position} H 100`} stroke="rgba(0,0,0,0.65)" vectorEffect="non-scaling-stroke" />
                <path d={`M ${position} 0 V 100 M 0 ${position} H 100`} stroke="rgba(255,255,255,0.85)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
        ) : null}
        {analysisOverlayNode ?? null}
        {!gpuRequested && !nativeEnabled && !usesCache && readinessOverlayNode}
        {usesCache && (!usesBlocks || blockPrepared.blocks.some(block=>!block.url)) && <PreparedPlaybackStatus status={prepared.status} onRetry={prepared.retry}/> }
        {!gpuRequested && !usesCache && preparationMode!=="live" && <div role="status" style={{position:"absolute",top:8,left:8,zIndex:35,background:"#0f172a",color:"white",padding:"5px 8px",fontSize:13,borderRadius:"var(--edge-control-inner)"}}>Live preview</div>}
        {isPlayerBuffering && readinessPhase === "playing" ? (
          <div
            data-preview-buffering="true"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              zIndex: 30,
              pointerEvents: "none",
              background: "rgba(0,0,0,0.55)",
              color: "rgba(255,255,255,0.9)",
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 11,
            }}
          >
            Buffering…
          </div>
        ) : null}
      </div>
    </div>
  );

  const timelinePanelCssVars = {
    "--color-bg-primary": chrome.deep,
    "--color-bg-secondary": chrome.panel,
    "--color-text-primary": chrome.ink,
    "--color-text-secondary": chrome.ink,
    "--color-text-muted": chrome.inkMuted,
    "--color-text-light": chrome.inkMuted,
    "--color-border": chrome.lineStrong,
  } as CSSProperties;

  // One grid serves both layouts so the timeline renderer stays mounted across a layout switch.
  // Vertical: Library left, viewer middle, Properties over the timeline right. Wide: tools beside
  // the viewer above a full-width timeline.
  const gridTemplateColumns = isPortraitPreview ? `${tallViewer}px minmax(0,1fr)` : toolsCollapsed ? "auto minmax(0,1fr)" : `${firstPanel.value}px minmax(0,1fr)`;
  return <div ref={timelineWorkspaceRef} style={{position:"relative",gridTemplateColumns,gridTemplateRows:`minmax(0,1fr) ${timelineSize.value}px`}} className={`editor-playback-workspace ${isPortraitPreview ? "editor-playback-workspace--vertical" : "editor-playback-workspace--horizontal"}`}>
    {isPortraitPreview
      ? <WorkspaceResizeHandle label="Resize preview" axis="x" value={tallViewer} min={previewMin} max={Math.max(previewMin, workspaceWidth - rightMin)} onChange={preview.change} onReset={preview.reset} style={{left:tallViewer-4,top:0,height:"100%"}} />
      : toolsCollapsed ? null : <WorkspaceResizeHandle label="Resize Library and Properties area" axis="x" value={firstPanel.value} min={firstMin} max={firstMax} onChange={firstPanel.change} onReset={firstPanel.reset} style={{left:firstPanel.value-4,top:0,height:`calc(100% - ${timelineSize.value}px)`}} />}
    <WorkspaceResizeHandle label="Resize timeline height" axis="y" reverse value={timelineSize.value} min={160} max={timelineMax} onChange={timelineSize.change} onReset={timelineSize.reset} style={isPortraitPreview ? {bottom:timelineSize.value-4,right:0,width:tallRight} : {bottom:timelineSize.value-4,left:0,right:0}} />
    <section aria-label="Preview" className="editor-viewer">
      {/* While a takeover shows, the edit's picture and its controls are out of reach (pointer and keyboard). */}
      <div ref={viewerStageRef} className="editor-viewer-stage" inert={viewerTakeoverNode ? true : undefined}>{playerNode}</div>
      {viewerTakeoverNode}
      {viewerEdgeNode ? <div className="editor-viewer-edge">{viewerEdgeNode}</div> : null}

    </section>
    {!isPortraitPreview && <section aria-label="Library and Properties" className="editor-tools">{toolNode ?? landscapeRightPanelNode?.("inspector")}</section>}
    {isPortraitPreview && <section aria-label="Properties" className="editor-inspector">{inspectorNode ?? landscapeRightPanelNode?.("inspector")}</section>}
    <section ref={timelinePanelRef} aria-label="Timeline" className="editor-timeline" style={timelinePanelCssVars}>
      {toolbarNode}{timelineNode}{bottomPanelNode}
    </section>
  </div>;
}

const DISMISSED_NOTICES_KEY = "dreamcut:dismissed-viewer-notices";

/** A renderer notice over the picture. Its X hides it for this tab; a different notice still shows. */
function ViewerNotice({ message }: { message: string | null }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try { setDismissed(message != null && (JSON.parse(sessionStorage.getItem(DISMISSED_NOTICES_KEY) ?? "[]") as string[]).includes(message)); } catch { setDismissed(false); }
  }, [message]);
  if (dismissed || !message) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      const seen = JSON.parse(sessionStorage.getItem(DISMISSED_NOTICES_KEY) ?? "[]") as string[];
      sessionStorage.setItem(DISMISSED_NOTICES_KEY, JSON.stringify([...new Set([...seen, message])]));
    } catch { /* Storage can be blocked; it stays hidden until the page reloads. */ }
  };
  return <div role="status" className="absolute right-2 top-2 z-40 flex items-start gap-1 rounded border border-[var(--edge-outline)] bg-popover py-1 pl-2 pr-1 text-xs text-popover-foreground">
    <span className="py-1">{message}</span>
    <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss" title="Dismiss" onClick={dismiss}><XIcon aria-hidden="true" /></Button>
  </div>;
}
