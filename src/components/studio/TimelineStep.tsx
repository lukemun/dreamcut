"use client";
import { isProjectFrameRate } from "@/lib/timeline/frame-quantization";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";
import { useWorkspaceChrome } from "@/app/WorkspaceChrome";
import { usePanelSize, WorkspaceResizeHandle } from "@/components/ui/workspace-resize";
import { useRouter } from "next/navigation";

import {useRendererChoice} from "./timeline/usePreviewPreparation";
import { blocksReviewShortcut } from "./timeline/playback-keyboard";
import { pendingProposalInbox } from "./timeline/proposal-inbox";
import { proposalInboxFeed } from "./timeline/proposal-inbox-feed";

import { mapProposalComparisonTime } from "./timeline/proposal-comparison";
import { useBeatAnnotations } from "@/components/studio/timeline/useBeatAnnotations";

import { cloneElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAgentSelection, useProjectReviewDock } from "@/components/desktop/ProjectReviewDock";
import { useHalfScreenWorkspace } from "@/components/studio/timeline/useHalfScreenWorkspace";
import { SelectionTray } from "@/components/studio/timeline/SelectionTray";
import { LayoutsPanel } from "@/components/studio/timeline/LayoutsPanel";
import { clipAspect, layoutSlotProps, type LayoutPreset } from "@/lib/timeline/layout-presets";
import { buildCompositingLaneOrder } from "@/lib/timeline/compositing-lanes";
import { isVisualLane } from "@/lib/timeline/lanes";
import { createPortal } from "react-dom";
import { type PlayerRef } from "@/lib/frame-runtime/player";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  LoaderCircleIcon,
  Redo2Icon,
  RotateCcwIcon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { reportError } from "@/lib/observability/report-error";
import { AssetShelf, type ElementCreatePayload } from "@/components/studio/timeline/AssetShelf";
import type { AudioEffectAction } from "@/lib/timeline/audio-effects";
import {
  COMPOUND_CLIP_ID_PROP,
  COMPOUND_CLIP_LABEL_PROP,
  compoundClipMembers,
  compoundSelectionIds,
  compoundSelectionItemCount,
} from "@/lib/timeline/compound-clips";
import {
  proposalPlaybackLeadInSeconds,
  resolveAuditionPlaybackRange,
  resolveLaneOrderPlaybackRange,
  resolveProposalPlaybackRange,
} from "@/lib/timeline/audition-playback";
import { buildLatestRenderFileUrl } from "@/lib/render/urls";
import { Button } from "@/components/ui/button";
import { useGenerationJobsTracker } from "@/components/studio/hooks/useGenerationJobsTracker";
import { usePanelShortcuts } from "@/components/studio/hooks/usePanelShortcuts";
import { matchesPanelShortcut } from "@/lib/panel-shortcuts";
import { CanvasTimeline } from "@/components/studio/timeline/CanvasTimeline";
import {
  CoverLayoutEditor,
  type CoverLayoutHistoryController,
} from "@/components/studio/timeline/CoverLayoutEditor";
import { TimelineHistoryButton, historyEntryLabel } from "@/components/studio/timeline/TimelineHistoryButton";
import type { PanelTextTarget } from "@/components/studio/timeline/PanelTextGalleries";
import { reviewMarkPill, timelineSelectionPill } from "@/components/studio/timeline/timeline-chat-selection";
import { FrameTagControls } from "@/components/studio/timeline/FrameTagControls";
import { FramePointOverlay } from "@/components/studio/timeline/FramePointOverlay";
import { ExportDialog, type ExportPhase } from "@/components/studio/timeline/ExportDialog";
import { EXPORTS_CHANGED_EVENT } from "@/components/studio/timeline/LibraryExports";
import { DEFAULT_EXPORT_RESOLUTION, type ExportResolution } from "@/lib/render/export-resolution";
import { isTimelineAspectRatioValue, type TimelineAspectRatioValue } from "@/lib/aspect-ratios";
import { LandscapeRightPanel } from "@/components/studio/timeline/LandscapeRightPanel";
import { SlideOutDrawer } from "@/components/studio/timeline/SlideOutDrawer";
import { MediaDrawer } from "@/components/studio/timeline/MediaDrawer";
import { LibraryEffectCatalog } from "@/components/studio/timeline/LibraryEffectCatalog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DrawerHeader } from "@/components/studio/timeline/DrawerHeader";
import type { ElementInspectorSubpanel } from "@/components/studio/timeline/ElementMenu";
import { resolveInspectorTarget } from "@/lib/timeline/inspector-target";
import {shouldPreparePlayback} from '@/lib/timeline/prepared-preview';
import { TimelinePlaybackShell } from "@/components/studio/timeline/TimelinePlaybackShell";
import { TimelineToolbar } from "@/components/studio/timeline/TimelineToolbar";
import { selectBackwardElementIds, selectForwardElementIds } from "@/components/studio/timeline/select-forward";
import {
  collectTimelineEditPointFrames,
  nextTimelineEditPointFrame,
  previousTimelineEditPointFrame,
} from "@/components/studio/timeline/timeline-edit-points";
import { TakeAuditionReview } from "@/components/studio/timeline/TakeAuditionReview";
import {
  TimelineCaptionCanvasOverlay,
  sourceAspectRatioAtTime,
  type CaptionPointerDownPayload,
} from "@/components/studio/timeline/TimelineCaptionCanvasOverlay";
import {
  PlatformPreviewControl,
  PlatformPreviewOverlay,
  readPlatformPreviewMode,
  type PlatformPreviewMode,
} from "@/components/studio/timeline/PlatformPreviewOverlay";
import {
  resolveCanvasCaptionDragPosition,
  resolveCanvasCaptionNudgePosition,
  type CanvasCaptionDragStart,
} from "@/components/studio/timeline/canvas-caption-drag";
import {
  MAX_LANE_SCALE,
  timelineMaxZoom,
  MIN_LANE_SCALE,
  MIN_VISIBLE_DURATION,
  buildLaneDefs,
  formatTime,
  getCompositionDimensions,
} from "@/components/studio/timeline/adapters";
import { resolveAnchoredZoomScroll } from "@/components/studio/timeline/useTimelineViewport";
import {
  ProposalsPanel,
  type ProposalOptionSelection,
  type ProposalPreviewSelection,
} from "@/components/studio/timeline/ProposalsPanel";
import { createTimelineClient } from "@/components/studio/timeline/timeline-client";
import { buildTimelineCompositionElements } from "@/components/studio/timeline/timeline-selectors";
import { buildTimelineTransitionLayout } from "@/lib/timeline/transitions";
import type { InstantPreviewProp } from "@/components/studio/timeline/proposal-preview-props";
import { instantPreviewStore } from "@/components/studio/timeline/instant-preview-store";
import type { CompositionElement } from "@/lib/render/composition-adapters";
import { resolveShelfPlacementPayload } from "@/components/studio/timeline/timeline-shelf-placement";
import { useTimelineEditor } from "@/components/studio/timeline/useTimelineEditor";
import { buildExternalSnapshotHistoryEntry } from "@/components/studio/timeline/external-history";
import { VideoShapeControl } from "@/components/studio/timeline/VideoShapeControl";
import { GenerateCaptionsControl } from "@/components/studio/timeline/GenerateCaptionsControl";
import {
  resolveProposalPreviewLaneOrder,
  resolveProposalPreviewMutedLanes,
  resolveProposalPreviewHiddenLanes,
} from "@/components/studio/timeline/proposal-preview-visibility";
import { useTimelineInspector } from "@/components/studio/timeline/useTimelineInspector";
import { useTimelinePlaybackController } from "@/components/studio/timeline/useTimelinePlaybackController";
import {
  timelineExpectsMountedMediaAtTime,
  previewClockAudioIdsAtTime,
  usePreviewReadiness,
  previewPreparationAtTime,
} from "@/components/studio/timeline/usePreviewReadiness";
import { timelineElementInspectorLabel, transitionJoinAvailability } from "@/components/studio/timeline/useTimelineTransitions";
import {
  buildCaptionPayloadsFromAudioLane,
  insertLaneBefore,
  nextCaptionsLaneKey,
  type VoiceClipRecord,
} from "@/components/studio/timeline/caption-lane-from-audio";
import { type GenerationJobSnapshot } from "@/lib/generation/jobs-client";
import { isActiveJobStatus } from "@/lib/generation/jobs";
import {
  captionPresetBaseXY,
  captionStylePropsFromRaw,
  composeCaptionProps,
  resolveCaptionContentRect,
  resolveCaptionProps,
} from "@/lib/timeline/captions";
import {
  applyChromaKeyReviewMode,
  isChromaKeyed,
  type ChromaKeyReviewMode,
} from "@/lib/timeline/chroma-key-review";
import {
  applyCutoutReviewMode,
  isAlphaCutout,
  type CutoutReviewMode,
} from "@/lib/timeline/cutout-review";
import type { FrameTag, FrameTagPoint, FrameTagsResponse } from "@/lib/review/frame-tag-types";
import type { HistoryEntry } from "@/components/studio/timeline/useTimelineHistory";
import type { PreviewAspectRatio, TimelineElement } from "@/components/studio/timeline/types";
import {
  resolveTimelineWorkspaceProfile,
  type TimelineWorkspaceProfileId,
} from "@/components/studio/timeline/workspace-profile";
import { getStoredItem } from "@/lib/persisted-key";

// ── Component ────────────────────────────────────────────────────────────────

type Props = {
  projectId: string;
  timelineHeaderAccessory?: ReactNode;
  initialHistoryEntries?: HistoryEntry[];
  externalRefreshToken?: number;
  workspaceProfileId?: TimelineWorkspaceProfileId;
  initialSeekSeconds?: number;
};

const timelineOutlineButtonClassName =
  "border-[var(--chrome-line-strong)] bg-white/40 text-[var(--ink)] hover:bg-white/80 hover:text-[var(--ink)]";

const timelineGhostButtonClassName =
  "text-[var(--ink)] hover:bg-white/60 hover:text-[var(--ink)]";

/**
 * Width of the agent-review drawer. It overlays the right-hand workspace so
 * opening review never recomputes or crushes the editor's carefully balanced
 * preview/timeline layout.
 */
const REVIEW_DRAWER_WIDTH = "min(480px, calc(100vw - 16px))";

type RenderStatus = "idle" | "rendering" | "complete" | "error";

/** The Library drawer's tabs: Library (images, video, music, sounds as its sub-tabs) and Generate. */
const LIBRARY_DRAWER_PANES = ["browse", "generate"] as const;
/** Wide's tool panel: what you shape on the timeline. Properties and Layouts join from the inspector. */
const TOOL_PANEL_PANES = ["captions", "text", "recipes"] as const;

export function TimelineStep({
  projectId,
  timelineHeaderAccessory,
  initialHistoryEntries,
  externalRefreshToken = 0,
  workspaceProfileId = "full",
  initialSeekSeconds,
}: Props) {
  const router = useRouter();
  const workspaceProfile = resolveTimelineWorkspaceProfile(workspaceProfileId);
  const capabilities = workspaceProfile.capabilities;
  const playerRef = useRef<PlayerRef>(null);
  const [playerInstance, setPlayerInstance] = useState<PlayerRef | null>(null);
  const [showPositionGrid, setShowPositionGrid] = useState(false);
  const { exportActions: headerActionsTarget } = useWorkspaceChrome();
  const [toolHeaderTarget, setToolHeaderTarget] = useState<HTMLDivElement | null>(null);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [generationReviewNonce, setGenerationReviewNonce] = useState(0);
  useEffect(() => {
    const showGenerationReview = () => {
      if (window.location.hash !== "#generate") return;
      router.replace(`/p/${encodeURIComponent(projectId)}/library?generate=create`);
    };
    showGenerationReview();
    window.addEventListener("hashchange", showGenerationReview);
    return () => window.removeEventListener("hashchange", showGenerationReview);
  }, [projectId, router]);
  const panelShortcuts = usePanelShortcuts();
  const [shelfWidth, setShelfWidth] = useState(480);
  const [layoutHistoryController, setLayoutHistoryController] =
    useState<CoverLayoutHistoryController | null>(null);
  const [cutoutReviewMode, setCutoutReviewMode] = useState<CutoutReviewMode>("composite");
  const [chromaKeyReviewMode, setChromaKeyReviewMode] = useState<ChromaKeyReviewMode>("composite");

  const [canvasCaptionPreview, setCanvasCaptionPreview] = useState<{
    elementId: string;
    props: Record<string, unknown>;
  } | null>(null);
  const canvasCaptionDragRef = useRef<CanvasCaptionDragStart | null>(null);
  const canvasCaptionDragCleanupRef = useRef<(() => void) | null>(null);

  // ── Render state ──────────────────────────────────────────────────────────
  const [rendererFailure,setRendererFailure]=useState<string|null>(null);
  const [renderBackend,setRenderBackend,rendererNeedsConfirmation] = useRendererChoice((process.env.NEXT_PUBLIC_DREAMCUT_NATIVE_PREVIEW ?? process.env.NEXT_PUBLIC_OPENEDIT_NATIVE_PREVIEW) === "1");
  const [showExportModal, setShowExportModal] = useState(false);
  const [chosenExportResolution, setExportResolution] = useState<ExportResolution>(DEFAULT_EXPORT_RESOLUTION);
  // Native exports up to 1080p; switching to it caps the choice instead of starting a job that fails.
  const maxExportResolution = renderBackend === "rust" ? DEFAULT_EXPORT_RESOLUTION : undefined;
  const exportResolution = maxExportResolution !== undefined && chosenExportResolution > maxExportResolution ? maxExportResolution : chosenExportResolution;
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("idle");
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderElapsed, setRenderElapsed] = useState(0);
  const renderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [renderFileName, setRenderFileName] = useState<string | null>(null);
  // Set when this dialog started the export, so it shows that export's progress and result.
  const [exportStartedHere, setExportStartedHere] = useState(false);
  const [deleteLaneConfirm, setDeleteLaneConfirm] = useState<{
    laneKey: string;
    laneLabel: string;
    elementCount: number;
  } | null>(null);
  const [isDeletingLane, setIsDeletingLane] = useState(false);
  const [frameTags, setFrameTags] = useState<FrameTag[]>([]);
  const [frameTagsBusy, setFrameTagsBusy] = useState(false);
  const clearingFrameTagsRef = useRef(false);
  const frameTagsReadEpochRef = useRef(0);
  const [pointMarkActive, setPointMarkActive] = useState(false);

  // ── Toast helper (delegates to sonner) ─────────────────────────────────

  // Toasts are for problems only: errors and warnings. Successful actions show
  // their result in place (the timeline, proposal list or button state) instead.
  const addToast = useCallback((message: string, type: "success" | "error" | "warning" = "success") => {
    if (type === "error") toast.error(message);
    else if (type === "warning") toast.warning(message);
  }, []);
  const addFrameTagToast = useCallback((message: string) => { void message; }, []);
  const addWarningToast = useCallback((message: string) => addToast(message, "warning"), [addToast]);

  useEffect(() => {
    if (!capabilities.reviewMarks) return;
    let cancelled = false;
    const loadFrameTags = () => {
      const epoch = frameTagsReadEpochRef.current;
      return fetch(`/api/projects/${projectId}/review/frame-tags`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load marks");
        return response.json() as Promise<FrameTagsResponse>;
      })
      .then((data) => {
        if (!cancelled && !clearingFrameTagsRef.current && epoch === frameTagsReadEpochRef.current) setFrameTags(data.tags);
      })
      .catch((error) => {
        if (!cancelled) reportError(error, "Failed to load timeline marks", { feature: "timeline.frame-tags" });
      });
    };
    void loadFrameTags();
    const handleProjectRestore = () => void loadFrameTags();
    window.addEventListener("timeline-editor:project-restored", handleProjectRestore);
    return () => {
      cancelled = true;
      window.removeEventListener("timeline-editor:project-restored", handleProjectRestore);
    };
  }, [capabilities.reviewMarks, projectId]);

  const logRenderToast = useCallback((
    level: "info" | "warn" | "error",
    toastMessage: string,
    details?: Record<string, unknown>,
  ) => {
    const payload = {
      level,
      projectId,
      toastMessage,
      ...(details ?? {}),
    };
    if (level === "warn") {
      console.warn("[timeline:render-toast]", payload);
      return;
    }
    console.info("[timeline:render-toast]", payload);
  }, [projectId]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const startRenderElapsedTimer = useCallback(() => {
    if (renderTimerRef.current) clearInterval(renderTimerRef.current);
    setRenderElapsed(0);
    renderTimerRef.current = setInterval(() => setRenderElapsed((t) => t + 1), 1000);
  }, []);

  const stopRenderElapsedTimer = useCallback(() => {
    if (renderTimerRef.current) {
      clearInterval(renderTimerRef.current);
      renderTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopRenderElapsedTimer(), [stopRenderElapsedTimer]);

  // An export that finishes while its dialog is closed says so with a pop-up; the dialog
  // already shows the result when open. The reveal callback is declared further down.
  const showExportModalRef = useRef(false);
  const revealRenderRef = useRef<() => void>(() => {});
  // The export dialog stays open through rendering and shows the finished file,
  // which stays in the project's renders folder (Open in folder reveals it).
  const handleRenderTerminalJob = useCallback(async (job: GenerationJobSnapshot) => {
    if (job.status === "completed") {
      stopRenderElapsedTimer();
      let previewUrl = buildLatestRenderFileUrl(projectId, { version: job.id }), fileName: string | null = null;
      try {
        const res = await fetch(`/api/projects/${projectId}/render/latest`);
        if (res.ok) {
          const data = await res.json() as { job?: { previewUrl?: string | null; fileName?: string | null } | null };
          previewUrl = data.job?.previewUrl ?? previewUrl;
          fileName = data.job?.fileName ?? null;
        }
      } catch {
        // The latest-render route is the fallback preview either way.
      }
      setRenderStatus("complete");
      setRenderUrl(previewUrl);
      setRenderFileName(fileName);
      setRenderError(null);
      logRenderToast("info", "Video rendered successfully!", { source: "terminal_job_completed", jobId: job.id, previewUrl });
      window.dispatchEvent(new Event(EXPORTS_CHANGED_EVENT));
      if (!showExportModalRef.current) {
        toast.success("Export finished", { description: "It's in Library → Exports.", action: { label: "Open in folder", onClick: () => revealRenderRef.current() } });
      }
      return;
    }
    if (job.status === "failed") {
      const message = job.error ?? "Render failed";
      stopRenderElapsedTimer();
      setRenderStatus("error");
      setRenderError(message);
      logRenderToast("error", message, { source: "terminal_job_failed", jobId: job.id, status: job.status });
      if (!showExportModalRef.current) toast.error("Export failed", { description: message });
    }
  }, [logRenderToast, stopRenderElapsedTimer, projectId]);

  const { jobsById: renderJobsById } = useGenerationJobsTracker({
    projectId,
    targetTypes: ["render"],
    trackedJobIds: renderJobId ? [renderJobId] : undefined,
    onTerminalJob: (job) => {
      if (job.targetType !== "render") return;
      if (renderJobId && job.id !== renderJobId) return;
      void handleRenderTerminalJob(job);
    },
  });

  const activeRenderJob = useMemo(() => {
    if (renderJobId && renderJobsById[renderJobId]) return renderJobsById[renderJobId];
    return Object.values(renderJobsById).find((job) => job.targetType === "render") ?? null;
  }, [renderJobId, renderJobsById]);
  const trackerShowsRenderInFlight = !!(activeRenderJob && isActiveJobStatus(activeRenderJob.status));
  const visibleRenderStatus: RenderStatus = trackerShowsRenderInFlight ? "rendering" : renderStatus;
  const visibleRenderUrl = visibleRenderStatus === "complete" ? renderUrl : null;
  const hasLastRender = visibleRenderStatus === "complete" && Boolean(visibleRenderUrl);
  const exportPhase: ExportPhase = visibleRenderStatus === "rendering" ? "exporting"
    : exportStartedHere && visibleRenderStatus === "complete" ? "done"
    : exportStartedHere && visibleRenderStatus === "error" ? "failed"
    : "settings";
  // Closing during an export keeps its result for the header's "Export ready".
  const closeExportModal = useCallback(() => {
    setShowExportModal(false);
    if (exportPhase !== "exporting") setExportStartedHere(false);
  }, [exportPhase]);
  const exportReady = exportPhase === "done" && !showExportModal;

  const revealRender = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/render/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(renderJobId ? { job_id: renderJobId } : {}),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not open the folder");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the folder");
    }
  }, [projectId, renderJobId]);
  revealRenderRef.current = () => void revealRender();
  showExportModalRef.current = showExportModal;

  useEffect(() => {
    if (renderStatus === "rendering" || renderStatus === "error") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/render/latest`);
        if (!res.ok) return;
        const data = await res.json() as {
          job?: {
            id: string;
            status: string;
            previewUrl?: string | null;
            fileName?: string | null;
            error: string | null;
          } | null;
        };
        if (cancelled || !data.job?.previewUrl) return;
        if (activeRenderJob && isActiveJobStatus(activeRenderJob.status)) return;
        setRenderStatus("complete");
        setRenderUrl(data.job.previewUrl);
        setRenderFileName(data.job.fileName ?? null);
        setRenderError(null);
      } catch {
        // Best-effort hydration only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRenderJob, renderStatus, projectId]);

  const [proposalPreviewDuration, setProposalPreviewDuration] = useState<number | null>(null);
  const {
    elements,
    beats,
    lanes,
    loading,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    selectedBeatId,
    setSelectedBeatId,
    selectedTransitionId,
    selectedTransition,
    selectTransition,
    selectedElement,
    selectedBeatLabel,
    transitionChips,
    selectedElementOutgoingTransition,
    selectedElementIncomingTransition,
    selectedElementOutgoingCandidate,
    mutedLanes,
    setMutedLanes,
    persistMutedLanes,
    hiddenLanes,
    setHiddenLanes,
    persistHiddenLanes,
    aspectRatio,
    previewAspectRatio: chosenLayout,
    setPreviewAspectRatio,
    persistOutputAspectRatio,
    frameRate,
    persistOutputFrameRate,
    outputFormatSaving,
    outputFormatError,
    zoomLevel,
    visibleDuration,
    scrollSec,
    setScrollSec,
    zoomTo,
    fitViewportToTimeline,
    fitTracksToViewport,
    setTimelineViewportHeight,
    playheadSec,
    setPlayheadSec,
    totalDuration,
    playbackDurationSeconds,
    beatMarkers,
    durationInFrames,
    compositionDimensions,
    compositionElements,
    playerInputProps,
    createElement,
    patchElement,
    patchElements,
    moveElement,
    moveElements,
    createTransition,
    patchTransition,
    previewTransition,
    deleteTransition,
    resizeElement,
    commitPlaybackRateFromInspector,
    previewInspectorDuration,
    previewInspectorPlaybackRate,
    clearInspectorResizePreview,
    inspectorResizePreviewState,
    inspectorSnapGuide,
    setTimelinePxPerSec,
    splitElement,
    duplicateElement,
    copyElement,
    cutElement,
    pasteElement,
    hasClipboard,
    toggleDisableElement,
    resetElement,
    normalizeElementLoudness,
    applyAudioEffect,
    applyVideoStabilization,
    splitCaptionElement,
    deleteElement,
    undo,
    redo,
    canUndo,
    canRedo,
    undoEntries,
    redoEntries,
    historyBusy,
    recordHistoryEntry,
    snapEnabled,
    setSnapEnabled,
    laneScale,
    setLaneScale,
    resizeLane,
    resizeBeatBoundary,
    fitBeatToVisualContent,
    moveBeatVisualsToBeatStart,
    addLane,
    deleteLane,
    reorderLanes,
    applyCaptionLaneStyleToLane,
    requestRefresh,
  } = useTimelineEditor({ projectId, addToast, initialHistoryEntries, previewDurationSeconds: proposalPreviewDuration, warmMediaInDom: renderBackend !== "gpu" });
  // Sharing the screen (e.g. half a display beside a coding agent) leaves little room for Tall's
  // columns, so the workspace opens Wide there. The Tall/Wide switch stays in the header, and a
  // pick made while half-screen wins until the window grows again.
  const halfScreen = useHalfScreenWorkspace();
  const [halfScreenPick, setHalfScreenPick] = useState<typeof chosenLayout | null>(null);
  useEffect(() => { if (!halfScreen) setHalfScreenPick(null); }, [halfScreen]);
  const previewAspectRatio = halfScreen ? halfScreenPick ?? "16:9" : chosenLayout;
  // Vertical workspace: Properties · Text · Captions sit over the timeline; Library, Music,
  // Sounds and Recipes open as a right-hand drawer from the timeline toolbar.
  const tallWorkspace = previewAspectRatio === "9:16";
  // A template's example playing full size in the preview, in place of the edit.
  const [templateExample, setTemplateExample] = useState<{ title: string; video: string; poster?: string } | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"properties" | "text" | "captions" | "recipes">("recipes");

  // The simple product workspace is intentionally one stable, wide editing
  // layout. Output aspect ratio remains a project/export concern.
  useEffect(() => {
    if (!capabilities.editorLayoutSwitcher && chosenLayout !== "16:9") {
      setPreviewAspectRatio("16:9");
    }
  }, [capabilities.editorLayoutSwitcher, chosenLayout, setPreviewAspectRatio]);

  // ── Agent proposal preview selection ──────────────────────────────────────
  // Declared ahead of the keyboard/mutation effects below, which must go inert
  // while a proposal draft is on screen. nonce lets re-clicking the same
  // option replay it (state identity changes).
  const [proposalPreviewSelection, setProposalPreviewSelection] = useState<(ProposalPreviewSelection & { nonce: number }) | null>(null);
  const proposalPreviewSelectionRef = useRef(proposalPreviewSelection);
  proposalPreviewSelectionRef.current = proposalPreviewSelection;
  const [platformPreviewMode, setPlatformPreviewMode] = useState<PlatformPreviewMode>("off");
  useEffect(() => {
    try {
      const saved = getStoredItem(localStorage, "dreamcut:platform-preview");
      const mode = readPlatformPreviewMode(saved);
      if (mode) setPlatformPreviewMode(mode);
    } catch { /* Storage can be unavailable in embeds. */ }
  }, []);
  const changePlatformPreviewMode = useCallback((mode: PlatformPreviewMode) => {
    setPlatformPreviewMode(mode);
    try { localStorage.setItem("dreamcut:platform-preview", mode); } catch {}
  }, []);
  // Ref mirror of the LIVE elements for the preview effect: removed-element
  // playback windows read base positions without re-running the effect (and
  // replaying the draft) every time the live timeline changes.
  const liveElementsRef = useRef(elements);
  liveElementsRef.current = elements;
  const liveLaneOrderKeysRef = useRef(playerInputProps.laneOrderKeys);
  liveLaneOrderKeysRef.current = playerInputProps.laneOrderKeys;

  const activeUndo = useCallback(() => {
    if (layoutHistoryController) {
      layoutHistoryController.undo();
      return;
    }
    void undo();
  }, [layoutHistoryController, undo]);
  const activeRedo = useCallback(() => {
    if (layoutHistoryController) {
      layoutHistoryController.redo();
      return;
    }
    void redo();
  }, [layoutHistoryController, redo]);
  const activeCanUndo = layoutHistoryController?.canUndo ?? canUndo;
  const activeCanRedo = layoutHistoryController?.canRedo ?? canRedo;
  const activeHistoryBusy = layoutHistoryController ? false : historyBusy;

  const appliedExternalRefreshTokenRef = useRef(externalRefreshToken);
  useEffect(() => {
    if (externalRefreshToken === appliedExternalRefreshTokenRef.current) return;
    appliedExternalRefreshTokenRef.current = externalRefreshToken;
    requestRefresh();
  }, [externalRefreshToken, requestRefresh]);

  const seekToTimelineTime = useCallback((seconds: number) => {
    const next = Math.min(Math.max(0, seconds), proposalPreviewDuration ?? playbackDurationSeconds);
    setPlayheadSec(next);
    playerRef.current?.seekTo(Math.round(next * currentFrameRate()));
  }, [playbackDurationSeconds, proposalPreviewDuration, setPlayheadSec]);

  const initialSeekAppliedRef = useRef(false);
  useEffect(() => {
    if (initialSeekAppliedRef.current || initialSeekSeconds === undefined || playbackDurationSeconds <= 0) return;
    initialSeekAppliedRef.current = true;
    seekToTimelineTime(initialSeekSeconds);
  }, [initialSeekSeconds, playbackDurationSeconds, seekToTimelineTime]);

  const addFrameTagAtPlayhead = useCallback(async (point?: FrameTagPoint) => {
    if (frameTagsBusy) return false;
    setFrameTagsBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/review/frame-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeline_seconds: playheadSec,
          selected_element_ids: selectedIds,
          ...(point ? { point } : {}),
        }),
      });
      const data = await response.json() as FrameTagsResponse & {
        created?: boolean;
        updated?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Failed to mark frame");
      setFrameTags(data.tags);
      const historyEntry = data.history
        ? buildExternalSnapshotHistoryEntry(data.history.before, data.history.after)
        : null;
      if (historyEntry) recordHistoryEntry(historyEntry);
      addFrameTagToast(
        point
          ? data.updated
            ? "Point added to marked frame"
            : data.created === false
              ? "That point is already marked"
              : "Point marked"
          : data.created === false
            ? "That frame is already marked"
            : "Frame marked",
      );
      return true;
    } catch (error) {
      reportError(error, "Failed to mark timeline frame", { feature: "timeline.frame-tags" });
      addToast(error instanceof Error ? error.message : "Failed to mark frame", "error");
      return false;
    } finally {
      setFrameTagsBusy(false);
    }
  }, [addFrameTagToast, addToast, frameTagsBusy, playheadSec, recordHistoryEntry, selectedIds, projectId]);

  const removeFrameTagById = useCallback(async (tagId: string) => {
    if (frameTagsBusy) return;
    setFrameTagsBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/review/frame-tags?id=${encodeURIComponent(tagId)}`, { method: "DELETE" });
      const data = await response.json() as FrameTagsResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to remove mark");
      setFrameTags(data.tags);
      const historyEntry = data.history
        ? buildExternalSnapshotHistoryEntry(data.history.before, data.history.after)
        : null;
      if (historyEntry) recordHistoryEntry(historyEntry);
    } catch (error) {
      reportError(error, "Failed to remove timeline mark", { feature: "timeline.frame-tags" });
      addToast(error instanceof Error ? error.message : "Failed to remove mark", "error");
    } finally {
      setFrameTagsBusy(false);
    }
  }, [addToast, frameTagsBusy, recordHistoryEntry, projectId]);

  const clearAllFrameTags = useCallback(async () => {
    if (frameTagsBusy || clearingFrameTagsRef.current || frameTags.length === 0) return;
    const previousTags = frameTags;
    clearingFrameTagsRef.current = true;
    frameTagsReadEpochRef.current += 1;
    setFrameTags([]);
    setFrameTagsBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/review/frame-tags?all=true`, { method: "DELETE" });
      const data = await response.json() as FrameTagsResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to clear marks");
      setFrameTags(data.tags);
      const historyEntry = data.history
        ? buildExternalSnapshotHistoryEntry(data.history.before, data.history.after)
        : null;
      if (historyEntry) recordHistoryEntry(historyEntry);
      addToast("All frame marks cleared");
    } catch (error) {
      setFrameTags(previousTags);
      reportError(error, "Failed to clear timeline marks", { feature: "timeline.frame-tags" });
      addToast(error instanceof Error ? error.message : "Failed to clear marks", "error");
    } finally {
      frameTagsReadEpochRef.current += 1;
      clearingFrameTagsRef.current = false;
      setFrameTagsBusy(false);
    }
  }, [addToast, frameTags, frameTagsBusy, recordHistoryEntry, projectId]);

  useEffect(() => {
    if (!capabilities.reviewMarks) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) return;
      event.preventDefault();
      void addFrameTagAtPlayhead();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [addFrameTagAtPlayhead, capabilities.reviewMarks]);

  // Server routes that mutate project state return before/after snapshot descriptors;
  // recording them here makes those mutations reachable from the visible Undo button.
  const recordServerMutationHistory = useCallback((history: {
    before: { id: string; op: string; at: string };
    after: { id: string; op: string; at: string };
  }) => {
    const entry = buildExternalSnapshotHistoryEntry(history.before, history.after);
    if (entry) recordHistoryEntry(entry);
  }, [recordHistoryEntry]);

  useEffect(() => {
    const onTitleSaved = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.projectId === projectId && detail.history) recordServerMutationHistory(detail.history);
    };
    window.addEventListener("timeline-editor:project-title-saved", onTitleSaved);
    return () => window.removeEventListener("timeline-editor:project-title-saved", onTitleSaved);
  }, [projectId, recordServerMutationHistory]);

  // Persist OUTSIDE the state updater: React StrictMode double-invokes updaters,
  // and a side-effectful updater fired two PATCHes (and two Undo entries) per click.
  const updateMutedLanes = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    const next = updater(new Set(mutedLanes));
    setMutedLanes(next);
    void persistMutedLanes(next).catch(() => {
      addToast("Failed to save lane mute state", "error");
    });
  }, [addToast, mutedLanes, persistMutedLanes, setMutedLanes]);

  const toggleLaneHidden = useCallback((laneKey: string) => {
    const next = new Set(hiddenLanes);
    if (next.has(laneKey)) next.delete(laneKey); else next.add(laneKey);
    setHiddenLanes(next);
    void persistHiddenLanes(next).catch(() => {
      addToast("Failed to save lane visibility", "error");
    });
  }, [addToast, hiddenLanes, persistHiddenLanes, setHiddenLanes]);

  const isPortraitPreview = previewAspectRatio === "9:16";
  // Both layouts open Media on demand, at the same width as Review.
  const shelfAlwaysOpen = false;

  const handleStartExport = useCallback(async () => {
    setExportStartedHere(true);
    setRenderError(null);
    // Show the new export as running at once; otherwise the previous render's "complete"
    // status reads as "Export complete" until the server answers.
    setRenderStatus("rendering");
    setRenderUrl(null);
    setRenderFileName(null);
    startRenderElapsedTimer();
    try {
      if(rendererNeedsConfirmation)throw Error("Choose a renderer in Preview settings to confirm the same renderer for both.");
      if(rendererFailure)throw Error(`Preview renderer is unavailable. Choose Standard in Preview settings and review it before exporting. ${rendererFailure}`);
      const res = await fetch(`/api/projects/${projectId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          muted_lane_keys: Array.from(mutedLanes),
          hidden_lane_keys: Array.from(hiddenLanes),
          backend: renderBackend,
          resolution: exportResolution,
        }),
      });
      const data = await res.json() as {
        job_id?: string;
        status?: string;
        already_in_progress?: boolean;
        error?: string;
        error_code?: string;
        user_message?: string;
      };
      if (!res.ok || !data.job_id) {
        // The open export dialog shows why the export could not start.
        const message = data.user_message ?? data.error ?? "Failed to start render";
        stopRenderElapsedTimer();
        setRenderStatus("error");
        setRenderError(message);
        logRenderToast("error", message, {
          source: data.error_code === "render_duration_limit_exceeded" ? "start_export_rejected" : "start_export_failed",
          errorCode: data.error_code ?? null,
        });
        return;
      }
      setRenderJobId(data.job_id);
      if (data.already_in_progress) {
        logRenderToast("warn", "Render already in progress for this project", {
          source: "start_export_already_in_progress",
          jobId: data.job_id,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start render";
      stopRenderElapsedTimer();
      setRenderStatus("error");
      setRenderError(message);
      logRenderToast("error", message, {
        source: "start_export_exception",
      });
      reportError(error, "Failed to start render", { feature: "timeline.start-export" });
    }
  }, [logRenderToast, hiddenLanes, mutedLanes, startRenderElapsedTimer, stopRenderElapsedTimer, projectId, renderBackend,rendererNeedsConfirmation,rendererFailure,exportResolution]);

  // Selected beat range for looping
  const selectedBeat = useMemo(
    () => (selectedBeatId ? beatMarkers.find((b) => b.id === selectedBeatId) ?? null : null),
    [selectedBeatId, beatMarkers],
  );

  const [pendingTransitionPair, setPendingTransitionPair] = useState<{from: string; to: string} | null>(null);
  useEffect(() => { if (selectedElement || selectedTransition) setPendingTransitionPair(null); }, [selectedElement, selectedTransition]);
  const pendingFrom = elements.find(element => element.id === pendingTransitionPair?.from) ?? null;
  const pendingCandidate = transitionJoinAvailability(pendingFrom, elements, beatMarkers).candidate;
  const inspectorTransitionCandidate = pendingCandidate?.toElementId === pendingTransitionPair?.to ? pendingCandidate : null;
  const openTransitionJoin = (from: string, to: string) => {
    const existing = transitionChips.find(chip => chip.from_element_id === from && chip.to_element_id === to);
    setSelectedIds([]);
    setSelectedBeatId(null);
    selectTransition(existing?.id ?? null);
    setPendingTransitionPair(existing ? null : {from, to});
  };
  const inspectorTransition = selectedTransition;
  const [inspectorDomain, setInspectorDomain] = useState<ElementInspectorSubpanel>("position");
  const inspectorElement = resolveInspectorTarget(elements, selectedElement, playheadSec, inspectorDomain === "audio" ? "audio" : "picture");
  // Selecting something opens its Properties; clearing the selection offers Recipes instead of an empty pane.
  const hasInspectorSelection = Boolean(selectedElement || selectedTransition);
  useEffect(() => {
    setInspectorTab(tab => hasInspectorSelection ? (tab === "recipes" ? "properties" : tab) : (tab === "properties" ? "recipes" : tab));
  }, [hasInspectorSelection]);

  const transitionFromLabel = useMemo(() => {
    if (!inspectorTransition) return "";
    const el = elements.find((e) => e.id === inspectorTransition.from_element_id);
    if (!el) return inspectorTransition.from_element_id.slice(0, 6);
    return timelineElementInspectorLabel(el, beatMarkers);
  }, [inspectorTransition, elements, beatMarkers]);

  const transitionToLabel = useMemo(() => {
    if (!inspectorTransition) return "";
    const el = elements.find((e) => e.id === inspectorTransition.to_element_id);
    if (!el) return inspectorTransition.to_element_id.slice(0, 6);
    return timelineElementInspectorLabel(el, beatMarkers);
  }, [inspectorTransition, elements, beatMarkers]);
  const timeDisplayPrecision = 1;
  const selectedElements = useMemo(
    () => selectedIds
      .map((elementId) => elements.find((element) => element.id === elementId) ?? null)
      .filter((element): element is TimelineElement => element !== null),
    [elements, selectedIds],
  );
  const selectedTimelineItemCount = useMemo(
    () => compoundSelectionItemCount(elements, selectedIds),
    [elements, selectedIds],
  );
  const combineIntoCompoundClip = useCallback(async (elementIds: string[]) => {
    const members = elementIds
      .map((elementId) => elements.find((element) => element.id === elementId) ?? null)
      .filter((element): element is TimelineElement => element != null && !element.removed_at);
    if (members.length < 2) return;
    const compoundId = crypto.randomUUID();
    const saved = await patchElements(members.map((element) => ({
      elementId: element.id,
      patch: {
        props: {
          [COMPOUND_CLIP_ID_PROP]: compoundId,
          [COMPOUND_CLIP_LABEL_PROP]: "Compound clip",
        },
      },
    })));
    if (!saved) return;
    setSelectedIds(members.map((element) => element.id));
    addToast(`Combined ${members.length} clips. Shared audio effects now apply to every member.`, "success");
  }, [addToast, elements, patchElements, setSelectedIds]);

  const breakApartCompoundClip = useCallback(async (elementId: string) => {
    const selected = elements.find((element) => element.id === elementId) ?? null;
    const members = compoundClipMembers(elements, selected);
    if (members.length === 0) return;
    const saved = await patchElements(members.map((element) => ({
      elementId: element.id,
      patch: {
        props: {
          [COMPOUND_CLIP_ID_PROP]: null,
          [COMPOUND_CLIP_LABEL_PROP]: null,
          compound_preview: null,
        },
      },
    })));
    if (!saved) return;
    setSelectedIds([elementId]);
    addToast("Compound clip separated", "success");
  }, [addToast, elements, patchElements, setSelectedIds]);

  const compoundEffectTargets = useCallback((elementId: string) => {
    const selected = elements.find((element) => element.id === elementId) ?? null;
    const members = compoundClipMembers(elements, selected);
    const candidates = members.length > 1 ? members : selected ? [selected] : [];
    return candidates.filter((element) => element.source_url && [
      "video_clip",
      "vo_segment",
      "vo_full",
      "music",
      "sound_effect",
    ].includes(element.type));
  }, [elements]);

  const applyAudioEffectToCompound = useCallback(async (
    elementId: string,
    action: AudioEffectAction,
    options?: { strength?: number },
  ) => {
    const targets = compoundEffectTargets(elementId);
    if (targets.length === 0) return false;
    for (const target of targets) {
      const applied = await applyAudioEffect(target.id, action, options);
      if (!applied) return false;
    }
    return true;
  }, [applyAudioEffect, compoundEffectTargets]);

  const normalizeCompoundLoudness = useCallback(async (elementId: string) => {
    const targets = compoundEffectTargets(elementId);
    if (targets.length === 0) return false;
    for (const target of targets) {
      const normalized = await normalizeElementLoudness(target.id);
      if (!normalized) return false;
    }
    return true;
  }, [compoundEffectTargets, normalizeElementLoudness]);
  const forwardSelectionIds = useMemo(
    () => selectForwardElementIds(elements, playheadSec),
    [elements, playheadSec],
  );
  const backwardSelectionIds = useMemo(
    () => selectBackwardElementIds(elements, playheadSec),
    [elements, playheadSec],
  );
  const selectBackward = useCallback(() => {
    if (proposalPreviewSelection || backwardSelectionIds.length === 0) return;
    selectTransition(null);
    setSelectedBeatId(null);
    setSelectedIds(backwardSelectionIds);
    addToast(`Selected ${backwardSelectionIds.length} ${backwardSelectionIds.length === 1 ? "item" : "items"} left of the playhead`);
  }, [addToast, backwardSelectionIds, proposalPreviewSelection, selectTransition, setSelectedBeatId, setSelectedIds]);
  const selectForward = useCallback(() => {
    if (proposalPreviewSelection || forwardSelectionIds.length === 0) return;
    selectTransition(null);
    setSelectedBeatId(null);
    setSelectedIds(forwardSelectionIds);
    addToast(`Selected ${forwardSelectionIds.length} ${forwardSelectionIds.length === 1 ? "item" : "items"} right of the playhead`);
  }, [addToast, forwardSelectionIds, proposalPreviewSelection, selectTransition, setSelectedBeatId, setSelectedIds]);
  const selectedCaptionCount = selectedElements.filter(
    (element) => element.type === "caption_text",
  ).length;
  const selectedLayoutProposalId = typeof selectedElement?.props?.layout_proposal_id === "string"
    ? selectedElement.props.layout_proposal_id
    : null;

  useEffect(() => {
    if (selectedLayoutProposalId) setShelfOpen(true);
  }, [selectedLayoutProposalId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      // Draft preview on screen: deletes target the LIVE timeline and must not
      // fire while the canvas is showing proposal elements.
      if (proposalPreviewSelection) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      if (selectedIds.length > 0) {
        event.preventDefault();
        for (const elementId of selectedIds) {
          void deleteElement(elementId);
        }
        return;
      }
      if (selectedTransitionId) {
        event.preventDefault();
        void deleteTransition(selectedTransitionId);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteElement, deleteTransition, proposalPreviewSelection, selectedIds, selectedTransitionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) return;
      if (proposalPreviewSelection) return;

      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        setSnapEnabled((current) => !current);
      } else if (key === "s" && selectedElement) {
        event.preventDefault();
        void splitElement(selectedElement.id, playheadSec);
      } else if (event.key === "[" && backwardSelectionIds.length > 0) {
        event.preventDefault();
        selectBackward();
      } else if (event.key === "]" && forwardSelectionIds.length > 0) {
        event.preventDefault();
        selectForward();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [backwardSelectionIds.length, forwardSelectionIds.length, playheadSec, proposalPreviewSelection, selectBackward, selectForward, selectedElement, setSnapEnabled, splitElement]);

  // Shift+Z fits the time range horizontally. Track height remains independent
  // through direct lane resizing or Option/Alt+wheel over the timeline.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      fitViewportToTimeline();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fitViewportToTimeline]);

  const {
    editVolume,
    setEditVolume,
    editTrimStart,
    setEditTrimStart,
    editTrimEnd,
    setEditTrimEnd,
    editFadeIn,
    setEditFadeIn,
    editFadeOut,
    setEditFadeOut,
    editCaptionText,
    setEditCaptionText,
    setEditCaptionPosition,
    editAnimationIn,
    setEditAnimationIn,
    editAnimationOut,
    setEditAnimationOut,
    editAnimInDuration,
    setEditAnimInDuration,
    editAnimOutDuration,
    setEditAnimOutDuration,
    commitAnimInDuration,
    commitAnimOutDuration,
    editCaptionFontPreset,
    setEditCaptionFontPreset,
    editCaptionStyleVariant,
    setEditCaptionStyleVariant,
    editCaptionFontSize,
    setEditCaptionFontSize,
    editCaptionAbsX,
    setEditCaptionAbsX,
    editCaptionAbsY,
    setEditCaptionAbsY,
    editMediaScale,
    setEditMediaScale,
    editMediaOffsetX,
    setEditMediaOffsetX,
    editMediaOffsetY,
    setEditMediaOffsetY,
    editMediaOpacity,
    setEditMediaOpacity,
    editMaskFeather,
    setEditMaskFeather,
    editMirrorCenter,
    setEditMirrorCenter,
    editMirrorHeight,
    setEditMirrorHeight,
    editMaskTop,
    setEditMaskTop,
    editMaskRight,
    setEditMaskRight,
    editMaskBottom,
    setEditMaskBottom,
    editMaskLeft,
    setEditMaskLeft,
    selectElement,
    commitVolume,
    toggleVolumeKeyframeAtPlayhead,
    volumeKeyedAtPlayhead,
    commitTrimStart,
    commitTrimEnd,
    commitFadeIn,
    commitFadeOut,
    previewSelectedEffectProps,
    patchSelectedElementProps,
    patchSelectedCaptionProps,
    commitCaptionText,
    commitCaptionFontSize,
    applyCaptionAbsPosition,
    commitCaptionAbsPos,
    commitCaptionPositionPreset,
    editDuration,
    setEditDuration,
    commitDuration,
    selectedElementPreviewProps,
    selectedVisualGroupPreviewProps,
    previewVisualTransform,
    clearVisualTransformPreview,
    commitVisualTransform,
    commitVisualTransformValues,
    resetVisualTransform,
    motionPreset,
    applyMotionPreset,
    previewMaskInset,
    commitMaskInset,
    previewMediaEffect,
    commitMediaEffect,
    editColorGrade,
    setEditColorGrade,
    previewColorGrade,
    commitColorGrade,
    resetColorGradeControls,
    toggleColorGradeKeyframeAtPlayhead,
    colorGradeKeyedAtPlayhead,
    clearColorGradeKeyframes,
    editChromaKeyColor,
    editChromaKeyTolerance,
    editChromaKeySoftness,
    editChromaKeySpill,
    setEditChromaKey,
    previewChromaKey,
    commitChromaKey,
    resetChromaKeyControls,
    toggleChromaKeyKeyframeAtPlayhead,
    chromaKeyKeyedAtPlayhead,
    advancedColorGrade,
    previewAdvancedColorGrade,
    commitAdvancedColorGrade,
    toggleAdvancedColorGradeKeyframeAtPlayhead,
    advancedColorGradeKeyedAtPlayhead,
    colorGradeLut,
    applyColorGradeLut,
    previewColorGradeLutIntensity,
    commitColorGradeLutIntensity,
    toggleColorGradeLutKeyframeAtPlayhead,
    lutIntensityKeyedAtPlayhead,
    previewMirrorBand,
    commitMirrorBand,
    resetMediaEffects,
    resetMaskInset,
    addTransformKeyframeAtPlayhead,
    toggleTransformKeyframeAtPlayhead,
    addMaskKeyframeAtPlayhead,
    addOpacityKeyframeAtPlayhead,
    transformKeyedAtPlayhead,
    transformFieldKeyedAtPlayhead,
    maskKeyedAtPlayhead,
    opacityKeyedAtPlayhead,
    clearVisualKeyframes,
    editStart,
    setEditStart,
    commitStart,
    selectedLocalPlayheadSec,
  } = useTimelineInspector({
    selectedElement: inspectorElement,
    selectedElements,
    setSelectedId,
    patchElement,
    patchElements,
    moveElement,
    resizeElement,
    splitCaptionElement,
    playheadSec,
    getPlayheadSec: () => {
      const currentFrame = playerRef.current?.getCurrentFrame();
      return currentFrame == null ? playheadSec : currentFrame / currentFrameRate();
    },
    elements,
    onWarning: addWarningToast,
  });

  useEffect(() => () => canvasCaptionDragCleanupRef.current?.(), []);

  const handleCaptionPointerDown = useCallback((payload: CaptionPointerDownPayload) => {
    const element = elements.find((candidate) => candidate.id === payload.elementId);
    if (!element || element.type !== "caption_text") return;

    canvasCaptionDragCleanupRef.current?.();
    selectElement(element.id);
    canvasCaptionDragRef.current = {
      elementId: element.id,
      pointerClientX: payload.pointerClientX,
      pointerClientY: payload.pointerClientY,
      frameWidthPx: payload.frameWidthPx,
      frameHeightPx: payload.frameHeightPx,
      contentWidthRatio: payload.contentWidthRatio,
      contentHeightRatio: payload.contentHeightRatio,
      initialAbsX: payload.initialAbsX,
      initialAbsY: payload.initialAbsY,
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    let latestPosition = {
      absX: payload.initialAbsX,
      absY: payload.initialAbsY,
    };
    let moved = false;

    const onPointerMove = (event: PointerEvent) => {
      const start = canvasCaptionDragRef.current;
      if (!start || start.elementId !== element.id) return;
      latestPosition = resolveCanvasCaptionDragPosition(start, event.clientX, event.clientY);
      moved = moved
        || Math.abs(event.clientX - start.pointerClientX) >= 2
        || Math.abs(event.clientY - start.pointerClientY) >= 2;
      if (!moved) return;
      const current = resolveCaptionProps(element.props);
      setCanvasCaptionPreview({
        elementId: element.id,
        props: {
          ...(element.props ?? {}),
          ...current,
          absX: latestPosition.absX,
          absY: latestPosition.absY,
          offsetX: 0,
          offsetY: 0,
          groupLayout: null,
          benchmarkStackLayout: null,
        },
      });
    };

    function cleanupDrag() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      canvasCaptionDragRef.current = null;
      canvasCaptionDragCleanupRef.current = null;
    }

    function finishDrag() {
      cleanupDrag();

      if (!moved) {
        setCanvasCaptionPreview(null);
        return;
      }

      // `element` is narrowed by the guard above, but TS does not flow that
      // narrowing into hoisted function declarations — re-narrow locally.
      const captionElement = element;
      if (!captionElement) return;
      const current = resolveCaptionProps(captionElement.props);
      void patchElement(captionElement.id, {
        props: {
          ...(captionElement.props ?? {}),
          ...current,
          absX: latestPosition.absX,
          absY: latestPosition.absY,
          offsetX: 0,
          offsetY: 0,
          groupLayout: null,
          benchmarkStackLayout: null,
        },
      });
      setCanvasCaptionPreview(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    canvasCaptionDragCleanupRef.current = cleanupDrag;
  }, [elements, patchElement, selectElement]);

  const cutoutReviewElementId = useMemo(() => {
    if (selectedElement && isAlphaCutout(selectedElement)) return selectedElement.id;
    return compositionElements.find(isAlphaCutout)?.id ?? null;
  }, [compositionElements, selectedElement]);

  const chromaKeyReviewElementId = useMemo(() => {
    if (selectedElement && isChromaKeyed(selectedElement)) return selectedElement.id;
    return compositionElements.find(isChromaKeyed)?.id ?? null;
  }, [compositionElements, selectedElement]);

  // ── Agent proposal review: audition-style click-to-play, approve/reject ──
  const proposalsClient = useMemo(() => createTimelineClient(projectId), [projectId]);
  const [pendingProposalCount, setPendingProposalCount] = useState(0);
  const [staleProposalCount, setStaleProposalCount] = useState(0);
  const [takeAuditionCount, setTakeAuditionCount] = useState(0);
  const dock = useProjectReviewDock();
  // The timeline selection (including Shift multi-select) is also chat context: each selected
  // item is a removable pill, and removing one deselects it here.
  // Timeline selection joins the project selection the agent reads, with or without the chat dock.
  const agentSelection = useAgentSelection();
  const replaceChatSelectionGroup = agentSelection?.replaceSelectionGroup;
  useEffect(() => {
    if (!replaceChatSelectionGroup) return;
    const laneLabels = new Map(lanes.map((lane) => [lane.key, lane.label]));
    const byId = new Map(elements.map((element) => [element.id, element]));
    replaceChatSelectionGroup("timeline", selectedIds.flatMap((id) => {
      const element = byId.get(id);
      if (!element) return [];
      return [{ ...timelineSelectionPill(element, laneLabels.get(element.lane_key) ?? element.lane_key, beatMarkers), group: "timeline",
        onRemove: () => setSelectedIds((current) => current.filter((selected) => selected !== id)) }];
    }));
  }, [beatMarkers, elements, lanes, replaceChatSelectionGroup, selectedIds, setSelectedIds]);
  // Review marks ride along with the next message too; removing a pill leaves that mark out
  // of the message without deleting it.
  const [marksLeftOut, setMarksLeftOut] = useState<ReadonlySet<string>>(() => new Set());
  // Marks already live beside the timeline; only the chat composer needs them repeated as pills.
  useEffect(() => {
    if (!dock || !replaceChatSelectionGroup) return;
    replaceChatSelectionGroup("marks", frameTags.filter((tag) => !marksLeftOut.has(tag.id)).map((tag) => ({
      ...reviewMarkPill(tag), group: "marks",
      onRemove: () => setMarksLeftOut((current) => new Set([...current, tag.id])),
    })));
  }, [dock, frameTags, marksLeftOut, replaceChatSelectionGroup]);
  // Labeled by default: icon-only navigation forced first-time creators to guess (2026-10-10 audit). Narrowing hides labels.
  // Icons only by default (names on hover); drag the rail wider to show names. New key: the old default showed names.
  const toolRail = usePanelSize("dreamcut:tool-rail-width-v2", 52, 52, 108);
  const [localReviewOpen, setLocalReviewOpen] = useState(false);
  const reviewDrawerOpen = dock ? dock.tab === "proposals" : localReviewOpen;
  // Library and Proposals slide out from the same side (away from the preview), so one closes the other.
  // The Library (with Generate, Music and Sounds) lives only in this drawer (restored 2026-10-13, as before
  // Oct 12): Tall's drawer is the shelf itself; Wide's tool panel keeps Captions, Text, Templates and Properties.
  const [wideLibraryOpen, setWideLibraryOpen] = useState(false);
  const [wideLibraryMounted, setWideLibraryMounted] = useState(false);
  const libraryDrawerOpen = tallWorkspace ? shelfOpen : wideLibraryOpen;
  useEffect(() => { if (reviewDrawerOpen) { if (tallWorkspace) setShelfOpen(false); setWideLibraryOpen(false); } }, [tallWorkspace, reviewDrawerOpen]);
  useEffect(() => { if (tallWorkspace) setWideLibraryOpen(false); }, [tallWorkspace]);
  const reviewOpenRef = useRef(reviewDrawerOpen);
  reviewOpenRef.current = reviewDrawerOpen;
  const setDockTab = dock?.setTab;
  const setReviewDrawerOpen = useCallback((value: boolean | ((open: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(reviewOpenRef.current) : value;
    if (setDockTab) setDockTab(next ? "proposals" : "chat");
    else setLocalReviewOpen(next);
  }, [setDockTab]);
  // Clicking the open rail item again folds the tool panel to the rail and gives the viewer the width.
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  // Layouts stays open while clips are picked on the timeline (that is how its slots get filled).
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const openToolPane = useCallback((pane: "shelf" | "properties" | "layouts") => {
    setShelfOpen(pane === "shelf");
    setLayoutsOpen(pane === "layouts");
    setToolsCollapsed(false);
  }, []);
  const [proposalRefreshToken, setProposalRefreshToken] = useState(0);
  const compoundPreparing = useRef(false);
  const preparePresenterCompound = useCallback(async (elementId: string) => {
    if (compoundPreparing.current) return;
    const selected = elements.find(e => e.id === elementId);
    if (!selected) return;
    const members = elements.filter(e => !e.removed_at && e.lane_key === selected.lane_key && e.props?.speech_sync_binding);
    compoundPreparing.current = true;
    addToast("Preparing lightweight continuous presenter proxy. Originals stay editable…");
    try {
      const response = await fetch(`/api/projects/${projectId}/timeline/compounds`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({element_ids:members.map(e=>e.id),label:"Presenter compound · lightweight proxy"}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Compound preparation failed");
      setProposalRefreshToken(n=>n+1);
      setReviewDrawerOpen(true);
      addToast("Lightweight presenter compound ready in Review. Preview it before applying.", "success");
    } catch(error) { addToast(error instanceof Error?error.message:"Compound preparation failed", "error"); }
    finally { compoundPreparing.current = false; }
  }, [elements,projectId,addToast]);
  const reviewAttentionCount = pendingProposalCount + staleProposalCount + takeAuditionCount;
  const setReviewAttention = dock?.setAttentionCount;
  useEffect(() => { setReviewAttention?.(reviewAttentionCount); }, [setReviewAttention, reviewAttentionCount]);
  const updateProposalCounts = useCallback((actionable: number, stale: number) => {
    setPendingProposalCount(actionable);
    setStaleProposalCount(stale);
  }, []);
  // The fixed dock announces incoming work without replacing an active chat.
  // Legacy embedded drawers retain their automatic arrival/open behavior.
  const pendingDecisionCount = pendingProposalCount + takeAuditionCount;
  const previousDecisionCountRef = useRef(0);
  useEffect(() => {
    if (pendingDecisionCount > previousDecisionCountRef.current) {
      if (!setDockTab) setReviewDrawerOpen(true);
      if (!setDockTab) addToast(
        pendingDecisionCount === 1
          ? "A proposal awaits review"
          : `${pendingDecisionCount} proposals await review`,
      );
    }
    if (!setDockTab && pendingDecisionCount === 0 && previousDecisionCountRef.current > 0) {
      setReviewDrawerOpen(false);
    }
    previousDecisionCountRef.current = pendingDecisionCount;
  }, [addToast, pendingDecisionCount, setDockTab, setReviewDrawerOpen]);

  // A/B compare: while a draft is previewed, flip the SAME time window between
  // the draft and the live cut. Comparing is the instrument for grade/reframe
  // options — playing each option in turn and remembering is not.
  const [compareShowingLive, setCompareShowingLive] = useState(false);
  const compareShowingLiveRef = useRef(false);
  const proposalComparisonRangeRef = useRef<{start: number; end: number} | null>(null);
  const toggleProposalComparison = useCallback(() => {
    compareShowingLiveRef.current = !compareShowingLiveRef.current;
    setCompareShowingLive(compareShowingLiveRef.current);
  }, []);
  const [proposalPreviewElements, setProposalPreviewElements] = useState<CompositionElement[] | null>(null);
  const [proposalPreviewTimelineElements, setProposalPreviewTimelineElements] = useState<TimelineElement[] | null>(null);
  const [proposalPreviewLaneOrderKeys, setProposalPreviewLaneOrderKeys] = useState<string[] | null>(null);
  const [proposalPreviewMutedLanes, setProposalPreviewMutedLanes] = useState<Set<string> | null>(null);
  const [proposalPreviewHiddenLanes, setProposalPreviewHiddenLanes] = useState<Set<string> | null>(null);
  const [proposalPreviewAspectRatio, setProposalPreviewAspectRatio] = useState<TimelineAspectRatioValue | null>(null);

  const [proposalPreviewLoading, setProposalPreviewLoading] = useState(false);
  const [pendingProposalPlayback, setPendingProposalPlayback] = useState<{ start: number; end: number } | null>(null);
  const [pendingProposalFocus, setPendingProposalFocus] = useState<number | null>(null);
  const displayedPlaybackDuration = compareShowingLive ? playbackDurationSeconds : proposalPreviewDuration ?? playbackDurationSeconds;
  const displayedDurationInFrames = Math.max(1, Math.round(displayedPlaybackDuration * currentFrameRate()));
  const displayedTimelineElements = compareShowingLive
    ? elements
    : proposalPreviewTimelineElements ?? elements;
  const timelineEditPointFrames = useMemo(
    () => collectTimelineEditPointFrames(displayedTimelineElements, displayedDurationInFrames),
    [displayedDurationInFrames, displayedTimelineElements],
  );
  // Elements the previewed proposal option touches — tinted on the timeline canvas
  // so the reviewed change is visible structurally, not only audible in the player.
  const [proposalPreviewTouchedIds, setProposalPreviewTouchedIds] = useState<Set<string> | null>(null);
  /** Remaining Play-all queue; advanced by a timer when each window finishes. */
  const proposalQueueRef = useRef<ProposalPreviewSelection[]>([]);
  const proposalPlayTimerRef = useRef<number | null>(null);

  const clearProposalPlayTimer = useCallback(() => {
    if (proposalPlayTimerRef.current != null) {
      window.clearTimeout(proposalPlayTimerRef.current);
      proposalPlayTimerRef.current = null;
    }
  }, []);

  /** Audition-style entry: one selection plays it; several play back to back. */
  const playProposalOptions = useCallback((selections: ProposalPreviewSelection[]) => {
    if (selections.length === 0) return;
    setProposalPreviewLoading(true);
    clearProposalPlayTimer();
    proposalQueueRef.current = selections.slice(1);
    setProposalPreviewSelection({ ...selections[0]!, nonce: Date.now() });
  }, [clearProposalPlayTimer]);

  // Picture dials show at once on the shown draft; the full derived preview replaces it when it arrives.
  // Only the player's draft changes per drag sample: the dragged clip's props, every other
  // element keeps its identity. The timeline lanes update once, from the derived preview.
  const showInstantProposalPreview = useCallback((proposalId: string, props: InstantPreviewProp[]) => {
    if (props.length === 0 || proposalPreviewSelectionRef.current?.proposalId !== proposalId || compareShowingLiveRef.current) return;
    instantPreviewStore.set(proposalId, props);
  }, []);
  // Dragged values belong to the shown draft only.
  useEffect(() => { instantPreviewStore.clear(); }, [proposalPreviewElements, compareShowingLive]);

  const tuneProposalOption = useCallback((selection: ProposalOptionSelection & { focusTimeSeconds?: number }) => {
    clearProposalPlayTimer();
    proposalQueueRef.current = [];
    setPendingProposalPlayback(null);
    setProposalPreviewSelection(current => current?.batch?.some(item => item.proposalId === selection.proposalId && item.optionId === selection.optionId)
      ? { ...current, batch: current.batch.map(item => item.proposalId === selection.proposalId ? selection : item), preserveFrame: true, nonce: Date.now() }
      : { ...selection, preserveFrame: true, nonce: Date.now() });
  }, [clearProposalPlayTimer]);

  /** Batch review: compose independent proposals at their actual shared times. */
  const playProposalBatch = useCallback((selections: ProposalOptionSelection[]) => {
    if (selections.length === 0) return;
    setProposalPreviewLoading(true);
    clearProposalPlayTimer();
    proposalQueueRef.current = [];
    setProposalPreviewSelection({
      proposalId: "batch",
      optionId: "selected-edits",
      optionLabel: `Selected edits (${selections.length})`,
      batch: selections,
      nonce: Date.now(),
    });
  }, [clearProposalPlayTimer]);

  const exitProposalPreview = useCallback(() => {
    clearProposalPlayTimer();
    proposalQueueRef.current = [];
    setProposalPreviewSelection(null);
  }, [clearProposalPlayTimer]);

  const closeShelf = useCallback(() => setShelfOpen(false), []);
  const closeReviewDrawer = useCallback(() => {
    setReviewDrawerOpen(false);
  }, [setReviewDrawerOpen]);

  // The Review drawer is a view onto proposal state, not the owner of it.
  // Sliding the drawer away keeps an active temporary preview on the timeline;
  // Back to live inside the proposal card explicitly exits that preview.
  useEffect(() => {
    if (!capabilities.proposals || !reviewDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented || blocksReviewShortcut(event.target)) return;
      event.preventDefault();
      closeReviewDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [capabilities.proposals, closeReviewDrawer, reviewDrawerOpen]);

  const toggleLibraryDrawer = () => {
    const next = !libraryDrawerOpen;
    if (tallWorkspace) setShelfOpen(next);
    else { setWideLibraryOpen(next); if (next) setWideLibraryMounted(true); }
    if (next) setReviewDrawerOpen(false);
  };
  const toggleLibraryDrawerRef = useRef(toggleLibraryDrawer);
  toggleLibraryDrawerRef.current = toggleLibraryDrawer;

  // The configured key toggles the shared Library drawer from the editor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesPanelShortcut(event, panelShortcuts.library)) return;
      event.preventDefault();
      toggleLibraryDrawerRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panelShortcuts.library]);

  // The configured key switches between Chat and Proposals without replacing the preview.
  useEffect(() => {
    if (!capabilities.proposals && takeAuditionCount === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesPanelShortcut(event, panelShortcuts.proposals)) return;
      event.preventDefault();
      setReviewDrawerOpen((open) => !open);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [capabilities.proposals, panelShortcuts.proposals, takeAuditionCount, setReviewDrawerOpen]);

  // B latches the comparison side; R must preserve that choice.
  useEffect(() => {
    if (!proposalPreviewSelection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (blocksReviewShortcut(event.target) || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      toggleProposalComparison();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [proposalPreviewSelection, toggleProposalComparison]);

  useEffect(() => {
    if (!capabilities.proposals) return;
    // Shares the Review panel's inbox poll: one conditional request serves both.
    // The badge counts every actionable proposal, whether it offers one result
    // or a mutually exclusive set of choices.
    return proposalInboxFeed(proposalsClient).subscribe((list) => {
      const inbox = pendingProposalInbox(list.proposals);
      updateProposalCounts(inbox.actionable, inbox.stale);
    });
  }, [capabilities.proposals, proposalsClient, updateProposalCounts]);

  const previewPlayerInputProps = useMemo(() => {
    // A proposal draft replaces the whole element set; inspector/canvas
    // overlays describe the LIVE timeline and must not leak into the draft.
    // Flipping to "live" during compare falls through to the normal path, so
    // both sides of the comparison are built by the same chain.
    if (proposalPreviewElements && !compareShowingLive) {
      return {
        ...playerInputProps,
        elements: proposalPreviewElements,
        laneOrderKeys: proposalPreviewLaneOrderKeys ?? playerInputProps.laneOrderKeys,
        externalAudioPreview: true,
      };
    }
    const elementsWithInspectorPreview = selectedVisualGroupPreviewProps
      ? compositionElements.map((element) => selectedVisualGroupPreviewProps[element.id]
        ? { ...element, props: selectedVisualGroupPreviewProps[element.id] }
        : element)
      : inspectorElement && selectedElementPreviewProps
        ? compositionElements.map((element) =>
          element.id === inspectorElement.id
            ? { ...element, props: selectedElementPreviewProps }
            : element)
        : compositionElements;
    const elementsWithCanvasPreview = canvasCaptionPreview
      ? elementsWithInspectorPreview.map((element) =>
        element.id === canvasCaptionPreview.elementId
          ? { ...element, props: canvasCaptionPreview.props }
          : element)
      : elementsWithInspectorPreview;
    return {
      ...playerInputProps,
      externalAudioPreview: true,
      elements: applyChromaKeyReviewMode(
        applyCutoutReviewMode(elementsWithCanvasPreview, cutoutReviewElementId, cutoutReviewMode),
        chromaKeyReviewElementId,
        chromaKeyReviewMode,
      ),
    };
  }, [canvasCaptionPreview, chromaKeyReviewElementId, chromaKeyReviewMode, compareShowingLive, compositionElements, cutoutReviewElementId, cutoutReviewMode, playerInputProps, proposalPreviewElements, proposalPreviewLaneOrderKeys, inspectorElement, selectedElementPreviewProps, selectedVisualGroupPreviewProps]);

  const startPointMark = useCallback(() => {
    if (pointMarkActive) {
      setPointMarkActive(false);
      return;
    }
    playerRef.current?.pause();
    setPointMarkActive(true);
  }, [pointMarkActive]);

  const pickFramePoint = useCallback((point: FrameTagPoint) => {
    // Keep the mode armed so one frame mark can collect an ordered path.
    // Enter, Escape or Done exits the mode without removing saved points.
    void addFrameTagAtPlayhead(point);
  }, [addFrameTagAtPlayhead]);

  const playerInteractionOverlayNode = (
    <>
      <TimelineCaptionCanvasOverlay
        elements={previewPlayerInputProps.elements}
        playheadSec={playheadSec}
        compositionDimensions={compositionDimensions}
        selectedCaptionId={selectedElement?.type === "caption_text" ? selectedElement.id : null}
        onCaptionPointerDown={handleCaptionPointerDown}
        onCaptionSelect={selectElement}
      />
      {capabilities.reviewMarks ? (
        <FramePointOverlay
          armed={pointMarkActive}
          busy={frameTagsBusy}
          tags={frameTags}
          playheadSec={playheadSec}
          onPick={pickFramePoint}
          onCancel={() => setPointMarkActive(false)}
        />
      ) : null}
    </>
  );

  const captionKeyboardPositionRef = useRef<{
    elementId: string;
    absX: number;
    absY: number;
  } | null>(null);

  useEffect(() => {
    if (!selectedElement || selectedElement.type !== "caption_text") {
      captionKeyboardPositionRef.current = null;
      return;
    }
    const props = resolveCaptionProps(selectedElement.props);
    const fallback = captionPresetBaseXY(props.positionPreset, props.maxWidth);
    captionKeyboardPositionRef.current = {
      elementId: selectedElement.id,
      absX: props.absX ?? fallback.x,
      absY: props.absY ?? fallback.y,
    };
  }, [selectedElement]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Properties navigation and value controls own their arrow keys. The
      // selected caption must not turn navigation into a persisted nudge.
      if (event.target instanceof Element && event.target.closest('[role="tab"], [role="radio"], [role="slider"], [role="separator"], [role="combobox"]')) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      if (!selectedElement || selectedElement.type !== "caption_text") return;

      const current = captionKeyboardPositionRef.current;
      if (!current || current.elementId !== selectedElement.id) return;
      const sourceAspectRatio = sourceAspectRatioAtTime(
        previewPlayerInputProps.elements,
        selectedElement.timeline_start,
      );
      const contentRect = resolveCaptionContentRect(
        sourceAspectRatio,
        compositionDimensions.width / compositionDimensions.height,
      );
      const next = resolveCanvasCaptionNudgePosition({
        key: event.key,
        stepPx: event.shiftKey ? 10 : 1,
        frameWidthPx: compositionDimensions.width,
        frameHeightPx: compositionDimensions.height,
        contentWidthRatio: contentRect.width,
        contentHeightRatio: contentRect.height,
        currentAbsX: current.absX,
        currentAbsY: current.absY,
      });
      if (!next) return;

      event.preventDefault();
      captionKeyboardPositionRef.current = {
        elementId: selectedElement.id,
        absX: next.absX,
        absY: next.absY,
      };
      applyCaptionAbsPosition(next.absX, next.absY);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [applyCaptionAbsPosition, compositionDimensions, previewPlayerInputProps.elements, selectedElement]);

  // Stage C readiness gate. This is one transport path, not a feature flag:
  // every preview start goes through the same Player-owned lifecycle.
  // The gate waits only for media that should exist at the current playhead.
  // Global "this project has audio" logic deadlocks valid gaps — for example
  // this audition's first music begins at 0.33s, so no real node exists at 0.
  const expectsRealMedia = useMemo(
    () => timelineExpectsMountedMediaAtTime(
      previewPlayerInputProps.elements,
      playheadSec,
      previewPlayerInputProps.externalAudioPreview,
    ),
    [playheadSec, previewPlayerInputProps.elements, previewPlayerInputProps.externalAudioPreview],
  );
  const requiredExternalAudioIds = useMemo(() => previewPlayerInputProps.externalAudioPreview && !shouldPreparePlayback(previewPlayerInputProps.elements,displayedDurationInFrames)
    ? previewClockAudioIdsAtTime(previewPlayerInputProps.elements, playheadSec)
    : [], [playheadSec, previewPlayerInputProps.elements, previewPlayerInputProps.externalAudioPreview, displayedDurationInFrames]);
  const previewReadiness = usePreviewReadiness({ expectsRealMedia: expectsRealMedia || requiredExternalAudioIds.length > 0,
    externalAudioPreview: previewPlayerInputProps.externalAudioPreview && !shouldPreparePlayback(previewPlayerInputProps.elements,displayedDurationInFrames),
    requiredExternalAudioIds,
    ...previewPreparationAtTime(previewPlayerInputProps.elements, playheadSec),
  });

  const {
    isPlaying,
    isPlayerBuffering,
    isFullscreen,
    togglePlay,
    seekToFrame,
    playRange,
  } = useTimelinePlaybackController({
    playerRef,
    playerInstance,
    durationInFrames: displayedDurationInFrames,
    selectedBeat: selectedBeat ? { startSec: selectedBeat.startSec, endSec: selectedBeat.endSec } : null,
    setPlayheadSec,
    undo: activeUndo,
    redo: activeRedo,
    replayShortcutDisabled: reviewDrawerOpen,
    readiness: previewReadiness,
  });
  // Playing the edit (e.g. Space) returns the preview to it from a template example.
  useEffect(() => { if (isPlaying) setTemplateExample(null); }, [isPlaying]);

  // Capture before the proposal panel's R handler can reload the draft.
  useEffect(() => {
    if (!proposalPreviewSelection) return;
    const replayLive = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "r" || !compareShowingLiveRef.current || event.repeat
        || event.metaKey || event.ctrlKey || event.altKey) return;
      if (blocksReviewShortcut(event.target) || event.isComposing || event.defaultPrevented) return;
      const range = proposalComparisonRangeRef.current;
      if (!range || !proposalPreviewTimelineElements) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearProposalPlayTimer();
      proposalQueueRef.current = [];
      setPendingProposalPlayback({
        start: mapProposalComparisonTime(range.start, proposalPreviewTimelineElements, elements),
        end: mapProposalComparisonTime(range.end, proposalPreviewTimelineElements, elements, true),
      });
    };
    document.addEventListener("keydown", replayLive, true);
    return () => document.removeEventListener("keydown", replayLive, true);
  }, [proposalPreviewSelection, proposalPreviewTimelineElements, elements, clearProposalPlayTimer]);

  // Start only after React has committed the draft's duration to the Player.
  // Otherwise a proposal extending an empty/short cut is clamped to the live end.
  useEffect(() => {
    if (!pendingProposalPlayback) return;
    playRange(pendingProposalPlayback.start, pendingProposalPlayback.end);
    setPendingProposalPlayback(null);
  }, [pendingProposalPlayback, playRange]);

  // Wait until the new draft composition is mounted before moving to the
  // diagnostic frame. The shared transport pauses playback and owns the clock.
  useEffect(() => {
    if (pendingProposalFocus === null || !proposalPreviewElements) return;
    seekToFrame(Math.round(pendingProposalFocus * currentFrameRate()));
    setPendingProposalFocus(null);
  }, [pendingProposalFocus, proposalPreviewElements, seekToFrame]);

  // Deterministic transport handle for the muted browser probe
  // (scripts/verify-preview-first-load.ts). Drives the app's REAL seek/play
  // paths instead of clicking rendered controls, so first-load/readiness
  // measurements are not confounded by UI-automation flakiness. Local-only
  // app; intentionally present in the review (production) build too.
  useEffect(() => {
    const probe = {
      seekToFrame,
      togglePlay,
      getCurrentFrame: () => playerRef.current?.getCurrentFrame() ?? null,
      isPlaying: () => playerRef.current?.isPlaying() ?? false,
    };
    (window as Window & { __timelineTransportProbe?: typeof probe }).__timelineTransportProbe = probe;
    return () => {
      delete (window as Window & { __timelineTransportProbe?: typeof probe }).__timelineTransportProbe;
    };
  }, [seekToFrame, togglePlay]);

  const playAuditionCandidates = useCallback((timelineElementIds: string[]) => {
    const range = resolveAuditionPlaybackRange(timelineElementIds, elements);
    if (!range) {
      addToast("That take is no longer available on the timeline", "warning");
      return;
    }
    setSelectedBeatId(null);
    playRange(range.startSeconds, range.endSeconds);
  }, [addToast, elements, playRange, setSelectedBeatId]);

  // Fetch a proposal option's draft, swap it into the player, and PLAY it
  // through the affected window — the audition interaction, but the take is a
  // whole-timeline draft rather than a candidate clip. Lives below the
  // playback-controller destructure because it drives playRange.
  useEffect(() => {
    if (!proposalPreviewSelection) {
      compareShowingLiveRef.current = false;
      setCompareShowingLive(false);
      proposalComparisonRangeRef.current = null;
      setProposalPreviewLoading(false);
      setProposalPreviewElements(null);
      setProposalPreviewTimelineElements(null);
      setProposalPreviewLaneOrderKeys(null);
      setProposalPreviewMutedLanes(null);
      setProposalPreviewHiddenLanes(null);
      setProposalPreviewAspectRatio(null);
      setProposalPreviewDuration(null);
      setPendingProposalPlayback(null);
      setPendingProposalFocus(null);
      setProposalPreviewTouchedIds(null);
      return;
    }
    // The canvas is about to show DRAFT elements while the inspector and every
    // mutation path still target the LIVE timeline by id — drop the selection
    // so no inspector edit can write through the draft. CanvasTimeline's
    // readOnly mode blocks re-selecting until the preview exits.
    setSelectedIds([]);
    selectTransition(null);
    // A newly requested option starts on the draft side. Live replay bypasses this loader.
    compareShowingLiveRef.current = false;
    setCompareShowingLive(false);
    let cancelled = false;
    // Tuning replaces draft data in place. A loading row would shift the
    // controls under the pointer even though this request never starts playback.
    setProposalPreviewLoading(!proposalPreviewSelection.preserveFrame);
    void (async () => {
      try {
        const preview = proposalPreviewSelection.batch?.length
          ? await proposalsClient.previewProposalBatch(proposalPreviewSelection.batch.map((selection) => ({
              proposal_id: selection.proposalId,
              option_id: selection.optionId,
              ...(selection.overrides?.length ? { overrides: selection.overrides } : {}),
            })))
          : await proposalsClient.previewProposal(
              proposalPreviewSelection.proposalId,
              proposalPreviewSelection.optionId,
              proposalPreviewSelection.overrides,
            );
        if (cancelled) return;
        // Same derivation chain the live player uses: transition layout, then
        // composition elements — so the draft plays exactly as approval would.
        const layout = buildTimelineTransitionLayout(preview.timeline.elements ?? [], preview.timeline.transitions ?? []);
        setProposalPreviewDuration(Math.max(1, layout.effectiveDurationSeconds));
        const previewTimelineElements = preview.timeline.elements ?? [];
        const previewMutedLanes = resolveProposalPreviewMutedLanes({
          liveMutedLanes: mutedLanes,
          previewMutedLaneKeys: preview.timeline.muted_lane_keys ?? [...mutedLanes],
          previewElements: previewTimelineElements,
          touchedElementIds: preview.touched_element_ids ?? [],
        });
        const previewHiddenLanes = resolveProposalPreviewHiddenLanes({
          liveHiddenLanes: hiddenLanes,
          previewHiddenLaneKeys: preview.timeline.hidden_lane_keys ?? [...hiddenLanes],
          previewElements: previewTimelineElements,
          touchedElementIds: preview.touched_element_ids ?? [],
        });
        const previewLaneOrderKeys = resolveProposalPreviewLaneOrder({
          liveHiddenLanes: hiddenLanes,
          previewLaneOrderKeys: preview.timeline.lane_order_keys ?? [],
          previewElements: previewTimelineElements,
          touchedElementIds: preview.touched_element_ids ?? [],
        });
        setProposalPreviewElements(buildTimelineCompositionElements(layout.renderedElements, previewMutedLanes, previewHiddenLanes));
        setProposalPreviewTimelineElements(previewTimelineElements);
        setProposalPreviewMutedLanes(previewMutedLanes);
        setProposalPreviewHiddenLanes(previewHiddenLanes);
        setProposalPreviewLaneOrderKeys(previewLaneOrderKeys);
        setProposalPreviewAspectRatio(
          isTimelineAspectRatioValue(preview.timeline.aspect_ratio) ? preview.timeline.aspect_ratio : null,
        );
        setProposalPreviewTouchedIds(new Set(preview.touched_element_ids ?? []));

        // Updating controls only swaps the draft data; the mounted player keeps its clock.
        if (proposalPreviewSelection.preserveFrame) {
          if (proposalPreviewSelection.focusTimeSeconds !== undefined) setPendingProposalFocus(proposalPreviewSelection.focusTimeSeconds);
          return;
        }

        // Play the touched window with a short lead-in, like clicking a take.
        // Removed/replaced elements fall back to their BASE-timeline windows,
        // so a deletion-only option still plays its surrounding context.
        let range = resolveProposalPlaybackRange(
          preview.touched_element_ids,
          preview.timeline.elements ?? [],
          liveElementsRef.current,
          preview.review,
        );
        // Metadata-only proposals (notably lane reordering) have no touched
        // element IDs. Focus playback on the longest interval where two lanes
        // whose front/back relationship changed are simultaneously visible.
        range ??= resolveLaneOrderPlaybackRange(
          liveLaneOrderKeysRef.current,
          preview.timeline.lane_order_keys ?? [],
          preview.timeline.elements ?? [],
        );
        // Output-format and degenerate structural edits still need a visible
        // transport response even when no overlapping lane pair exists.
        const hasStructuralTimelineChange = preview.review.rows.some((row) => row.changes.some((change) =>
          change.target === "set_lane_order" || change.target === "set_output_format"));
        if (!range && hasStructuralTimelineChange) {
          range = { startSeconds: 0, endSeconds: Math.min(5, Math.max(0.8, layout.effectiveDurationSeconds)) };
        }
        let auditionEndFrame: number | null = null;
        if (range) {
          const startSeconds = Math.max(
            0,
            range.startSeconds - proposalPlaybackLeadInSeconds(preview.review),
          );
          const endSeconds = Math.max(range.endSeconds, startSeconds + 0.8);
          // Short pop-ins can finish before a newly selected draft's images
          // decode. Warm the opening picture window before starting its clock.
          const openingStillUrls = [...new Set(previewTimelineElements
            .filter(element => !element.removed_at && element.type === "still"
              && !previewHiddenLanes.has(element.lane_key)
              && element.timeline_start < Math.min(endSeconds, startSeconds + 2)
              && element.timeline_start + element.duration > startSeconds)
            .map(element => element.source_url)
            .filter((url): url is string => Boolean(url)))];
          await Promise.all(openingStillUrls.map(async url => {
            const image = new window.Image();
            image.src = url;
            let timeout: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                image.decode(),
                new Promise<never>((_, reject) => {
                  timeout = setTimeout(() => reject(new Error("Opening images are still loading. Please try Replay again.")), 10000);
                }),
              ]);
            } finally { if (timeout) clearTimeout(timeout); }
          }));
          if (cancelled) return;
          proposalComparisonRangeRef.current = { start: startSeconds, end: endSeconds };
          setPendingProposalPlayback({ start: startSeconds, end: endSeconds });
          auditionEndFrame = Math.round(endSeconds * currentFrameRate());
        }
        const next = proposalQueueRef.current[0];
        if (next && auditionEndFrame != null) {
          // Follow the actual player clock: buffering and manual pauses must
          // not consume a candidate's comparison window.
          const endFrame = auditionEndFrame;
          let observedWindow = false;
          const advanceWhenFinished = () => {
            if (cancelled) return;
            const frame = playerRef.current?.getCurrentFrame();
            if (frame != null && frame < endFrame - 1) observedWindow = true;
            if (!observedWindow || frame == null || frame < endFrame - 1) {
              proposalPlayTimerRef.current = window.setTimeout(advanceWhenFinished, 100);
              return;
            }
            proposalQueueRef.current = proposalQueueRef.current.slice(1);
            setProposalPreviewSelection({ ...next, nonce: Date.now() });
          };
          proposalPlayTimerRef.current = window.setTimeout(advanceWhenFinished, 100);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error && error.name === "TimeoutError"
            ? "Preview took too long to load. Please try Replay again."
            : error instanceof Error ? error.message : "Proposal playback failed");
          exitProposalPreview();
        }
      } finally {
        if (!cancelled) setProposalPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [exitProposalPreview, hiddenLanes, mutedLanes, proposalPreviewSelection, proposalsClient, selectTransition, setSelectedIds]);

  // Selected pictures a layout can fill, front-most first in the renderer's own stacking order.
  const layoutClips = useMemo(() => {
    const visualLaneKeys = elements.filter(element => !element.removed_at && isVisualLane(element.lane_key)).map(element => element.lane_key);
    const captionLaneKeys = elements.filter(element => !element.removed_at && element.lane_key.startsWith("captions_")).map(element => element.lane_key);
    const frontFirst = buildCompositingLaneOrder({ visualLaneKeys, captionLaneKeys, persistedLaneOrderKeys: playerInputProps.laneOrderKeys ?? [] }).reverse();
    return selectedIds.map(id => elements.find(element => element.id === id))
      .filter((element): element is TimelineElement => !!element && !element.removed_at && (element.type === "video_clip" || element.type === "still"))
      .sort((a, b) => frontFirst.indexOf(a.lane_key) - frontFirst.indexOf(b.lane_key));
  }, [elements, playerInputProps.laneOrderKeys, selectedIds]);
  const displayedCompositionDimensions = useMemo(
    () => proposalPreviewAspectRatio
      ? getCompositionDimensions(proposalPreviewAspectRatio)
      : compositionDimensions,
    [compositionDimensions, proposalPreviewAspectRatio],
  );

  const proposalPreviewLanes = useMemo(
    () => proposalPreviewTimelineElements
      ? buildLaneDefs(
          proposalPreviewTimelineElements,
          new Map(),
          laneScale,
          {},
          proposalPreviewLaneOrderKeys ?? [],
        )
      : null,
    [laneScale, proposalPreviewLaneOrderKeys, proposalPreviewTimelineElements],
  );

  const addShelfElement = useCallback(
    async (payload: ElementCreatePayload, atSec: number = playheadSec) => {
      if (proposalPreviewSelection) {
        // The canvas is showing a proposal draft; a shelf add would write to
        // the live timeline underneath it.
        addToast("Leave the proposal preview to add media", "warning");
        return;
      }
      const nextPayload = await resolveShelfPlacementPayload({
        payload,
        playheadSec: atSec,
        lanes,
        elements,
        addLane,
      });
      if (!nextPayload) return;
      await createElement(nextPayload, { toastLabel: "Added to timeline" });
    },
    [addLane, addToast, createElement, elements, lanes, playheadSec, proposalPreviewSelection],
  );

  const replaceSelectedMusic = useCallback(async (payload: ElementCreatePayload) => {
    if (!selectedElement || selectedElement.type !== "music" || !payload.source_url) return;
    await patchElement(selectedElement.id, {
      source_url: payload.source_url,
      duration: payload.duration,
      trim_start: payload.trim_start ?? 0,
      trim_end: payload.trim_end ?? null,
      props: {
        ...(selectedElement.props ?? {}),
        ...(payload.props ?? {}),
      },
    });
    addToast("Replaced selected music");
  }, [addToast, patchElement, selectedElement]);

  const panelTextTarget = useMemo<PanelTextTarget>(() => {
    if (!selectedElement || selectedElement.type !== "caption_text" || proposalPreviewSelection) return null;
    const lane = lanes.find((entry) => entry.key === selectedElement.lane_key);
    return { elementId: selectedElement.id, laneKey: selectedElement.lane_key, laneLabel: lane?.label ?? selectedElement.lane_key, props: selectedElement.props ?? {} };
  }, [lanes, proposalPreviewSelection, selectedElement]);
  const patchShelfTextProps = useCallback(
    (elementId: string, props: Record<string, unknown>) => patchElement(elementId, { props }),
    [patchElement],
  );

  const applySelectedCaptionStyleToLane = useCallback(async () => {
    if (!selectedElement || selectedElement.type !== "caption_text") return;
    await applyCaptionLaneStyleToLane(
      selectedElement.lane_key,
      captionStylePropsFromRaw(selectedElement.props),
    );
  }, [applyCaptionLaneStyleToLane, selectedElement]);

  const createCaptionsLaneAbove = useCallback(async (laneKey: string) => {
    const audioElements = elements
      .filter((element) => element.lane_key === laneKey && (element.type === "vo_segment" || element.type === "vo_full"))
      .sort((a, b) => a.timeline_start - b.timeline_start);

    if (audioElements.length === 0) {
      addToast("No dialogue or narration clips found on this lane", "warning");
      return;
    }

    let clips: VoiceClipRecord[] = [];
    try {
      const response = await fetch(`/api/projects/${projectId}/voice/clips`);
      const body = await response.json().catch(() => ({})) as { clips?: VoiceClipRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load voice clips");
      }
      clips = Array.isArray(body.clips) ? body.clips : [];
    } catch (error) {
      reportError(error, "Failed to load voice clips", { feature: "timeline.load-voice-clips" });
      return;
    }

    const voiceClipsById = new Map(
      clips
        .filter((clip): clip is VoiceClipRecord => typeof clip.id === "string" && clip.id.length > 0)
        .map((clip) => [clip.id, clip]),
    );
    const captionLaneKey = nextCaptionsLaneKey([
      ...lanes.map((lane) => lane.key),
      ...elements.map((element) => element.lane_key),
    ]);
    const captionPayloads = buildCaptionPayloadsFromAudioLane({
      audioElements,
      captionLaneKey,
      voiceClipsById,
    });

    if (captionPayloads.length === 0) {
      addToast("No voice transcript text found for this lane", "warning");
      return;
    }

    reorderLanes(insertLaneBefore(lanes.map((lane) => lane.key), laneKey, captionLaneKey));

    let createdCount = 0;
    for (const payload of captionPayloads) {
      const createdId = await createElement(payload, {
        selectCreated: false,
        suppressToast: true,
      });
      if (createdId) createdCount += 1;
    }

    if (createdCount === 0) {
      addToast("Failed to create caption clips for this lane", "error");
      return;
    }

    addToast(
      `Created ${createdCount} caption clip${createdCount === 1 ? "" : "s"} on ${captionLaneKey}`,
      "success",
    );
  }, [addToast, createElement, elements, lanes, reorderLanes, projectId]);

  // ── Render ───────────────────────────────────────────────────────────────

  const musicalBeats = useBeatAnnotations(projectId, compareShowingLive ? elements : proposalPreviewTimelineElements ?? elements, playheadSec, seekToTimelineTime, frameTags);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          color: "var(--color-text-muted)",
          padding: "3rem",
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: "3px solid var(--color-border)",
              borderTopColor: "var(--color-accent)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span>Loading timeline…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Populated state ──────────────────────────────────────────────────────

  const marksNode = capabilities.reviewMarks ? <section aria-label="Marks" className={dock ? "chat-marks-strip" : "timeline-transport-review"}>              <FrameTagControls
                tags={frameTags}
                busy={frameTagsBusy}
                onAdd={() => { void addFrameTagAtPlayhead(); }}
                onStartPointMark={startPointMark}
                pointMarkActive={pointMarkActive}
                onSeek={seekToTimelineTime}
                onRemove={(tagId) => { void removeFrameTagById(tagId); }}
                onClear={() => { void clearAllFrameTags(); }}
                onUpdate={(id, patch) => {
                  void fetch(`/api/projects/${projectId}/review/frame-tags`, { method: "PATCH", headers: { "content-type": "application/json", "x-dreamcut-client": "editor" }, body: JSON.stringify({ id, ...patch }) })
                    .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setFrameTags(result.tags); if (result.history) recordServerMutationHistory(result.history); })
                    .catch(error => toast.error(String(error)));
                }}
                outlineButtonClassName={timelineOutlineButtonClassName}
                ghostButtonClassName={timelineGhostButtonClassName}
              />
</section> : null;

  const historyControls = (
            <div className="timeline-history-controls" role="group" aria-label="Undo, history and redo">
              <Button variant="ghost" size="icon-sm" onClick={activeUndo} disabled={!activeCanUndo || activeHistoryBusy} title={layoutHistoryController ? "Undo layout change" : undoEntries.length ? `Undo: ${historyEntryLabel(undoEntries.at(-1), id => elements.find(element => element.id === id))}` : "Nothing to undo in this session"} aria-label="Undo" className={timelineGhostButtonClassName}>
                <Undo2Icon />
              </Button>
              <TimelineHistoryButton projectId={projectId} undoEntries={undoEntries} redoEntries={redoEntries} busy={historyBusy} onUndo={() => { void undo(); }} onRedo={() => { void redo(); }} className={timelineGhostButtonClassName} />
              <Button variant="ghost" size="icon-sm" onClick={activeRedo} disabled={!activeCanRedo || activeHistoryBusy} title={layoutHistoryController ? "Redo layout change" : `Redo: ${historyEntryLabel(redoEntries.at(-1))}`} aria-label="Redo" className={timelineGhostButtonClassName}>
                <Redo2Icon />
              </Button>
            </div>

  );

  const toolbarNode = (
    <TimelineToolbar
      historyControls={historyControls}
      reviewControls={dock ? undefined : <>{marksNode}{agentSelection && <SelectionTray selections={agentSelection.selections}
        onRemove={agentSelection.removeSelection} onClear={agentSelection.clearSelections} ghostButtonClassName={timelineGhostButtonClassName} />}</>}

      onOpenMedia={toggleLibraryDrawer}
      libraryShortcut={panelShortcuts.library}
      proposalsShortcut={panelShortcuts.proposals}
      selectedElement={selectedElement}
      selectedBeatLabel={selectedBeatLabel}
      onSplitSelected={() => {
        if (selectedElement) void splitElement(selectedElement.id, playheadSec);
      }}
      onDuplicateSelected={() => {
        if (selectedElement) void duplicateElement(selectedElement.id);
      }}
      onDeleteSelected={() => {
        for (const elementId of selectedIds) void deleteElement(elementId);
      }}
      snapEnabled={snapEnabled}
      onToggleSnap={() => setSnapEnabled((current) => !current)}
      backwardSelectionCount={proposalPreviewSelection ? 0 : backwardSelectionIds.length}
      onSelectBackward={selectBackward}
      forwardSelectionCount={proposalPreviewSelection ? 0 : forwardSelectionIds.length}
      onSelectForward={selectForward}
      previewAspectRatio={previewAspectRatio}
      onPreviewAspectRatioChange={ratio => { if (halfScreen) setHalfScreenPick(ratio); setPreviewAspectRatio(ratio); }}
      pendingProposalCount={reviewAttentionCount}
      proposalsOpen={reviewDrawerOpen}
      mediaOpen={libraryDrawerOpen}
      proposalPreviewActive={proposalPreviewSelection != null}
      onReviewProposals={() => setReviewDrawerOpen(open => !open)}
      showProposals={!dock && (capabilities.proposals || takeAuditionCount > 0)}
      showEditorLayoutSwitcher={capabilities.editorLayoutSwitcher}
      visibleSeconds={visibleDuration}
      minVisibleSeconds={Math.max(MIN_VISIBLE_DURATION, totalDuration / timelineMaxZoom(totalDuration))}
      maxVisibleSeconds={Math.max(MIN_VISIBLE_DURATION, totalDuration * 4)}
      onVisibleSecondsChange={(value) => {
        const nextVisibleDuration = value;
        const nextZoomLevel = totalDuration / nextVisibleDuration;
        setScrollSec(resolveAnchoredZoomScroll({
          anchorSec: playheadSec,
          currentScrollSec: scrollSec,
          currentVisibleDuration: visibleDuration,
          nextVisibleDuration,
          totalDuration,
        }));
        zoomTo(nextZoomLevel);
      }}
      laneHeightPercent={Math.round(laneScale * 100)}
      minLaneHeightPercent={Math.round(MIN_LANE_SCALE * 100)}
      maxLaneHeightPercent={Math.round(MAX_LANE_SCALE * 100)}
      onLaneHeightPercentChange={(value) => setLaneScale(value / 100)}
      outlineButtonClassName={timelineOutlineButtonClassName}
      ghostButtonClassName={timelineGhostButtonClassName}
      headerAccessory={timelineHeaderAccessory}
    />
  );

  const timelineNode = (
    <CanvasTimeline
          musicalBeats={musicalBeats}
        rhythmView={musicalBeats.rhythmView}
          readOnly={proposalPreviewTimelineElements != null}
          lanes={compareShowingLive ? lanes : proposalPreviewLanes ?? lanes}
          elements={compareShowingLive ? elements : proposalPreviewTimelineElements ?? elements}
          transitionChips={transitionChips}
          beatMarkers={beatMarkers}
          mutedLanes={compareShowingLive ? mutedLanes : proposalPreviewMutedLanes ?? mutedLanes}
          hiddenLanes={compareShowingLive ? hiddenLanes : proposalPreviewHiddenLanes ?? hiddenLanes}
          onToggleLaneHidden={toggleLaneHidden}
          playheadSec={playheadSec}
          isPlaying={isPlaying}
          reviewMarkers={capabilities.reviewMarks ? frameTags : []}
          totalDuration={totalDuration}
          playbackDuration={displayedDurationInFrames / currentFrameRate()}
          visibleDuration={visibleDuration}
          scrollSec={scrollSec}
          selectedIds={selectedIds}
          selectedBeatId={selectedBeatId}
          selectedTransitionId={selectedTransitionId}
          onSeek={seekToTimelineTime}
          onScrollSec={setScrollSec}
          onZoomAt={(nextZoomLevel, anchorSec, viewportScrollSec) => {
            const nextVisibleDuration = Math.max(MIN_VISIBLE_DURATION, totalDuration / nextZoomLevel);
            const anchor = anchorSec ?? playheadSec;
            const currentScrollSec = viewportScrollSec ?? scrollSec;
            setScrollSec(resolveAnchoredZoomScroll({
              anchorSec: anchor,
              currentScrollSec,
              currentVisibleDuration: visibleDuration,
              nextVisibleDuration,
              totalDuration,
            }));
            zoomTo(nextZoomLevel);
          }}
          onLaneZoom={(steps) => setLaneScale(laneScale + steps * 0.05)}
          onSelect={(elementId, options) => {
            selectTransition(null);
            // Selecting a picture, video or audio clip shows its Properties. Text and caption clips keep the open
            // panel, because the Text and Captions panels restyle the selection.
            if (!options?.toggle && !options?.additive && elements.find(element => element.id === elementId)?.type !== "caption_text") setShelfOpen(false);
            if (options?.toggle) {
              setSelectedIds((prev) => prev.filter((id) => id !== elementId));
              return;
            }
            if (options?.additive) {
              setSelectedIds((prev) => (prev.includes(elementId) ? prev : [...prev, elementId]));
              return;
            }
            if (options?.replace) {
              const compoundIds = compoundSelectionIds(elements, elementId);
              if (compoundIds.length > 1) {
                setSelectedIds(compoundIds);
                return;
              }
              selectElement(elementId);
              return;
            }
            if (selectedIds.includes(elementId)) {
              return;
            }
            const compoundIds = compoundSelectionIds(elements, elementId);
            if (compoundIds.length > 1) {
              setSelectedIds(compoundIds);
              return;
            }
            selectElement(elementId);
          }}
          onClearSelection={() => {
            setPendingTransitionPair(null);
            setSelectedIds([]);
            selectTransition(null);
          }}
          onSetSelection={(elementIds) => {
            selectTransition(null);
            setSelectedIds(elementIds);
          }}
          onSelectTransition={(transitionId) => {
            selectTransition(transitionId);
          }}
          onCreateTransition={(fromElementId, toElementId) => {
            openTransitionJoin(fromElementId, toElementId);
          }}
          onSelectBeat={(beatId) => {
            setSelectedBeatId(beatId);
            setSelectedIds([]);
            selectTransition(null);
          }}
          onToggleMute={(laneKey) => {
            updateMutedLanes((prev) => {
              const next = new Set(prev);
              if (next.has(laneKey)) next.delete(laneKey);
              else next.add(laneKey);
              return next;
            });
          }}
          onMoveElement={moveElement}
          onMoveElements={moveElements}
          onResizeElement={resizeElement}
          externalResizeState={inspectorResizePreviewState}
          externalSnapGuide={inspectorSnapGuide}
          onPxPerSecChange={setTimelinePxPerSec}
          onViewportHeightChange={setTimelineViewportHeight}
          previewHighlightIds={proposalPreviewTouchedIds}
          onResizeBeatBoundary={(beatId, edge, boundarySec) => {
            void resizeBeatBoundary(beatId, edge, boundarySec);
          }}
          onFitBeatToVisualContent={(beatId) => {
            void fitBeatToVisualContent(beatId);
          }}
          onMoveBeatVisualsToBeatStart={(beatId) => {
            void moveBeatVisualsToBeatStart(beatId);
          }}
          snapEnabled={snapEnabled}
          onResizeLane={resizeLane}
          onDeleteElement={deleteElement}
          onToggleLock={(elementId, locked) => patchElement(elementId, { position_locked: locked })}
          onSplitElement={(elementId, splitAtSec) => void splitElement(elementId, splitAtSec)}
          onDuplicateElement={(elementId) => void duplicateElement(elementId)}
          onCopyElement={copyElement}
          onCutElement={(elementId) => void cutElement(elementId)}
          onPasteElement={(atSec) => void pasteElement(atSec)}
          hasClipboard={hasClipboard}
          onToggleDisable={toggleDisableElement}
          onOpenClipProperties={(elementId, domain) => { selectElement(elementId); setInspectorDomain(domain); openToolPane("properties"); }}
          onCombineElements={(elementIds) => void combineIntoCompoundClip(elementIds)}
          onPreparePresenterCompound={(elementId) => void preparePresenterCompound(elementId)}
          onBreakApartCompoundClip={(elementId) => void breakApartCompoundClip(elementId)}
          onPatchElement={(elementId, patch) => patchElement(elementId, patch)}
          onAddLane={(sourceLaneKey) => {
            void addLane(sourceLaneKey ? { sourceLaneKey } : undefined);
          }}
          onCreateCaptionsLaneAbove={createCaptionsLaneAbove}
          onDropElement={(payload, atSec) => void addShelfElement(payload, atSec)}
          onAddCaptionElement={(laneKey, atSec) => {
            void createElement({
              type: "caption_text",
              source_url: null,
              beat_id: null,
              voice_clip_id: null,
              character_id: null,
              timeline_start: atSec,
              duration: 2,
              lane_key: laneKey,
              lane_index: lanes.findIndex((l) => l.key === laneKey),
              props: composeCaptionProps(""),
            }, { toastLabel: "Added caption" });
          }}
          onDeleteLane={(laneKey) => {
            const lane = lanes.find((entry) => entry.key === laneKey) ?? null;
            const laneElementCount = elements.filter((element) => element.lane_key === laneKey).length;
            if (laneElementCount > 0) {
              setDeleteLaneConfirm({
                laneKey,
                laneLabel: lane?.label ?? laneKey,
                elementCount: laneElementCount,
              });
              return;
            }
            updateMutedLanes((prev) => {
              if (!prev.has(laneKey)) return prev;
              const next = new Set(prev);
              next.delete(laneKey);
              return next;
            });
            if (hiddenLanes.has(laneKey)) toggleLaneHidden(laneKey);
            void deleteLane(laneKey);
          }}
          onReorderLanes={reorderLanes}
          onSoloLane={(laneKey) => {
            updateMutedLanes((prev) => {
              const next = new Set(lanes.map((l) => l.key));
              next.delete(laneKey);
              const allOthersMuted = lanes.every((l) => l.key === laneKey || prev.has(l.key));
              if (allOthersMuted && !prev.has(laneKey)) return new Set();
              return next;
            });
          }}
          onToggleLaneLock={(laneKey, locked) => {
            const patches = elements
              .filter((element) => element.lane_key === laneKey && element.removed_at == null)
              .map((element) => ({ elementId: element.id, patch: { position_locked: locked } }));
            void patchElements(patches);
          }}
          bottomInset={0}
        />
  );

  const selectAllCaptionsInSelectedLane = () => {
    if (selectedElement?.type !== "caption_text") return;
    const captionIds = elements
      .filter((element) => (
        element.type === "caption_text"
        && element.lane_key === selectedElement.lane_key
        && element.removed_at == null
      ))
      .map((element) => element.id);
    setSelectedIds(captionIds);
    selectTransition(null);
  };


  // A layout writes each clip's ordinary crop, size and position (one Undo); placement keyframes on those
  // fields are dropped so the layout holds, and every value stays tunable in Properties.
  const applyLayout = (preset: LayoutPreset) => {
    const canvasAspect = displayedCompositionDimensions.width / displayedCompositionDimensions.height;
    const placementTracks = new Set(["media_scale", "media_offset_x", "media_offset_y", "mask_inset"]);
    const patches = layoutClips.slice(0, preset.slots.length).map((element, index) => {
      const keyframes = element.props?.transition_keyframes as Record<string, unknown> | undefined;
      const kept = keyframes ? Object.fromEntries(Object.entries(keyframes).filter(([track]) => !placementTracks.has(track))) : undefined;
      return { elementId: element.id, patch: { props: {
        ...layoutSlotProps(preset.slots[index]!, clipAspect(element.props) ?? canvasAspect, canvasAspect),
        ...(kept && Object.keys(kept).length !== Object.keys(keyframes!).length ? { transition_keyframes: kept } : {}),
      } } };
    });
    if (patches.length) void patchElements(patches);
  };

  const assetShelfNode = (
    <AssetShelf
      generationShortcutNonce={generationReviewNonce}
      captionGeneration={<GenerateCaptionsControl projectId={projectId} elements={elements} selectedElement={selectedElement} onGenerated={(history) => { recordServerMutationHistory(history); requestRefresh(); }} />}
      projectId={projectId}
      open={shelfOpen}
      width={shelfWidth}
      onClose={() => setShelfOpen(false)}
      onWidthChange={setShelfWidth}
      onAddElement={addShelfElement}
      onReplaceMusic={replaceSelectedMusic}
      hasSelectedMusic={selectedElement?.type === "music"}
      textTarget={panelTextTarget}
      onApplyCaptionLaneStyle={applyCaptionLaneStyleToLane}
      onPatchElementProps={patchShelfTextProps}
      beats={beats}
      alwaysOpen={shelfAlwaysOpen}
      drawerMode={true}
      hideClose
      inlineGenerate
      workflowPanes={TOOL_PANEL_PANES}
      headerTarget={toolHeaderTarget}
      propertiesTab={{
        active: !shelfOpen && !layoutsOpen, onSelect: () => openToolPane("properties"), controls: "editor-tool-panel-Properties",
        collapsed: toolsCollapsed, onReselect: () => setToolsCollapsed(true),
        layouts: { active: layoutsOpen && !shelfOpen, onSelect: () => openToolPane("layouts"), controls: "editor-tool-panel-Layouts" },
      }}
      onReveal={() => openToolPane("shelf")}
      showAdvancedTools={capabilities.advancedAssetTools}
      layoutProposalId={selectedLayoutProposalId}
      layoutNode={selectedLayoutProposalId ? (
        <CoverLayoutEditor
          projectId={projectId}
          layoutId={selectedLayoutProposalId}
          onHistoryControllerChange={setLayoutHistoryController}
          onMutationHistory={recordServerMutationHistory}
        />
      ) : null}
      renderLayoutProposal={(layoutId) => (
        <CoverLayoutEditor
          projectId={projectId}
          layoutId={layoutId}
          onHistoryControllerChange={setLayoutHistoryController}
          onMutationHistory={recordServerMutationHistory}
        />
      )}
    />
  );


  const reviewDrawerNode = (
    <div className="project-review-panel">
      {!dock && <DrawerHeader closeLabel="Close proposals" onClose={closeReviewDrawer}><h2 className="text-sm font-semibold">Proposals</h2></DrawerHeader>}
      <div style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div>
        <ProposalsPanel
          embedded
          onRespond={dock?.replyToProposal}
          onAskAgent={dock?.askAgent}
          reviewActive={reviewDrawerOpen}
          refreshToken={proposalRefreshToken}
          client={proposalsClient}
          onCountsChange={updateProposalCounts}
          activePreview={proposalPreviewSelection}
          previewLoading={proposalPreviewLoading || Boolean(proposalPreviewSelection && (
            (previewReadiness.state.phase === "warming" && previewReadiness.state.queuedPlay)
            || isPlayerBuffering
          ))}
          onPlayOptions={playProposalOptions}
          onTuneOption={tuneProposalOption}
          onInstantPreview={showInstantProposalPreview}
          onPlayBatch={playProposalBatch}
          onExitPreview={exitProposalPreview}
          compareShowingLive={compareShowingLive}
          onToggleComparison={toggleProposalComparison}
          onApplied={(history, count = 1, label) => {
            setPendingProposalCount((current) => Math.max(0, current - count));
            // The whole approval (timeline + metadata writes) undoes as ONE
            // visible entry; the history stack lives in sessionStorage, so it
            // survives the reload remount below.
            if (history) {
              const entry = buildExternalSnapshotHistoryEntry(history.before, history.after);
              if (entry) recordHistoryEntry({ ...entry, label: label ? `Apply: ${label}` : entry.label });
            }
            // EditorClient listens and remounts the editor so the applied
            // timeline loads; an API write never trips the external-rev poll.
            window.dispatchEvent(new CustomEvent("timeline-editor:reload"));
          }}
        />
        <TakeAuditionReview
          projectId={projectId}
          refreshToken={proposalRefreshToken}
          onPlayCandidates={playAuditionCandidates}
          onCountChange={setTakeAuditionCount}
          onMutationHistory={(history) => {
            recordServerMutationHistory(history);
            window.dispatchEvent(new CustomEvent("timeline-editor:reload"));
          }}
        />
        </div>
      </div>
    </div>
  );

  const landscapeRightPanelNode = (mode: "tabs" | "inspector") => (
    <LandscapeRightPanel
      beatControls={musicalBeats.controls}
      panelMode={mode}
      assetShelfNode={assetShelfNode}
      showProposals={capabilities.proposals || takeAuditionCount > 0}
      showAdvancedInspector={capabilities.advancedInspector}
      showKeyframes={capabilities.keyframes}
      pendingProposalCount={reviewAttentionCount}
      onReviewProposals={() => setReviewDrawerOpen(true)}
      onSplitSelected={() => {
        if (selectedElement) void splitElement(selectedElement.id, playheadSec);
      }}
      onDuplicateSelected={() => {
        if (selectedElement) void duplicateElement(selectedElement.id);
      }}
      onDeleteSelected={() => {
        for (const elementId of selectedIds) void deleteElement(elementId);
      }}
      onSelectCaptionLane={selectAllCaptionsInSelectedLane}
      onCloseProperties={() => setShelfOpen(true)}
      selectedElement={inspectorElement}
      inspectorDomain={inspectorDomain}
      onInspectorDomainChange={setInspectorDomain}
      timelineElements={elements}
      selectedElementCount={selectedTimelineItemCount}
      selectedCaptionCount={selectedCaptionCount}
      selectedTransition={inspectorTransition}
      outlineButtonClassName={timelineOutlineButtonClassName}
      editVolume={editVolume}
      setEditVolume={setEditVolume}
      editTrimStart={editTrimStart}
      setEditTrimStart={setEditTrimStart}
      editTrimEnd={editTrimEnd}
      setEditTrimEnd={setEditTrimEnd}
      editFadeIn={editFadeIn}
      setEditFadeIn={setEditFadeIn}
      editFadeOut={editFadeOut}
      setEditFadeOut={setEditFadeOut}
      editCaptionText={editCaptionText}
      setEditCaptionText={setEditCaptionText}
      editAnimationIn={editAnimationIn}
      setEditAnimationIn={setEditAnimationIn}
      editAnimationOut={editAnimationOut}
      setEditAnimationOut={setEditAnimationOut}
      editAnimInDuration={editAnimInDuration}
      setEditAnimInDuration={setEditAnimInDuration}
      editAnimOutDuration={editAnimOutDuration}
      setEditAnimOutDuration={setEditAnimOutDuration}
      commitAnimInDuration={commitAnimInDuration}
      commitAnimOutDuration={commitAnimOutDuration}
      previewSelectedEffectProps={previewSelectedEffectProps}
            patchSelectedElementProps={patchSelectedElementProps}
      editMediaScale={editMediaScale}
      setEditMediaScale={setEditMediaScale}
      editMediaOffsetX={editMediaOffsetX}
      setEditMediaOffsetX={setEditMediaOffsetX}
      editMediaOffsetY={editMediaOffsetY}
      setEditMediaOffsetY={setEditMediaOffsetY}
      previewVisualTransform={previewVisualTransform}
      clearVisualTransformPreview={clearVisualTransformPreview}
      showPositionGrid={showPositionGrid}
      onTogglePositionGrid={() => setShowPositionGrid((visible) => !visible)}
      commitVisualTransform={commitVisualTransform}
      commitVisualTransformValues={commitVisualTransformValues}
      resetVisualTransform={resetVisualTransform}
      motionPreset={motionPreset}
      applyMotionPreset={applyMotionPreset}
      compositionDimensions={compositionDimensions}
      editMaskTop={editMaskTop}
      setEditMaskTop={setEditMaskTop}
      editMaskRight={editMaskRight}
      setEditMaskRight={setEditMaskRight}
      editMaskBottom={editMaskBottom}
      setEditMaskBottom={setEditMaskBottom}
      editMaskLeft={editMaskLeft}
      setEditMaskLeft={setEditMaskLeft}
      previewMaskInset={previewMaskInset}
      commitMaskInset={commitMaskInset}
      editMediaOpacity={editMediaOpacity}
      setEditMediaOpacity={setEditMediaOpacity}
      editMaskFeather={editMaskFeather}
      setEditMaskFeather={setEditMaskFeather}
      editMirrorCenter={editMirrorCenter}
      setEditMirrorCenter={setEditMirrorCenter}
      editMirrorHeight={editMirrorHeight}
      setEditMirrorHeight={setEditMirrorHeight}
      previewMediaEffect={previewMediaEffect}
      commitMediaEffect={commitMediaEffect}
      editColorGrade={editColorGrade}
      setEditColorGrade={setEditColorGrade}
      previewColorGrade={previewColorGrade}
      commitColorGrade={commitColorGrade}
      resetColorGradeControls={resetColorGradeControls}
      toggleColorGradeKeyframeAtPlayhead={toggleColorGradeKeyframeAtPlayhead}
      colorGradeKeyedAtPlayhead={colorGradeKeyedAtPlayhead}
      clearColorGradeKeyframes={clearColorGradeKeyframes}
      editChromaKeyColor={editChromaKeyColor}
      editChromaKeyTolerance={editChromaKeyTolerance}
      editChromaKeySoftness={editChromaKeySoftness}
      editChromaKeySpill={editChromaKeySpill}
      setEditChromaKey={setEditChromaKey}
      previewChromaKey={previewChromaKey}
      commitChromaKey={commitChromaKey}
      resetChromaKeyControls={resetChromaKeyControls}
      toggleChromaKeyKeyframeAtPlayhead={toggleChromaKeyKeyframeAtPlayhead}
      chromaKeyKeyedAtPlayhead={chromaKeyKeyedAtPlayhead}
      advancedColorGrade={advancedColorGrade}
      previewAdvancedColorGrade={previewAdvancedColorGrade}
      commitAdvancedColorGrade={commitAdvancedColorGrade}
      toggleAdvancedColorGradeKeyframeAtPlayhead={toggleAdvancedColorGradeKeyframeAtPlayhead}
      advancedColorGradeKeyedAtPlayhead={advancedColorGradeKeyedAtPlayhead}
      colorGradeLut={colorGradeLut}
      applyColorGradeLut={applyColorGradeLut}
      previewColorGradeLutIntensity={previewColorGradeLutIntensity}
      commitColorGradeLutIntensity={commitColorGradeLutIntensity}
      toggleColorGradeLutKeyframeAtPlayhead={toggleColorGradeLutKeyframeAtPlayhead}
      lutIntensityKeyedAtPlayhead={lutIntensityKeyedAtPlayhead}
      cutoutReviewMode={cutoutReviewMode}
      chromaKeyReviewMode={chromaKeyReviewMode}
      setChromaKeyReviewMode={setChromaKeyReviewMode}
      setCutoutReviewMode={setCutoutReviewMode}
      previewMirrorBand={previewMirrorBand}
      commitMirrorBand={commitMirrorBand}
      resetMediaEffects={resetMediaEffects}
      resetMaskInset={resetMaskInset}
      addTransformKeyframeAtPlayhead={addTransformKeyframeAtPlayhead}
      toggleTransformKeyframeAtPlayhead={toggleTransformKeyframeAtPlayhead}
      addMaskKeyframeAtPlayhead={addMaskKeyframeAtPlayhead}
      addOpacityKeyframeAtPlayhead={addOpacityKeyframeAtPlayhead}
      transformKeyedAtPlayhead={transformKeyedAtPlayhead}
      transformFieldKeyedAtPlayhead={transformFieldKeyedAtPlayhead}
      maskKeyedAtPlayhead={maskKeyedAtPlayhead}
      opacityKeyedAtPlayhead={opacityKeyedAtPlayhead}
      clearVisualKeyframes={clearVisualKeyframes}
      selectedLocalPlayheadSec={selectedLocalPlayheadSec}
      timelinePlayheadSec={playheadSec}
      onSeekTimelineSeconds={seekToTimelineTime}
      editCaptionFontPreset={editCaptionFontPreset}
      setEditCaptionFontPreset={setEditCaptionFontPreset}
      editCaptionStyleVariant={editCaptionStyleVariant}
      setEditCaptionStyleVariant={setEditCaptionStyleVariant}
      editCaptionFontSize={editCaptionFontSize}
      setEditCaptionFontSize={setEditCaptionFontSize}
      editCaptionAbsX={editCaptionAbsX}
      setEditCaptionAbsX={setEditCaptionAbsX}
      editCaptionAbsY={editCaptionAbsY}
      setEditCaptionAbsY={setEditCaptionAbsY}
      setEditCaptionPosition={setEditCaptionPosition}
      editStart={editStart}
      setEditStart={setEditStart}
      commitStart={commitStart}
      editDuration={editDuration}
      setEditDuration={setEditDuration}
      previewDuration={(nextValue) => {
        if (!selectedElement) return;
        const raw = Number.parseFloat(nextValue);
        if (!Number.isFinite(raw)) {
          clearInspectorResizePreview();
          return;
        }
        previewInspectorDuration(selectedElement.id, raw);
      }}
      commitDuration={commitDuration}
      commitVolume={commitVolume}
      toggleVolumeKeyframeAtPlayhead={toggleVolumeKeyframeAtPlayhead}
      volumeKeyedAtPlayhead={volumeKeyedAtPlayhead}
      commitTrimStart={commitTrimStart}
      commitTrimEnd={commitTrimEnd}
      commitFadeIn={commitFadeIn}
      commitFadeOut={commitFadeOut}
      previewPlaybackRate={previewInspectorPlaybackRate}
      clearPlaybackRatePreview={clearInspectorResizePreview}
      patchSelectedCaptionProps={patchSelectedCaptionProps}
      commitCaptionText={commitCaptionText}
      commitCaptionFontSize={commitCaptionFontSize}
      applyCaptionAbsPosition={applyCaptionAbsPosition}
      commitCaptionAbsPos={commitCaptionAbsPos}
      commitCaptionPositionPreset={commitCaptionPositionPreset}
      updatePlaybackRate={commitPlaybackRateFromInspector}
      patchElement={patchElement}
      resetElement={resetElement}
      normalizeElementLoudness={normalizeCompoundLoudness}
      applyAudioEffect={applyAudioEffectToCompound}
      applyVideoStabilization={applyVideoStabilization}
      deleteElement={deleteElement}
      patchTransition={patchTransition}
            previewTransition={previewTransition}
      deleteTransition={deleteTransition}
      transitionFromLabel={transitionFromLabel}
      transitionToLabel={transitionToLabel}
      transitionCreateCandidate={inspectorTransitionCandidate}
            onOpenTransitionJoin={openTransitionJoin}
            outgoingTransitionId={selectedElementOutgoingTransition?.id}
            onSelectTransition={selectTransition}
      createTransitionForPair={(fromElementId, toElementId, type) => createTransition(fromElementId, toElementId, type)}
      hasTransitionIn={!!selectedElementIncomingTransition}
      hasTransitionOut={!!selectedElementOutgoingTransition}
      applySelectedCaptionStyleToLane={applySelectedCaptionStyleToLane}
    />
  );

  const confirmLane = deleteLaneConfirm
    ? lanes.find((lane) => lane.key === deleteLaneConfirm.laneKey) ?? null
    : null;

  // Tall layout splits the shelf: Library · Music · Sounds · Recipes in a right-hand drawer,
  // Text · Captions beside Properties over the timeline. Same shelf, scoped panes.
  const tallLibraryShelfNode = cloneElement(assetShelfNode, {
    workflowPanes: LIBRARY_DRAWER_PANES, propertiesTab: undefined, headerTarget: undefined, hideClose: false,
  });
  // Wide's header Library slides out the drawer; the tool panel's selection stays where it was.
  const wideLibraryShelfNode = cloneElement(assetShelfNode, {
    workflowPanes: LIBRARY_DRAWER_PANES, propertiesTab: undefined, headerTarget: undefined, hideClose: false,
    open: wideLibraryOpen, onClose: () => setWideLibraryOpen(false), onReveal: undefined,
  });
  const tallTextShelfNode = cloneElement(assetShelfNode, {
    workflowPanes: ["text", "captions"], pane: inspectorTab === "captions" ? "captions" : "text",
    propertiesTab: undefined, headerTarget: null, hideClose: true, open: inspectorTab === "text" || inspectorTab === "captions", onReveal: undefined,
  });
  const inspectorTabs = [["properties", "Properties"], ["text", "Text"], ["captions", "Captions"], ["recipes", "Templates"]] as const;
  const tallInspectorNode = (
    <div className="editor-tool-content">
      <div className="editor-inspector-tabs">
        <SegmentedControl size="sm" fill role="tablist" aria-label="Properties, Text, Captions and Templates">
          {inspectorTabs.map(([tab, label], index) => <button key={tab} type="button" role="tab" id={`editor-inspector-tab-${tab}`}
            aria-controls={`editor-inspector-panel-${tab === "captions" ? "text" : tab}`} aria-selected={inspectorTab === tab} tabIndex={inspectorTab === tab ? 0 : -1}
            onClick={() => setInspectorTab(tab)}
            onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? inspectorTabs[0][0] : event.key === "End" ? inspectorTabs[inspectorTabs.length - 1][0]
                : inspectorTabs[(index + (event.key === "ArrowRight" ? 1 : inspectorTabs.length - 1)) % inspectorTabs.length][0];
              setInspectorTab(next); document.getElementById(`editor-inspector-tab-${next}`)?.focus();
            }}>{label}</button>)}
        </SegmentedControl>
      </div>
      <div className="editor-tool-content" role="tabpanel" id="editor-inspector-panel-properties" aria-labelledby="editor-inspector-tab-properties" hidden={inspectorTab !== "properties"}>{landscapeRightPanelNode("inspector")}</div>
      <div className="editor-tool-content" role="tabpanel" id="editor-inspector-panel-text" aria-labelledby={`editor-inspector-tab-${inspectorTab === "captions" ? "captions" : "text"}`} hidden={inspectorTab !== "text" && inspectorTab !== "captions"}>{tallTextShelfNode}</div>
      <div className="editor-tool-content" role="tabpanel" id="editor-inspector-panel-recipes" aria-labelledby="editor-inspector-tab-recipes" hidden={inspectorTab !== "recipes"}><LibraryEffectCatalog projectId={projectId} active={tallWorkspace && inspectorTab === "recipes"} onWatchExample={example => { playerRef.current?.pause(); setTemplateExample(example); }} /></div>
    </div>
  );
  return (
    <>
      {musicalBeats.viewer}
      <style>{`@keyframes export-spin { to { transform: rotate(360deg); } }`}</style>
      {headerActionsTarget ? createPortal(
        <div className="flex shrink-0 items-center gap-2">
          {visibleRenderStatus === "rendering" ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowExportModal(true)} className="border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] text-[var(--ink)]">
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              {activeRenderJob?.progress !== undefined ? `Exporting ${Math.round(activeRenderJob.progress * 100)}%` : `Exporting ${renderElapsed}s`}
            </Button>
          ) : visibleRenderStatus === "error" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setExportStartedHere(true); setShowExportModal(true); }}
              title={renderError ?? "Retry export"}
              className="border-destructive/45 bg-destructive/10 text-destructive-foreground"
            >
              <RotateCcwIcon data-icon="inline-start" />
              Retry export
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowExportModal(true)}
              disabled={elements.length === 0}
              title={elements.length === 0 ? "Add elements to timeline before exporting" : "Export video"}
              className="h-9 shrink-0 border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] text-[var(--ink)] hover:bg-[var(--chrome-raised)]"
            >
              {exportReady ? <CheckCircle2Icon data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
              <span className="workspace-action-label">{exportReady ? "Export ready" : "Export"}</span>
            </Button>
          )}
        </div>,
        headerActionsTarget,
      ) : null}
      {dock?.marksTarget ? createPortal(marksNode, dock.marksTarget) : null}
      <TimelinePlaybackShell
        viewerAccessory={<PlatformPreviewControl value={platformPreviewMode} onChange={changePlatformPreviewMode} />}
        shapeControl={<VideoShapeControl value={aspectRatio} disabled={outputFormatSaving} onChange={(value) => void persistOutputAspectRatio(value)} />}
        toolsCollapsed={!tallWorkspace && toolsCollapsed}
        toolNode={tallWorkspace ? undefined : <div className="editor-tool-area">
          <div className="editor-tool-rail-shell" data-expanded={toolRail.value >= 64} style={{width: toolRail.value >= 64 ? `calc(${toolRail.value}px + var(--ui-text-step, 0px) * 4)` : toolRail.value}}>
            <div ref={setToolHeaderTarget} className="editor-tool-header" />
            <WorkspaceResizeHandle label="Resize tool rail" axis="x" value={toolRail.value} min={52} max={108} onChange={toolRail.change} onReset={toolRail.reset} style={{right:-4,top:0,bottom:0}} />
          </div>
          <div className="editor-tool-content" hidden={toolsCollapsed || !shelfOpen}>{assetShelfNode}</div>
          <div className="editor-tool-content" role="tabpanel" id="editor-tool-panel-Properties" aria-labelledby="media-visual-properties" hidden={toolsCollapsed || shelfOpen || layoutsOpen}>{landscapeRightPanelNode("inspector")}</div>
          <div className="editor-tool-content" role="tabpanel" id="editor-tool-panel-Layouts" aria-labelledby="media-visual-layouts" hidden={toolsCollapsed || shelfOpen || !layoutsOpen}>
            {layoutsOpen && <LayoutsPanel aspect={displayedCompositionDimensions.width / displayedCompositionDimensions.height}
              selectedClipCount={layoutClips.length} onApply={applyLayout} />}
          </div>
        </div>}
        inspectorNode={tallWorkspace ? tallInspectorNode : undefined}
        projectId={projectId}
        renderBackend={renderBackend}
        rendererNeedsConfirmation={rendererNeedsConfirmation}
        onRendererFailure={setRendererFailure}
        onRenderBackendChange={setRenderBackend}
        showPositionGrid={showPositionGrid}
        playerRef={playerRef}
        setPlayerInstance={setPlayerInstance}
        playerInputProps={previewPlayerInputProps}
        durationInFrames={displayedDurationInFrames}
        playheadSec={playheadSec}
        compositionDimensions={displayedCompositionDimensions}
        previewAspectRatio={previewAspectRatio}
        toolbarNode={toolbarNode}
        timelineNode={timelineNode}
        onPreviousEditPoint={() => seekToFrame(previousTimelineEditPointFrame(timelineEditPointFrames, Math.round(playheadSec * currentFrameRate())))}
        onNextEditPoint={() => seekToFrame(nextTimelineEditPointFrame(timelineEditPointFrames, Math.round(playheadSec * currentFrameRate()), displayedDurationInFrames))}
        landscapeRightPanelNode={landscapeRightPanelNode}
        interactionOverlayNode={playerInteractionOverlayNode}
        viewerTakeoverNode={templateExample ? <div className="editor-viewer-takeover" role="region" aria-label={`${templateExample.title} example`}
          onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setTemplateExample(null); } }}>
          <video key={templateExample.video} src={templateExample.video} poster={templateExample.poster} controls autoPlay loop muted playsInline />
          <div className="editor-viewer-takeover-bar">
            <Button type="button" size="sm" variant="secondary" autoFocus onClick={() => setTemplateExample(null)}>Back to edit</Button>
            <span>{templateExample.title}</span>
          </div>
        </div> : undefined}
        analysisOverlayNode={platformPreviewMode === "off" ? null : (
          <PlatformPreviewOverlay
            mode={platformPreviewMode}
            compositionWidth={displayedCompositionDimensions.width}
            compositionHeight={displayedCompositionDimensions.height}
          />
        )}
        readiness={previewReadiness}
        inlineStartupLoading={reviewDrawerOpen && Boolean(proposalPreviewSelection)}
        isPlayerBuffering={isPlayerBuffering}
      />

      {tallWorkspace && <MediaDrawer open={shelfOpen} onClose={closeShelf}>{tallLibraryShelfNode}</MediaDrawer>}
      {!tallWorkspace && wideLibraryMounted && <MediaDrawer open={wideLibraryOpen} onClose={() => setWideLibraryOpen(false)}>{wideLibraryShelfNode}</MediaDrawer>}
      {dock?.reviewTarget ? createPortal(reviewDrawerNode, dock.reviewTarget) : !dock && <SlideOutDrawer open={reviewDrawerOpen} label="Proposals" testId="review-drawer" width={REVIEW_DRAWER_WIDTH} widthStorageKey="dreamcut.review-drawer-width">{reviewDrawerNode}</SlideOutDrawer>}

      {showExportModal && (
        <ExportDialog
          elements={elements}
          aspectRatio={aspectRatio}
          onAspectRatioChange={(value) => void persistOutputAspectRatio(value as PreviewAspectRatio)}
          aspectRatioSaving={outputFormatSaving}
          aspectRatioError={outputFormatError}
          duration={formatTime(playbackDurationSeconds, 1)}
          width={compositionDimensions.width}
          height={compositionDimensions.height}
          resolution={exportResolution}
          onResolutionChange={setExportResolution}
          maxResolution={maxExportResolution}
          fps={frameRate}
          onFrameRateChange={(value) => { if (isProjectFrameRate(value)) void persistOutputFrameRate(value); }}
          renderer={renderBackend === "gpu" ? "Graphics card" : renderBackend === "rust" ? "Native · experimental" : "Standard"}
          phase={exportPhase}
          progress={activeRenderJob?.progress}
          progressLabel={activeRenderJob?.statusLabel}
          elapsedSeconds={renderElapsed}
          error={renderError}
          renderUrl={visibleRenderUrl}
          fileName={renderFileName}
          hasLastRender={hasLastRender}
          onOpenFolder={() => void revealRender()}
          onExport={() => void handleStartExport()}
          onRetry={() => { setRenderStatus("idle"); setRenderError(null); setExportStartedHere(false); }}
          onClose={closeExportModal}
        />
      )}
      {deleteLaneConfirm && (
        <div
          onClick={() => {
            if (!isDeletingLane) setDeleteLaneConfirm(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--chrome-panel)",
              border: "1px solid var(--chrome-line)",
              borderRadius: 16,
              width: "min(32rem, calc(100vw - 2rem))",
              padding: "1.5rem",
              boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
            }}
          >
            <h2 style={{ fontFamily: "var(--font-display, 'Playfair Display', serif)", fontSize: "1.35rem", fontWeight: 600, color: "var(--ink)", margin: 0 }}>
              Delete lane?
            </h2>
            <p style={{ fontSize: "0.96rem", color: "var(--ink-muted)", lineHeight: 1.6, margin: "0.75rem 0 0" }}>
              {deleteLaneConfirm.laneLabel} contains {deleteLaneConfirm.elementCount} clip{deleteLaneConfirm.elementCount === 1 ? "" : "s"}.
              Deleting this lane will permanently remove its contents from the timeline.
            </p>
            {confirmLane ? (
              <div style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {confirmLane.type} lane
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
              <Button
                variant="ghost"
                onClick={() => setDeleteLaneConfirm(null)}
                disabled={isDeletingLane}
                className={timelineGhostButtonClassName}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={isDeletingLane}
                onClick={async () => {
                  const laneKey = deleteLaneConfirm.laneKey;
                  setIsDeletingLane(true);
                  updateMutedLanes((prev) => {
                    if (!prev.has(laneKey)) return prev;
                    const next = new Set(prev);
                    next.delete(laneKey);
                    return next;
                  });
                  if (hiddenLanes.has(laneKey)) toggleLaneHidden(laneKey);
                  const deleted = await deleteLane(laneKey, { deleteContents: true });
                  setIsDeletingLane(false);
                  if (deleted) setDeleteLaneConfirm(null);
                }}
              >
                {isDeletingLane ? "Deleting..." : "Delete lane"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
