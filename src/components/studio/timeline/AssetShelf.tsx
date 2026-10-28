"use client";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useAssetPages } from "./useAssetPages";
import type { AssetPage } from "@/lib/library/asset-page";
import { LIBRARY_BUCKET_ORDER, bucketLabel, defaultLibraryBucket, initialLibraryKind, isLibraryBucket, readLibraryView, writeLibraryView, type LibraryBucket, type LibraryMediaKind } from "@/lib/library/library-buckets";
import { formatMediaDuration } from "@/lib/media/format-duration";
import { MediaGallery } from "@/components/ui/media-gallery";
import { LibraryEffectCatalog } from "./LibraryEffectCatalog";
import { LibraryExports } from "./LibraryExports";
import { toast } from "sonner";
import imageStyles from "./AssetImages.module.css";
import { libraryKindForSource } from "@/lib/library/library-selection-kind";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";
import { filterValueLabel } from "@/lib/library/filter-labels";
import { useLibrarySelection } from "./useLibrarySelection";
import { MediaWorkspaceTabs, type EditorRailConfig, type MediaWorkspacePane } from "./MediaWorkspaceTabs";
import { AssetGenerationDrawer, type GenerationLaunch } from "../generation/AssetGenerationDrawer";
import type { ReferenceRole } from "@/lib/generation/asset-models";
import { catalogAudioPreviewUrl } from "@/lib/remotion/catalog-audio-preview";
import { useAgentSelection } from "@/components/desktop/ProjectReviewDock";
import { useChatSelection } from "./useChatSelection";
import { setShelfDragPayload } from "./shelf-drag";
import { FilterButtons } from "./FilterButtons";
import { CaptionLookGallery, TextPanel, type PanelTextTarget } from "./PanelTextGalleries";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { DrawerSideContext } from "./drawer-side";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BookOpenIcon,
  FilmIcon,
  ImageIcon,
  LayoutGridIcon,
  ClapperboardIcon,
  Music4Icon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  ChevronDownIcon,
  CheckIcon,
  PlusIcon,
  AudioLinesIcon,
  UploadIcon,
  SparklesIcon,
  LibraryIcon,
  TypeIcon,
  CrownIcon,
  CloudDownloadIcon,
} from "lucide-react";
import { useCloudAccount } from "./CloudAccountSettings";
import { useMembership } from "./MembershipPrompt";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ThumbnailSizeControl, useThumbnailSize } from "./ThumbnailSizeControl";
// Generate only: Library images and video frames are markable (no-op elsewhere).
import { MarkableMedia } from "../generation/MarkableMedia";
import { DrawerCloseButton } from "./DrawerCloseButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logTimelineShelf } from "@/lib/debug/timeline-shelf";
import { APPROVED_UPLOAD_ACCEPT, LIBRARY_CHANGED_EVENT, uploadLibraryMedia, type UploadAssetType } from "@/lib/media/upload-library-media";
import type { CoverLayoutProposalSummary } from "@/lib/layout-proposals/cover-layout";
import { ToolPanelHeader, type DrawerPane, type SavedDrawerPane } from "./PanelDrawer";
import type { BeatMarker } from "./types";

import {
  getVisualIntentKey,
  buildVisualElementPayload,
  buildVoiceElementPayload,
  buildMusicElementPayload,
  buildSfxElementPayload,
  buildCaptionElementPayload,
  buildBookVisualElementPayload,
  resolveTrackVersion,
  resolveTrackCue,
  type ElementCreatePayload,
  type VisualAsset,
  type VoiceClip,
  type MusicTrack,
  type MusicTrackCue,
  type MusicTrackVersion,
  type MusicSelection,
  type SfxTrack,
  type CaptionAsset,
  type BookVisualAsset,
  type BookAudioAsset,
} from "./asset-shelf-payloads";
export type { ElementCreatePayload } from "./asset-shelf-payloads";

// ── Types ────────────────────────────────────────────────────────────────────

export type AssetShelfProps = {
  /** A host that collects project media (Storyboard Media). `chosen` lists the project media paths it already holds;
   *  those cards show In Media instead of an Add action. */
  mediaPicker?: { onChoose: (source: string) => Promise<void>; chosen?: readonly string[] };
  referencePicker?: { nonce: number; onChoose: (source: string) => Promise<void> };
  standaloneGeneration?: boolean;
  captionGeneration?: React.ReactNode;
  captionLookTarget?: PanelTextTarget;
  captionTranscript?: React.ReactNode;
  captionView?: "transcript" | "looks";
  onCaptionViewChange?: (view: "transcript" | "looks") => void;
  projectId: string;
  open: boolean;
  width: number;
  onClose: () => void;
  onWidthChange: (width: number) => void;
  onAddElement?: (payload: ElementCreatePayload) => Promise<void>;
  onReplaceMusic?: (payload: ElementCreatePayload) => Promise<void>;
  hasSelectedMusic?: boolean;
  beats: BeatMarker[];
  alwaysOpen?: boolean;
  /** Selection-scoped spatial proposal editor. */
  layoutNode?: React.ReactNode;
  layoutProposalId?: string | null;
  renderLayoutProposal?: (layoutId: string) => React.ReactNode;
  /** Local-workshop preprocessing and layout proposal tools. */
  showAdvancedTools?: boolean;
  /** The parent owns the slide animation; the shelf fills its persistent drawer. */
  drawerMode?: boolean;
  hideClose?: boolean;
  headerTarget?: HTMLElement | null;
  propertiesTab?: EditorRailConfig;
  /** Editor panes this instance offers (tall layout: Library drawer vs. Text/Captions beside Properties). */
  workflowPanes?: readonly MediaWorkspacePane[];
  /** Generate is one of this shelf's tabs (the Library drawer's Library · Generate · Music · Sounds), shown in place rather than as a drawer of its own. */
  inlineGenerate?: boolean;
  /** Pane chosen by a parent tab strip; the shelf then omits its own heading. */
  pane?: MediaWorkspacePane;
  onReveal?: () => void;
  /** Each panel's header action (the editor's Expand into a drawer); a pane listed here shows its header. */
  panelActions?: Partial<Record<DrawerPane, React.ReactNode>>;
  /** Each new value shows that docked pane (a panel docked back from its drawer). */
  dockRequest?: { pane: SavedDrawerPane; n: number };
  generationShortcutNonce?: number;
  /** Which Generate pane a new generationShortcutNonce opens: the form (default) or its results. */
  generationPane?: "create" | "history";
  onLibraryChanged?: () => void;
  /** Selected caption or title the Captions and Text panels restyle. */
  textTarget?: PanelTextTarget;
  onApplyCaptionLaneStyle?: (laneKey: string, styleProps: Record<string, unknown>) => Promise<unknown>;
  onPatchElementProps?: (elementId: string, props: Record<string, unknown>) => Promise<unknown>;
};

// ── Asset data shapes (from API) ─────────────────────────────────────────────

type AssetsResponse = {
  page?: AssetPage;
  beats: { id: string; sort_order: number; beat_label: string; duration_seconds: number | null }[];
  visuals: VisualAsset[];
  voice_clips: VoiceClip[];
  music_tracks: MusicTrack[];
  sfx_tracks: SfxTrack[];
  captions: CaptionAsset[];
  book_visuals: BookVisualAsset[];
  book_audio_assets: BookAudioAsset[];
  hyperframes_compositions: import("@/lib/local-store/hyperframes-overlays").HyperframesCompositionSummary[];
  placed_intent_keys: string[];
};

type TabKey = "layout" | "book" | "stills" | "videos" | "voice" | "music" | "sfx" | "captions" | "exports";
type UploadableTabKey = "stills" | "videos" | "music" | "sfx";
type ShelfSectionKey = "layout" | "stills" | "videos" | "audio" | "captions" | "book" | "exports";

// ── Colors ───────────────────────────────────────────────────────────────────

const C = {
  bgDeep: "var(--chrome-deep)",
  bgSurface: "var(--chrome-panel)",
  bgRaised: "var(--chrome-raised)",
  bgHover: "var(--chrome-raised)",
  border: "var(--chrome-line-strong)",
  borderSubtle: "var(--chrome-line)",
  borderFaint: "var(--chrome-panel)",
  textPrimary: "var(--ink)",
  textSecondary: "var(--ink)",
  textMuted: "var(--ink-muted)",
  textLight: "var(--ink-muted)",
  textDim: "var(--ink-muted)",
  accent: "var(--ink)",
  accentHover: "var(--ink)",
  accentGlow: "var(--chrome-raised)",
  accentBorder: "var(--chrome-selected-ring)",
  approved: "#327343",
  approvedBg: "rgba(92,184,92,0.08)",
  approvedBorder: "rgba(92,184,92,0.25)",
  visual: "#9aa4d4",
  voice: "#d4a89a",
  music: "#8cc48c",
  sfx: "#c88cb8",
  caption: "#8cbcc4",
} as const;

const RADIUS_SM = "0.4rem";
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;

function libraryIdentity(asset: VisualAsset): string {
  if (asset.catalog_visual_id) return `catalog:visual:${asset.catalog_visual_id}`;
  if (asset.catalog_image_id) return `catalog:image:${asset.catalog_image_id}`;
  return asset.upload_id ?? "";
}

// ── Scrollbar style injection (once) ─────────────────────────────────────────

const SCROLLBAR_STYLE_ID = "asset-shelf-scrollbar";

/** `aspect`: a shared clip not downloaded yet shows a placeholder of that shape; play downloads it. */
function BrowseVideoPreview({ source, poster, name, aspect }: { source: string; poster?: string; name: string; aspect?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(!poster && !aspect);
  const covered = Boolean(poster || aspect);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    // Once shown, a tile keeps its poster so the measured gallery never collapses while scrolling;
    // leaving the view only pauses a playing preview.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisible(true);
      else video.current?.pause();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // A small poster image is the measured preview; the video file is only requested once someone presses play.
  // One clear play/pause button replaces the browser's full transport; only one preview plays at a time.
  const playVideo = (current: HTMLVideoElement) => {
    current.closest('[role="tabpanel"]')?.querySelectorAll('video').forEach(other => { if (other !== current) other.pause(); });
    void current.play().catch(() => setPlaying(false));
  };
  const toggle = () => {
    if (!started) { setStarted(true); return; }
    const current = video.current;
    if (!current) return;
    if (current.paused) playVideo(current); else current.pause();
  };
  return <div ref={host} className={imageStyles.videoPreviewHost}>
    {visible ? <>
      {/* Not loading="lazy": the visibility observer already defers it, and an unmeasured lazy image has no height to become visible. */}
      {poster ? <img data-media-preview src={poster} alt="" decoding="async" onClick={toggle} />
        : aspect ? <span className={imageStyles.notDownloaded} style={{ aspectRatio: aspect }} role="img" aria-label="Not downloaded yet" onClick={toggle}><CloudDownloadIcon size={24} aria-hidden="true" /></span>
        : null}
      {started ? <video ref={node => { video.current = node; if (node && covered && node.paused && !node.dataset.autostarted) { node.dataset.autostarted = "1"; playVideo(node); } }}
        {...(covered ? { className: imageStyles.videoOverlay } : { "data-media-preview": true })}
        src={source} muted playsInline preload="metadata" loop
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onClick={toggle}
        onError={aspect ? () => { setStarted(false); toast.error("Could not download this clip. Check the connection and try again."); } : undefined} /> : null}
      <button type="button" className={imageStyles.previewButton} aria-label={`${playing ? "Pause" : "Play"} preview of ${name}`} onClick={toggle}>
        {playing ? <PauseIcon size={16} aria-hidden="true" /> : <PlayIcon size={16} aria-hidden="true" />}
      </button>
    </> : <PlayIcon size={28} aria-hidden="true" />}
  </div>;
}

function ensureScrollbarStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SCROLLBAR_STYLE_ID;
  style.textContent = `
    .asset-shelf-scroll::-webkit-scrollbar { width: 5px; }
    .asset-shelf-scroll::-webkit-scrollbar-track { background: transparent; }
    .asset-shelf-scroll::-webkit-scrollbar-thumb { background: var(--chrome-line-strong); border-radius: 3px; }
    .asset-shelf-tabs::-webkit-scrollbar { height: 4px; }
    .asset-shelf-tabs::-webkit-scrollbar-track { background: transparent; }
    .asset-shelf-tabs::-webkit-scrollbar-thumb { background: var(--chrome-line-strong); border-radius: 2px; }
    .asset-shelf-tabs::-webkit-scrollbar-thumb:hover { background: var(--chrome-line-strong); }
  `;
  document.head.appendChild(style);
}

// ── Helpers ──────────────────────────────────────────────────────────────────


/** "high" reads as a stray word beside an artist; "High energy" says what it is. */
function energyLabel(energy: string): string {
  return energy === "dynamic" ? "Varied energy" : `${energy.charAt(0).toUpperCase()}${energy.slice(1)} energy`;
}

function formatClock(s: number): string {
  const seconds = Math.max(0, Math.round(s));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Names that share a long prefix (IMG_2026…) stay distinguishable at narrow widths: the end is never cut. */
function TileName({ name }: { name: string }) {
  const tail = name.length > 18 ? name.slice(-10) : "";
  return <span className={imageStyles.name} title={name}><span className={imageStyles.nameHead}>{tail ? name.slice(0, -10) : name}</span>{tail ? <span className={imageStyles.nameTail}>{tail}</span> : null}</span>;
}

const UPLOAD_DESTINATION_TAB: Record<UploadAssetType, UploadableTabKey> = {
  still: "stills",
  video_clip: "videos",
  music: "music",
  sfx: "sfx",
};

function isUploadableTab(tab: TabKey): tab is UploadableTabKey {
  return tab === "stills" || tab === "videos" || tab === "music" || tab === "sfx";
}

// ── Tab config ───────────────────────────────────────────────────────────────

const SHELF_SECTIONS: { key: ShelfSectionKey; icon: React.ReactNode; label: string }[] = [
  { key: "stills", icon: <ImageIcon size={18} strokeWidth={2} />, label: "Images" },
  { key: "videos", icon: <FilmIcon size={18} strokeWidth={2} />, label: "Video" },
  { key: "audio", icon: <AudioLinesIcon size={18} strokeWidth={2} />, label: "Audio" },
  { key: "book", icon: <BookOpenIcon size={14} strokeWidth={2} />, label: "Book" },
  { key: "layout", icon: <LayoutGridIcon size={14} strokeWidth={2} />, label: "Layouts" },
  { key: "exports", icon: <ClapperboardIcon size={18} strokeWidth={2} />, label: "Exports" },
];

/** The Library kinds on every surface: one row under the Library tab, sharing search and This project / My library / Catalog. */
const LIBRARY_KINDS: { key: UploadableTabKey | "exports"; label: string; noun: string }[] = [
  { key: "stills", label: "Images", noun: "images" },
  { key: "videos", label: "Video", noun: "videos" },
  { key: "music", label: "Music", noun: "music" },
  { key: "sfx", label: "Sounds", noun: "sounds" },
  // Finished videos from every project; also kept in the shared exports folder on disk.
  { key: "exports", label: "Exports", noun: "exports" },
];

const AUDIO_TABS: { key: Extract<TabKey, "music" | "sfx">; label: string }[] = [
  { key: "music", label: "Music" },
  { key: "sfx", label: "SFX" },
];


function sectionForTab(tab: TabKey): ShelfSectionKey {
  if (tab === "voice" || tab === "music" || tab === "sfx") return "audio";
  return tab;
}

// ── Component ────────────────────────────────────────────────────────────────

// Names of Library pictures seen by any open Library view, so whichever view fills the Selected tray
// labels every pick by name, even one only the other view has loaded.
const libraryImageNames = new Map<string, string>();
const libraryImageKinds = new Map<string, VisualAsset["type"]>();

export function AssetShelf({
  referencePicker,
  mediaPicker,
  standaloneGeneration = false,
  captionGeneration,
  captionLookTarget,
  captionTranscript,
  captionView: controlledCaptionView,
  onCaptionViewChange,
  projectId,
  open,
  width,
  onClose,
  onWidthChange,
  onAddElement,
  onReplaceMusic,
  hasSelectedMusic = false,
  beats,
  alwaysOpen = false,
  layoutNode,
  layoutProposalId = null,
  renderLayoutProposal,
  showAdvancedTools = true,
  drawerMode = false,
  hideClose = false,
  headerTarget,
  propertiesTab,
  workflowPanes,
  inlineGenerate = false,
  pane: controlledPane,
  onReveal,
  panelActions,
  dockRequest,
  generationShortcutNonce = 0,
  generationPane = "create",
  onLibraryChanged,
  textTarget = null,
  onApplyCaptionLaneStyle,
  onPatchElementProps,
}: AssetShelfProps) {
  const router = useRouter();
  const [localCaptionView, setLocalCaptionView] = useState<"transcript" | "looks">("transcript");
  const captionView = controlledCaptionView ?? localCaptionView;
  const setCaptionView = onCaptionViewChange ?? setLocalCaptionView;
  // In the editor, Music and Sounds have their own rail tabs; Library keeps pictures.
  const editorRail = !!propertiesTab || !!workflowPanes;
  // The Library drawer instead lists Images · Video · Music · Sounds under its one Library tab.
  const audioInLibrary = !!workflowPanes?.includes("browse") && !workflowPanes.includes("music") && !workflowPanes.includes("sounds");
  /** Which Library this is, so each one reopens on the kind, bucket and search it last showed for the project. */
  const viewSurface = mediaPicker ? "media-picker" : referencePicker ? "reference" : standaloneGeneration ? "generate" : workflowPanes ? workflowPanes.join("+") : "shelf";
  // A media picker's host keeps its own selection; opening the shelf there must not reset it.
  const librarySelection = useLibrarySelection(projectId, (open || alwaysOpen) && !mediaPicker);
  const [activeTab, setActiveTab] = useState<TabKey>("stills");
  const [catalogMounted, setCatalogMounted] = useState(false);
  const [visualPane, setVisualPane] = useState<"browse" | "generate" | "results" | "catalog" | "text">(standaloneGeneration ? "generate" : "browse");
  const onGenerationPaneChange = useCallback((pane: "create" | "history") => setVisualPane(pane === "history" ? "results" : "generate"), []);
  const [generationMounted, setGenerationMounted] = useState(standaloneGeneration);
  const [thumbnailSize, setThumbnailSize] = useThumbnailSize("dreamcut:generate-thumbnail-size", standaloneGeneration);
  const gallerySizing = standaloneGeneration ? { targetHeight: thumbnailSize === "small" ? 72 : thumbnailSize === "large" ? 220 : 140, minCardWidth: thumbnailSize === "small" ? 64 : thumbnailSize === "large" ? 180 : 110, gap: 8 } : {};

  const [generationLaunch, setGenerationLaunch] = useState<GenerationLaunch>();
  const [pickingGenerationRole, setPickingGenerationRole] = useState<ReferenceRole>();
  const [pickingGenerationLabel, setPickingGenerationLabel] = useState("");
  // In the editor, space is tight: Generate is a slide-out drawer opened from this Library drawer.
  const generateAsDrawer = !standaloneGeneration && !inlineGenerate && (!!propertiesTab || !!workflowPanes);
  const [generateDrawerOpen, setGenerateDrawerOpen] = useState(false);
  // Mounted on first open: the tall and wide layouts each hold a shelf, and only the one used needs a form.
  const [generateDrawerMounted, setGenerateDrawerMounted] = useState(false);
  useEffect(() => { if (generateDrawerOpen) setGenerateDrawerMounted(true); }, [generateDrawerOpen]);
  const launchGeneration = (launch: GenerationLaunch) => {
    if (propertiesTab) {
      sessionStorage.setItem(`dreamcut:generation-launch:${projectId}`, JSON.stringify(launch));
      router.push(`/p/${encodeURIComponent(projectId)}/library?generate=create`);
    } else setGenerationLaunch(launch);
  };
  useEffect(() => {
    // A handoff from Storyboard or the editor waits in session storage until Generate opens.
    if (!standaloneGeneration && !generationShortcutNonce) return;
    const key = `dreamcut:generation-launch:${projectId}`;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) { sessionStorage.removeItem(key); setGenerationLaunch(JSON.parse(saved)); }
    } catch { /* A stale local handoff must not block the Generate workspace. */ }
  }, [projectId, standaloneGeneration, generationShortcutNonce]);

  const seenGenerationShortcut = useRef(0);
  useEffect(() => {
    if (generationShortcutNonce === seenGenerationShortcut.current) return;
    seenGenerationShortcut.current = generationShortcutNonce;
    setPickingGenerationRole(undefined);
    if (generateAsDrawer) { setGenerateDrawerOpen(true); return; }
    setGenerationMounted(true);
    setVisualPane(generationPane === "history" ? "results" : "generate");
  }, [generationShortcutNonce, generationPane]);
  const [showAllAudio, setShowAllAudio] = useState(false);
  const [expandedAudioId, setExpandedAudioId] = useState<string | null>(null);
  const lastAudioTabRef = useRef<Extract<TabKey, "voice" | "music" | "sfx"> | null>(null);
  const [layoutProposals, setLayoutProposals] = useState<CoverLayoutProposalSummary[]>([]);
  const [openedLayoutProposalId, setOpenedLayoutProposalId] = useState<string | null>(
    layoutProposalId,
  );

  // Agent proposals live in the review DRAWER (TimelineStep), not a shelf tab.
  const previousLayoutProposalIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (layoutProposalId && layoutProposalId !== previousLayoutProposalIdRef.current) {
      setOpenedLayoutProposalId(layoutProposalId);
      setActiveTab("layout");
    }
    previousLayoutProposalIdRef.current = layoutProposalId;
  }, [layoutProposalId]);

  useEffect(() => {
    if (
      alwaysOpen
      || activeTab !== "layout"
      || !openedLayoutProposalId
      || width >= 520
    ) return;
    onWidthChange(520);
  }, [activeTab, alwaysOpen, onWidthChange, openedLayoutProposalId, width]);
  const [searchQuery, setSearchQuery] = useState("");
  const [audioFilters, setAudioFilters] = useState<Record<string, string>>({});
  // Pictures, videos, music and sounds open on this project's media, else the creator's personal library, else the shared catalog.
  const [librarySource, setLibrarySource] = useState<LibraryBucket>("project");
  const visualTab = activeTab === "stills" || activeTab === "videos";
  const sourcedTab = visualTab || ((activeTab === "music" || activeTab === "sfx") && !showAllAudio);
  const activeAudioFilters = useMemo(() => ({
    ...Object.fromEntries(Object.entries(audioFilters)
      .filter(([name]) => !showAllAudio && (activeTab === "music" ? name === "mood" || name === "energy" : activeTab === "sfx" && (name === "sfx_category" || name === "motion")))),
    ...(sourcedTab && !pickingGenerationRole ? { source: librarySource } : {}),
  }), [activeTab, audioFilters, showAllAudio, sourcedTab, librarySource, pickingGenerationRole]);
  const {data: assets, loading, error: assetLoadError, refresh: fetchAssets, loadMore} = useAssetPages<AssetsResponse>(
    projectId, showAllAudio ? "audio" : activeTab, searchQuery, (open || alwaysOpen) && (standaloneGeneration || visualPane === "browse") && activeTab !== "exports", activeAudioFilters,
  );
  const musicSelection = useChatSelection("music");
  const soundSelection = useChatSelection("sounds");
  // Members-only catalog sounds stay locked when signed out or when DreamCut Cloud says "not a member".
  const cloudAccount = useCloudAccount().account;
  const membership = useMembership(cloudAccount);
  const membersLocked = cloudAccount !== null && (!cloudAccount.signed_in || membership?.member === false);
  // Library image selections also appear as chat pills; removing a pill deselects the image.
  const replaceSelectionGroup = useAgentSelection()?.replaceSelectionGroup;
  const drawerSide = useContext(DrawerSideContext);
  const imageNamesRef = useRef(libraryImageNames);
  const imageKindsRef = useRef(libraryImageKinds);
  for (const asset of assets?.visuals ?? []) { imageNamesRef.current.set(libraryIdentity(asset), asset.name); imageKindsRef.current.set(libraryIdentity(asset), asset.type); }
  const toggleLibrarySource = librarySelection.toggle;
  // Whichever open view shows the Library (the docked panel or either drawer) keeps the Selected tray
  // current; closing it leaves the pills in place.
  const showsLibrary = (!!propertiesTab || !!workflowPanes?.includes("browse")) && (open || alwaysOpen) && !mediaPicker;
  useEffect(() => {
    if (!replaceSelectionGroup || !showsLibrary) return;
    replaceSelectionGroup("library-images", librarySelection.sources.map(source => {
      const label = imageNamesRef.current.get(source) ?? source.split(/[/:]/).pop() ?? source;
      const kind = libraryKindForSource(source, imageKindsRef.current.get(source));
      return { id: `image:${source}`, group: "library-images", kind, label, agentText: `Library ${kind.toLowerCase()} "${label}" (${source}).`,
        onRemove: () => void toggleLibrarySource(source).catch(error => toast.error(error.message)) };
    }));
  }, [librarySelection.sources, showsLibrary, replaceSelectionGroup, toggleLibrarySource, assets]);

  const [isResizing, setIsResizing] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [uploadingTab, setUploadingTab] = useState<UploadableTabKey | null>(null);
  const [importProgress, setImportProgress] = useState<{ name: string; percent: number; index: number; total: number } | null>(null);
  const importBusy = useRef(false);
  const [fileDrag, setFileDrag] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [musicSelections, setMusicSelections] = useState<Record<string, MusicSelection>>({});

  const selectTab = useCallback((tab: TabKey) => {
    autoKindFor.current = projectId; // A deliberate (or automatic) choice ends automatic tab picking.
    if (tab !== activeTabRef.current) autoBucketFor.current = null; // Each kind opens on its own first non-empty bucket.
    setShowAllAudio(false);
    if (tab === "voice" || tab === "music" || tab === "sfx") lastAudioTabRef.current = tab;
    setActiveTab(tab);
  }, [projectId]);

  useEffect(() => {
    if (referencePicker) { selectTab("videos"); setVisualPane("browse"); }
  }, [referencePicker, selectTab]);

  // Open on the kind this project's own media has (a video-only project never opens on the personal library's pictures).
  // Applied once per project, and never after the creator picks a tab themselves or a saved view was restored.
  const autoKindFor = useRef<string | null>(null);
  const autoBucketFor = useRef<string | null>(null);
  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const restoredViewFor = useRef<string | null>(null);
  // A restored kind (remembered from earlier in the session) gives way once, when it shows none of this
  // project's media and another kind has some: an empty project's Images tab must not hide a video added since.
  const restoredKind = useRef<string | null>(null);
  useEffect(() => {
    if (restoredViewFor.current === projectId) return;
    restoredViewFor.current = projectId;
    const saved = readLibraryView(viewSurface, projectId);
    if (!saved) return;
    const kind = LIBRARY_KINDS.find(entry => entry.key === saved.kind)?.key;
    const kindAllowed = kind && (audioInLibrary || !editorRail || kind === "stills" || kind === "videos");
    if (kind && kindAllowed && !referencePicker) { autoKindFor.current = projectId; restoredKind.current = kind; setActiveTab(kind); }
    if (isLibraryBucket(saved.bucket)) { autoBucketFor.current = kindAllowed && !referencePicker ? kind! : activeTabRef.current; setLibrarySource(saved.bucket); }
    if (saved.search) setSearchQuery(saved.search);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const counts = assets?.page?.counts;
    if (!counts || pickingGenerationRole || referencePicker || !isUploadableTab(activeTab)) return;
    const allowed: readonly LibraryMediaKind[] = editorRail && !audioInLibrary ? ["videos", "stills"] : ["videos", "stills", "music", "sfx"];
    if (autoKindFor.current === projectId) {
      const restored = restoredKind.current;
      restoredKind.current = null;
      if (restored !== activeTab || (counts[`${activeTab}_project`] ?? 0) > 0) return;
    }
    autoKindFor.current = projectId;
    const kind = initialLibraryKind(counts, activeTab, allowed);
    if (kind !== activeTab) selectTab(kind);
  }, [assets?.page?.counts, activeTab, projectId, pickingGenerationRole, referencePicker, editorRail, audioInLibrary, selectTab]);
  useEffect(() => {
    const counts = assets?.page?.counts;
    if (!counts || pickingGenerationRole || !isUploadableTab(activeTab) || autoBucketFor.current === activeTab) return;
    autoBucketFor.current = activeTab;
    setLibrarySource(defaultLibraryBucket(counts, activeTab));
  }, [assets?.page?.counts, activeTab, pickingGenerationRole]);
  const chooseBucket = (bucket: LibraryBucket) => { autoBucketFor.current = activeTab; setLibrarySource(bucket); };
  useEffect(() => {
    if (pickingGenerationRole || restoredViewFor.current !== projectId || !isUploadableTab(activeTab) && activeTab !== "exports") return;
    // Save only a settled view (after the automatic kind and bucket), so a remount never restores the bare defaults.
    if (isUploadableTab(activeTab) && (autoKindFor.current !== projectId || autoBucketFor.current !== activeTab)) return;
    writeLibraryView(viewSurface, projectId, { kind: activeTab, bucket: librarySource, search: searchQuery });
  }, [activeTab, librarySource, searchQuery, pickingGenerationRole, projectId, viewSurface]);

  const shelfRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  // Stop audio when shelf closes
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingUrl(null);
    }
  }, [open]);

  const togglePlay = useCallback((url: string) => {
    if (playingUrl === url) {
      // Stop current
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingUrl(null);
      return;
    }
    // Stop previous if any
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(catalogAudioPreviewUrl(url));
    audio.addEventListener("ended", () => {
      setPlayingUrl(null);
      audioRef.current = null;
    });
    audio.play();
    audioRef.current = audio;
    setPlayingUrl(url);
  }, [playingUrl]);

  // Inject scrollbar CSS
  useEffect(() => {
    ensureScrollbarStyles();
  }, []);

  useEffect(() => {
    logTimelineShelf("AssetShelf props", {
      projectId,
      open,
      width,
      loading,
    });
  }, [loading, open, projectId, width]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const shelf = shelfRef.current;
      const parent = shelf?.parentElement;
      const offsetParent = shelf?.offsetParent as HTMLElement | null;
      logTimelineShelf("AssetShelf layout", {
        projectId,
        shelfRect: shelf?.getBoundingClientRect().toJSON(),
        parentRect: parent?.getBoundingClientRect().toJSON(),
        offsetParentRect: offsetParent?.getBoundingClientRect().toJSON(),
        computedWidth: shelf ? window.getComputedStyle(shelf).width : null,
        computedOverflow: shelf ? window.getComputedStyle(shelf).overflow : null,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, projectId, width, loading]);

  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf || !open) return;

    const handleWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const tabs = target?.closest(".asset-shelf-tabs") as HTMLElement | null;
      const list = target?.closest(".asset-shelf-scroll") as HTMLElement | null;
      const layoutWorkspace = target?.closest("[data-layout-workspace]") as HTMLElement | null;
      const isHorizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const isZoom = event.ctrlKey || event.metaKey;
      if (isZoom) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (layoutWorkspace) return;
      if (tabs && isHorizontal) {
        event.preventDefault();
        event.stopPropagation();
        tabs.scrollLeft += event.deltaX !== 0 ? event.deltaX : event.deltaY;
        return;
      }
      if (list && isHorizontal) {
        event.preventDefault();
        event.stopPropagation();
        list.scrollLeft += event.deltaX !== 0 ? event.deltaX : event.deltaY;
      }
    };

    shelf.addEventListener("wheel", handleWheel, { passive: false });
    return () => shelf.removeEventListener("wheel", handleWheel);
  }, [open]);

  // Layouts are independent of media browsing and must not gate its first paint.
  useEffect(() => {
    if (!open || activeTab !== "layout") return;
    const controller = new AbortController();
    void fetch(`/api/projects/${projectId}/layout-proposals`, {signal: controller.signal})
      .then(response => response.ok ? response.json() : null)
      .then(body => { if (body && !controller.signal.aborted) setLayoutProposals(body.layouts ?? []); })
      .catch(() => {});
    return () => controller.abort();
  }, [open, projectId, activeTab]);

  useEffect(() => {
    if (!open || !assets?.visuals.some(asset => asset.preparation?.state === "preparing" || asset.preparation?.state === "imported")) return;
    const timer = setInterval(() => void fetchAssets({ silent: true }), 2000);
    return () => clearInterval(timer);
  }, [open, assets, fetchAssets]);

  // Category counts
  const counts = useMemo<Record<TabKey, number>>(() => {
    if (!assets) return { layout: layoutProposals.length, book: 0, stills: 0, videos: 0, voice: 0, music: 0, sfx: 0, captions: 0, exports: 0 };
    if (assets.page) return {layout: layoutProposals.length, ...assets.page.counts} as Record<TabKey, number>;
    return {
      layout: layoutProposals.length,
      book: assets.book_visuals.length + assets.book_audio_assets.length,
      stills: assets.visuals.filter((asset) => asset.type === "still").length,
      videos: assets.visuals.filter((asset) => asset.type === "video_clip").length,
      voice: assets.voice_clips.length,
      music: assets.music_tracks.length,
      sfx: assets.sfx_tracks.length,
      captions: assets.captions.length,
      exports: 0,
    };
  }, [assets, layoutProposals.length]);

  // Placed intent keys set
  const placedKeys = useMemo(() => {
    return new Set(assets?.placed_intent_keys ?? []);
  }, [assets]);

  // ── Resize handle ────────────────────────────────────────────────────────

  const handleResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: globalThis.PointerEvent) => {
        const delta = startX - ev.clientX;
        const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + delta));
        onWidthChange(newW);
      };
      const onUp = () => {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [width, onWidthChange],
  );

  // ── Add handlers ─────────────────────────────────────────────────────────

  // In Media: the host's own list decides; a catalog pick is remembered by the project copy it became.
  const chosenMedia = useMemo(() => new Set(mediaPicker?.chosen ?? []), [mediaPicker?.chosen]);
  const [addedMedia, setAddedMedia] = useState<Record<string, string>>({});
  const rememberAdded = useCallback((identity: string, source: string) => setAddedMedia(current => current[identity] === source ? current : { ...current, [identity]: source }), []);
  const isInMedia = (identity: string, ...paths: (string | null | undefined)[]) =>
    !!mediaPicker?.chosen && [...paths, addedMedia[identity]].some(path => !!path && chosenMedia.has(path));

  const handleAddVisual = useCallback(
    async (asset: VisualAsset) => {
      if (mediaPicker && !pickingGenerationRole) {
        setAddingKey(getVisualIntentKey(asset));
        try { const media = await librarySelection.prepareReference(libraryIdentity(asset)); await mediaPicker.onChoose(media.source); rememberAdded(libraryIdentity(asset), media.source); void fetchAssets({ silent: true }); }
        finally { setAddingKey(null); }
        return;
      }
      if (referencePicker && !pickingGenerationRole && asset.type === "video_clip") {
        setAddingKey(getVisualIntentKey(asset));
        try { const reference = await librarySelection.prepareReference(libraryIdentity(asset)); await referencePicker.onChoose(reference.source); }
        finally { setAddingKey(null); }
        return;
      }
      if (pickingGenerationRole && asset.source_url) {
        setAddingKey(getVisualIntentKey(asset));
        try {
          const reference = await librarySelection.prepareReference(libraryIdentity(asset));
          setGenerationLaunch({ nonce: Date.now(), source: reference.source, referenceRole: pickingGenerationRole, addReference: true });
          setPickingGenerationRole(undefined);
          if (generateAsDrawer) setGenerateDrawerOpen(true);
          else { setGenerationMounted(true); setVisualPane("generate"); }
        } finally { setAddingKey(null); }
        return;
      }
      if (!onAddElement) return;
      const key = getVisualIntentKey(asset);
      setAddingKey(key);
      try {
        await onAddElement(buildVisualElementPayload(asset, beats));
      } finally {
        setAddingKey(null);
      }
    },
    [onAddElement, beats, pickingGenerationRole, librarySelection, referencePicker, mediaPicker, rememberAdded, fetchAssets],
  );

  // Add on a video without a preview starts preparing it and places it once the preview is ready.
  const [queuedVideoAdds, setQueuedVideoAdds] = useState<ReadonlySet<string>>(() => new Set());
  const queueVideoAdd = useCallback(async (video: VisualAsset) => {
    const key = getVisualIntentKey(video);
    setQueuedVideoAdds(current => new Set(current).add(key));
    try {
      const response = await fetch(`/api/projects/${projectId}/media-preparation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(video.upload_id ? { source: video.upload_id } : { catalog_visual_id: video.catalog_visual_id }) });
      if (!response.ok) throw new Error((await response.json()).error ?? "Preparation failed");
      await fetchAssets({ silent: true });
    } catch (error) {
      setQueuedVideoAdds(current => { const next = new Set(current); next.delete(key); return next; });
      toast.error(error instanceof Error ? error.message : "Preparation failed");
    }
  }, [projectId, fetchAssets]);
  useEffect(() => {
    if (queuedVideoAdds.size === 0 || !assets) return;
    const settled = assets.visuals.filter(asset => queuedVideoAdds.has(getVisualIntentKey(asset))
      && (asset.preparation?.state === "ready" || asset.preparation?.state === "failed"));
    if (settled.length === 0) return;
    setQueuedVideoAdds(current => { const next = new Set(current); for (const asset of settled) next.delete(getVisualIntentKey(asset)); return next; });
    for (const asset of settled) {
      if (asset.preparation?.state === "failed") toast.error(asset.preparation.error ?? `Could not prepare ${asset.name}`);
      else void handleAddVisual(asset).catch(error => toast.error(error instanceof Error ? error.message : "Could not add video"));
    }
  }, [assets, queuedVideoAdds, handleAddVisual]);

  const handleAddVoice = useCallback(
    async (clip: VoiceClip) => {
      if (!onAddElement) return;
      const key = `voice:${clip.clip_id}`;
      setAddingKey(key);
      try {
        await onAddElement(buildVoiceElementPayload(clip, beats));
      } finally {
        setAddingKey(null);
      }
    },
    [onAddElement, beats],
  );

  const handleAddMusic = useCallback(
    async (track: MusicTrack) => {
      if (!onAddElement) return;
      const key = `music:${track.track_id}`;
      setAddingKey(key);
      try {
        await onAddElement(buildMusicElementPayload(track, beats, musicSelections[track.track_id]));
      } finally {
        setAddingKey(null);
      }
    },
    [onAddElement, beats, musicSelections],
  );

  const handleReplaceMusic = useCallback(async (track: MusicTrack) => {
    if (!onReplaceMusic) return;
    const key = `music:${track.track_id}`;
    setAddingKey(key);
    try {
      await onReplaceMusic(buildMusicElementPayload(track, beats, musicSelections[track.track_id]));
    } finally {
      setAddingKey(null);
    }
  }, [beats, musicSelections, onReplaceMusic]);

  const handleAddSfx = useCallback(
    async (track: SfxTrack) => {
      if (!onAddElement) return;
      const key = `sfx:${track.track_id}`;
      setAddingKey(key);
      try {
        await onAddElement(buildSfxElementPayload(track));
      } finally {
        setAddingKey(null);
      }
    },
    [onAddElement],
  );

  const handleAddCaption = useCallback(
    async (cap: CaptionAsset) => {
      if (!onAddElement) return;
      const key = `caption:${cap.caption_id}`;
      setAddingKey(key);
      try {
        await onAddElement(buildCaptionElementPayload(cap, beats));
      } finally {
        setAddingKey(null);
      }
    },
    [onAddElement, beats],
  );

  const handleAddBookVisual = useCallback(
    async (asset: BookVisualAsset) => {
      if (!onAddElement) return;
      const key = `book_visual:${asset.asset_id}`;
      setAddingKey(key);
      try {
        await onAddElement(buildBookVisualElementPayload(asset));
      } finally {
        setAddingKey(null);
      }
    },
    [onAddElement],
  );

  const handleUploadClick = useCallback(() => {
    const uploadTab = activeTab === "voice" ? "music" : activeTab;
    if (!isUploadableTab(uploadTab) || uploadingTab) return;
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, [activeTab, uploadingTab]);

  const importFiles = useCallback(async (files: File[]) => {
    if (!files.length || importBusy.current) return;
    importBusy.current = true;
    setUploadingTab(activeTab === "sfx" ? "sfx" : "videos");
    setUploadError(null);
    const errors: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setImportProgress({ name: file.name, percent: 0, index: index + 1, total: files.length });
        try {
          const uploaded = await uploadLibraryMedia(projectId, file, activeTab === "sfx" ? "sfx" : "music", percent =>
            setImportProgress({ name: file.name, percent, index: index + 1, total: files.length }));
          const destination = UPLOAD_DESTINATION_TAB[uploaded.assetType];
          setSearchQuery(files.length === 1 ? file.name : "");
          setVisualPane("browse");
          selectTab(destination);
          // An import lands in This project of its kind, whatever the (pre-import) counts would choose.
          autoBucketFor.current = destination;
          setLibrarySource("project");
          onLibraryChanged?.();
          if (uploaded.processing?.status === "failed") errors.push(`${file.name}: imported, but preparation could not start.`);
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : "Import failed"}`);
        }
      }
      setUploadError(errors.length ? errors.join(" ") : null);
    } finally {
      importBusy.current = false;
      setUploadingTab(null);
      setImportProgress(null);
    }
  }, [activeTab, onLibraryChanged, selectTab, projectId]);

  const handleUploadChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void importFiles(files);
  }, [importFiles]);

  // Media imported anywhere in the editor (such as from the chat) appears here without a reload.
  useEffect(() => {
    const refresh = () => { void fetchAssets(); };
    window.addEventListener(LIBRARY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, refresh);
  }, [fetchAssets]);

  // ── Filtered items ───────────────────────────────────────────────────────

  const filteredStills = useMemo(() => {
    if (!assets) return [];
    let list = assets.visuals;
    list = list.filter((v) => v.type === "still");
    if (searchQuery && !assets.page) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => `${v.name} ${v.import_search_text ?? ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [assets, searchQuery, pickingGenerationRole, projectId]);

  const filteredVideos = useMemo(() => {
    if (!assets) return [];
    let list = assets.visuals;
    list = list.filter((v) => v.type === "video_clip");
    if (searchQuery && !assets.page) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => `${v.name} ${v.import_search_text ?? ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [assets, searchQuery, pickingGenerationRole, projectId]);

  const filteredVoice = useMemo(() => {
    if (!assets) return [];
    let list = assets.voice_clips;
    if (searchQuery && !assets.page) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => v.clip_name.toLowerCase().includes(q));
    }
    return list;
  }, [assets, searchQuery]);

  const filteredMusic = useMemo(() => {
    if (!assets) return [];
    let list = assets.music_tracks;
    if (searchQuery && !assets.page) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => [
        v.track_name,
        v.artist ?? "",
        v.import_search_text ?? "",
        ...(v.moods ?? []),
        ...(v.good_for ?? []),
      ].some((value) => value.toLowerCase().includes(q)));
    }
    return list;
  }, [assets, searchQuery]);

  const filteredSfx = useMemo(() => {
    if (!assets) return [];
    let list = assets.sfx_tracks;
    if (searchQuery && !assets.page) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => [
        v.track_name,
        v.category ?? "",
        v.import_search_text ?? "",
        ...(v.tags ?? []),
        ...(v.good_for ?? []),
        ...(v.editorial?.texture ?? []),
      ].some((value) => value.toLowerCase().includes(q)));
    }
    return list;
  }, [assets, searchQuery]);

  const filteredCaptions = useMemo(() => {
    if (!assets) return [];
    let list = assets.captions;
    if (searchQuery && !assets.page) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => v.text.toLowerCase().includes(q));
    }
    return list;
  }, [assets, searchQuery]);

  const filteredBookVisuals = useMemo(() => {
    if (!assets) return [];
    let list = assets.book_visuals;
    if (searchQuery && !assets.page) {
      const q = searchQuery.toLowerCase();
      list = list.filter((asset) => asset.name.toLowerCase().includes(q));
    }
    return list;
  }, [assets, searchQuery]);

  const filteredBookAudio = useMemo(() => {
    if (!assets) return [];
    let list = assets.book_audio_assets;
    if (searchQuery && !assets.page) {
      const q = searchQuery.toLowerCase();
      list = list.filter((asset) => asset.name.toLowerCase().includes(q));
    }
    return list;
  }, [assets, searchQuery]);

  const uploadedStills = useMemo(
    () => filteredStills.filter((asset) => asset.is_uploaded || !asset.beat_id),
    [filteredStills],
  );
  const generatedStills = useMemo(
    () => filteredStills.filter((asset) => !asset.is_uploaded && !!asset.beat_id),
    [filteredStills],
  );
  const uploadedVideos = useMemo(
    () => filteredVideos.filter((asset) => asset.is_uploaded || !asset.beat_id),
    [filteredVideos],
  );
  const generatedVideos = useMemo(
    () => filteredVideos.filter((asset) => !asset.is_uploaded && !!asset.beat_id),
    [filteredVideos],
  );

  // Group visuals by beat
  const visualsByBeat = useMemo(() => {
    const map = new Map<string, VisualAsset[]>();
    for (const v of generatedStills) {
      if (!v.beat_id) continue;
      const arr = map.get(v.beat_id) ?? [];
      arr.push(v);
      map.set(v.beat_id, arr);
    }
    return map;
  }, [generatedStills]);

  const videosByBeat = useMemo(() => {
    const map = new Map<string, VisualAsset[]>();
    for (const v of generatedVideos) {
      if (!v.beat_id) continue;
      const arr = map.get(v.beat_id) ?? [];
      arr.push(v);
      map.set(v.beat_id, arr);
    }
    return map;
  }, [generatedVideos]);

  // Group voice by beat
  const voiceByBeat = useMemo(() => {
    const map = new Map<string, VoiceClip[]>();
    for (const v of filteredVoice) {
      const arr = map.get(v.beat_id) ?? [];
      arr.push(v);
      map.set(v.beat_id, arr);
    }
    return map;
  }, [filteredVoice]);

  // Group captions by beat
  const captionsByBeat = useMemo(() => {
    const map = new Map<string, CaptionAsset[]>();
    for (const c of filteredCaptions) {
      const arr = map.get(c.beat_id) ?? [];
      arr.push(c);
      map.set(c.beat_id, arr);
    }
    return map;
  }, [filteredCaptions]);

  // Sorted beat ids (from assets data)
  const sortedBeatIds = useMemo(() => {
    if (!assets) return [];
    return [...assets.beats].sort((a, b) => a.sort_order - b.sort_order).map((b) => b.id);
  }, [assets]);

  const beatLabelMap = useMemo(() => {
    if (!assets) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const b of assets.beats) {
      map.set(b.id, b.beat_label);
    }
    return map;
  }, [assets]);

  const beatOrderMap = useMemo(() => {
    if (!assets) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const b of assets.beats) {
      map.set(b.id, b.sort_order);
    }
    return map;
  }, [assets]);

  // ── Styles ───────────────────────────────────────────────────────────────

  const shelfShellStyle: CSSProperties = drawerMode
    ? {
        position: "relative",
        flex: "1 1 0%",
        width: "100%",
        minWidth: 0,
        height: "100%",
        overflow: "hidden",
        overscrollBehaviorX: "contain",
      }
    : alwaysOpen
    ? {
        position: "relative",
        flex: "1 1 0%",
        width: "100%",
        minWidth: 0,
        height: "100%",
        overflow: "hidden",
        overscrollBehaviorX: "contain",
      }
    : {
        position: "relative",
        flex: `0 0 ${open ? width : 0}px`,
        width: open ? width : 0,
        minWidth: 0,
        maxWidth: "none",
        height: "100%",
        overflow: "hidden",
        overscrollBehaviorX: "contain",
        transition: isResizing ? "none" : "flex-basis 0.5s cubic-bezier(0.4,0,0.2,1), width 0.5s cubic-bezier(0.4,0,0.2,1)",
      };

  const shelfStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    // The shelf sits beside the frame, so it is a PANEL, not the floor. Chrome steps darker
    // with distance from the video: surround (#353535) -> panel (#2c2c2c) -> deep (#212121).
    // Only the field around the frame has a specified luminance; everything else recedes.
    background: C.bgSurface,
    borderLeft: "none",
    display: "flex",
    flexDirection: "column",
    boxShadow: alwaysOpen || drawerMode ? "none" : "-4px 0 24px rgba(0,0,0,0.3)",
    transition: alwaysOpen || drawerMode ? "none" : (isResizing ? "none" : "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease"),
    transform: alwaysOpen || drawerMode || open ? "translateX(0)" : "translateX(100%)",
    pointerEvents: alwaysOpen || drawerMode || open ? "auto" : "none",
    opacity: alwaysOpen || drawerMode || open ? 1 : 0,
    outline: alwaysOpen || drawerMode ? "none" : (open ? "2px solid var(--chrome-focus-ring)" : "none"),
    overscrollBehaviorX: "contain",
  };

  const resizeHandleStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: -4,
    bottom: 0,
    width: 8,
    cursor: "col-resize",
    zIndex: 60,
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  function renderThumbVisual(asset: { source_url: string | null; type: "still" | "video_clip"; name: string }) {
    return (
      <div
        style={{
          width: 56,
          height: "auto",
          borderRadius: 3,
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, var(--chrome-panel), var(--chrome-raised))",
        }}
      >
        {asset.source_url
          ? asset.type === "video_clip"
            ? (
                <img
                  src={thumbnailUrl(asset.source_url, 160)}
                  alt={asset.name}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: "100%",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                    background: "var(--chrome-deep)",
                  }}
                />
              )
            : (
                <img
                  src={thumbnailUrl(asset.source_url, 160)}
                  alt={asset.name}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: "100%",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                    background: "var(--chrome-deep)",
                  }}
                />
              )
          : null}
      </div>
    );
  }

  function renderThumbVoice() {
    const bars = [12, 20, 16, 22, 14, 18, 10];
    return (
      <div
        style={{
          width: 56,
          height: 38,
          borderRadius: 3,
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
          background: C.bgSurface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              width: 2,
              height: h,
              borderRadius: 1,
              background: C.voice,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    );
  }

  function renderThumbCaption(text: string) {
    return (
      <div
        style={{
          width: 56,
          height: 38,
          borderRadius: 3,
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
          background: C.bgSurface,
          display: "grid",
          placeItems: "center",
          fontSize: "0.5rem",
          color: C.textDim,
          textAlign: "center",
          padding: 2,
          lineHeight: 1.2,
          fontStyle: "italic",
        }}
      >
        {text.slice(0, 30)}
      </div>
    );
  }

  function renderTypeBadge(label: string, colorVar: string) {
    return (
      <span
        style={{
          fontSize: "var(--ui-text-small)",
          padding: "1px 6px",
          borderRadius: "var(--edge-control-inner)",
          fontWeight: 500,
          background: colorVar + "1e",
          color: colorVar,
        }}
      >
        {label}
      </span>
    );
  }

  /** Every card's one action (Add, Add to Media, Use, Prepare), drawn as the same pill in the same place. */
  function renderCardAction(action: { label: string; busyLabel?: string; busy: boolean; disabled?: boolean; ariaLabel: string; onClick: () => void; plus?: boolean; title?: string }) {
    return <Button type="button" variant="ghost" size="sm" className={imageStyles.actionPill} disabled={action.disabled} aria-busy={action.busy || undefined}
      aria-label={action.ariaLabel} title={action.title} onClick={event => { event.stopPropagation(); action.onClick(); }}>
      {action.busy ? action.busyLabel ?? "Adding…" : <>{action.plus ? <PlusIcon size={14} aria-hidden="true" /> : null}{action.label}</>}
    </Button>;
  }
  /** A card the media host already holds: a badge, not a second Add. */
  function renderInMedia(name: string) {
    return <Button type="button" variant="ghost" size="sm" className={imageStyles.actionPill} data-state="in-media" disabled aria-label={`${name} is in Media`}>
      <CheckIcon size={14} aria-hidden="true" />In Media
    </Button>;
  }
  const pickerAddLabel = "Add to Media";
  /** A video without a preview yet: Add prepares it and places it when ready (Retry after a failed preparation). */
  function renderPreparingAddAction(video: VisualAsset) {
    const queued = queuedVideoAdds.has(getVisualIntentKey(video));
    const failed = video.preparation?.state === "failed" && !queued;
    return renderCardAction({
      label: failed ? "Retry" : "Add", plus: !failed, busy: queued, busyLabel: "Preparing…", title: failed ? video.preparation?.error : undefined,
      disabled: queued || addingKey !== null || (!video.upload_id && !video.catalog_visual_id) || video.file_available === false,
      ariaLabel: `Add ${video.name} to timeline`,
      onClick: () => void queueVideoAdd(video),
    });
  }

  function renderAddButton(intentKey: string, onClick: () => void) {
    if (!onAddElement) return null;
    const isPlaced = placedKeys.has(intentKey);
    const isAdding = addingKey === intentKey;
    return (
      <button
        disabled={isAdding}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{
          flexShrink: 0,
          height: 34,
          padding: "0 12px",
          borderRadius: RADIUS_SM,
          border: `1px solid ${C.borderSubtle}`,
          background: isPlaced ? C.approvedBg : "var(--chrome-deep)",
          color: isPlaced ? C.approved : C.textSecondary,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          fontWeight: 500,
          cursor: isAdding ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          whiteSpace: "nowrap",
          transition: "all 0.15s",
          opacity: isAdding ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isPlaced) {
            e.currentTarget.style.background = C.accent;
            e.currentTarget.style.color = "var(--ink)";
            e.currentTarget.style.borderColor = C.accent;
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isPlaced ? C.approvedBg : "var(--chrome-deep)";
          e.currentTarget.style.color = isPlaced ? C.approved : C.textSecondary;
          e.currentTarget.style.borderColor = C.borderSubtle;
        }}
      >
        {isPlaced ? "\u2713" : <span style={{ fontWeight: 300 }}>+</span>}{" "}
        {isPlaced ? "Placed" : isAdding ? "Adding…" : "Add"}
      </button>
    );
  }

  function renderBeatHeader(beatId: string) {
    const order = (beatOrderMap.get(beatId) ?? 0) + 1;
    const label = beatLabelMap.get(beatId) ?? "";
    return (
      <div
        style={{
          fontSize: "var(--ui-text-small)",
          fontWeight: 600,
          color: C.textSecondary,
          padding: "8px 6px 4px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Beat {order} {label ? `\u2014 ${label}` : ""}
        <span style={{ flex: 1, height: 1, background: C.borderFaint }} />
      </div>
    );
  }

  function renderSectionHeader(label: string) {
    return (
      <div
        style={{
          fontSize: "var(--ui-text-small)",
          fontWeight: 600,
          color: C.textSecondary,
          padding: "8px 6px 4px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {label}
        <span style={{ flex: 1, height: 1, background: C.borderFaint }} />
      </div>
    );
  }

  function renderAssetCard(opts: {
    thumb: React.ReactNode;
    approved: boolean;
    name: string;
    typeBadge: React.ReactNode;
    duration: number | null;
    intentKey: string;
    onAdd: () => void;
    audioUrl?: string | null;
    extraAction?: React.ReactNode;
    /** Click-to-select for chat; the card's + button remains the manual add. */
    selected?: boolean;
    onSelect?: () => void;
    dragPayload?: ElementCreatePayload | null;
  }) {
    const isPlaying = opts.audioUrl != null && playingUrl === opts.audioUrl;
    const restingBackground = opts.selected ? "var(--chrome-selected-bg)" : "transparent";
    const restingBorder = opts.selected ? "var(--chrome-selected-ring)" : "transparent";
    const nameBlock = <>
          <div
            style={{
              fontSize: "var(--ui-text-small)",
              fontWeight: 500,
              color: "var(--ink)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {opts.selected && <CheckIcon size={13} strokeWidth={3} aria-hidden="true" style={{ flexShrink: 0 }} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{opts.name}</span>
          </div>
          <div
            style={{
              fontSize: "var(--ui-text-small)",
              color: C.textMuted,
              marginTop: 1,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {opts.typeBadge}
            {opts.duration != null && <span>{formatMediaDuration(opts.duration)}</span>}
          </div>
    </>;
    return (
      <div
        data-selected={opts.selected || undefined}
        draggable={!!opts.dragPayload}
        onDragStart={opts.dragPayload ? event => setShelfDragPayload(event, opts.dragPayload!, opts.name) : undefined}
        style={{
          display: "flex",
          flexWrap: "wrap",
          minWidth: 0,
          alignItems: "center",
          gap: 10,
          padding: "8px 8px",
          borderRadius: RADIUS_SM,
          border: `1px solid ${restingBorder}`,
          background: restingBackground,
          cursor: opts.dragPayload ? "grab" : "default",
          transition: "all 0.15s",
          marginBottom: 2,
          position: "relative",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = opts.selected ? restingBackground : C.bgHover;
          e.currentTarget.style.borderColor = opts.selected ? restingBorder : C.borderFaint;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = restingBackground;
          e.currentTarget.style.borderColor = restingBorder;
        }}
      >
        <div style={{ position: "relative", display: opts.audioUrl ? "none" : undefined }}>
          {opts.thumb}
        </div>
        {opts.onSelect
          ? <button type="button" aria-pressed={!!opts.selected} aria-label={`${opts.selected ? "Deselect" : "Select"} ${opts.name}`} onClick={opts.onSelect}
            className="rounded-sm text-left focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)]"
            style={{ flex: "1 1 100px", minWidth: 0, padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>{nameBlock}</button>
          : <div style={{ flex: "1 1 100px", minWidth: 0 }}>{nameBlock}</div>}
        {opts.audioUrl && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay(opts.audioUrl!);
            }}
            style={{
              flexShrink: 0,
              width: 34,
              height: 34,
              borderRadius: RADIUS_SM,
              border: `1px solid ${isPlaying ? C.accentBorder : C.borderSubtle}`,
              background: isPlaying ? C.accentGlow : "var(--chrome-deep)",
              color: isPlaying ? C.accent : C.textSecondary,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isPlaying) {
                e.currentTarget.style.background = "var(--chrome-raised)";
                e.currentTarget.style.color = "var(--ink)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isPlaying) {
                e.currentTarget.style.background = "var(--chrome-deep)";
                e.currentTarget.style.color = C.textSecondary;
              }
            }}
          >
            {isPlaying
              ? <PauseIcon size={14} strokeWidth={2} />
              : <PlayIcon size={14} strokeWidth={2} />}
          </button>
        )}
        {opts.extraAction}
        {renderAddButton(opts.intentKey, opts.onAdd)}
      </div>
    );
  }

  // ── Tab content renderers ──────────────────────────────────────────────

  function renderImageTile(asset: VisualAsset) {
    const key = getVisualIntentKey(asset);
    const adding = addingKey === key;
    const placed = placedKeys.has(key);
    const unavailable = !asset.source_url || asset.file_available === false;
    const source = libraryIdentity(asset);
    const selected = librarySelection.sources.includes(source);
    const held = isInMedia(source, asset.upload_id);
    const size = asset as VisualAsset & { width?: number | null; height?: number | null };
    const content = <>
      <span className={imageStyles.picture}>
        {asset.source_url ? <MarkableMedia source={source}><img data-media-preview src={thumbnailUrl(asset.source_url, 640)} alt="" decoding="async" width={size.width ?? undefined} height={size.height ?? undefined} /></MarkableMedia> : <ImageIcon size={28} aria-hidden="true" />}
        {(adding || placed || unavailable) && <span className={imageStyles.status} aria-label={adding ? "Adding" : unavailable ? "File unavailable" : "On timeline"}>
          {adding ? "…" : unavailable ? "!" : "✓"}
        </span>}
        {selected && !pickingGenerationRole && <span className={imageStyles.selectionLabel}>✓ Selected</span>}
      </span>
      <TileName name={asset.name} />
    </>;
    const action = pickingGenerationRole
      ? renderCardAction({ label: "Use", busy: adding, busyLabel: "Choosing…", disabled: addingKey !== null || unavailable, ariaLabel: `Use ${asset.name} as generation reference`, onClick: () => void handleAddVisual(asset).catch(error => toast.error(error.message)) })
      : held ? renderInMedia(asset.name)
      : onAddElement || mediaPicker ? renderCardAction({ label: mediaPicker ? pickerAddLabel : "Add", plus: true, busy: adding, disabled: addingKey !== null || unavailable,
        ariaLabel: `Add ${asset.name} to ${mediaPicker ? "Media" : "timeline"}`, onClick: () => void handleAddVisual(asset).catch(error => toast.error(error.message)) })
      : null;
    return <article key={key} className={imageStyles.tile} data-selected={selected} aria-label={asset.name}>
      <button type="button" className={imageStyles.selectImage} aria-pressed={selected}
        draggable={!!onAddElement && !pickingGenerationRole && !unavailable}
        onDragStart={event => setShelfDragPayload(event, buildVisualElementPayload(asset, beats), asset.name)}
        disabled={unavailable || !source || librarySelection.busy || addingKey !== null}
        aria-label={pickingGenerationRole ? `Use ${asset.name} as generation reference` : `${selected ? "Deselect" : "Select"} ${asset.name}`}
        onClick={() => void (pickingGenerationRole ? handleAddVisual(asset) : librarySelection.toggle(source)).catch(error => toast.error(error.message))}>
        {content}
      </button>
      {action ? <div className={imageStyles.imageActions}>{action}</div> : null}
    </article>;
  }

  function renderStills() {
    if (filteredStills.length === 0) return renderEmptyVisual("stills");
    return <>
      {pickingGenerationRole && <div className={imageStyles.instructions}><span>{`Pick ${pickingGenerationRole === "start" ? "start frame" : pickingGenerationRole === "end" ? "end frame" : "reference"}`}</span></div>}
      {librarySelection.error ? <p role="alert">{librarySelection.error}</p> : null}
      {uploadedStills.length > 0 && <MediaGallery className={imageStyles.grid} targetHeight={160} {...gallerySizing}>{uploadedStills.map(renderImageTile)}</MediaGallery>}
      {sortedBeatIds.filter(bid => visualsByBeat.has(bid)).map(bid => <section key={bid}>
        {renderBeatHeader(bid)}
        <MediaGallery className={imageStyles.grid} targetHeight={160} {...gallerySizing}>{visualsByBeat.get(bid)!.map(renderImageTile)}</MediaGallery>
      </section>)}
    </>;
  }

  function renderBookAssets() {
    if (filteredBookVisuals.length === 0 && filteredBookAudio.length === 0) {
      return renderEmpty("No book assets found");
    }
    return (
      <>
        <div>
          {renderSectionHeader("Visuals")}
          {filteredBookVisuals.length === 0 ? (
            <div style={{ padding: "0 6px 10px", color: C.textDim, fontSize: "var(--ui-text-small)" }}>
              No book visuals yet
            </div>
          ) : (
            filteredBookVisuals.map((asset) => (
              <div key={`book:visual:${asset.asset_id}`}>
                {renderAssetCard({
                  thumb: renderThumbVisual(asset),
                  approved: true,
                  name: asset.name,
                  typeBadge: (
                    <>
                      {renderTypeBadge(asset.type === "video_clip" ? "Video" : "Still", C.visual)}
                      {asset.is_cover ? renderTypeBadge("Cover", C.textLight) : renderTypeBadge("Book", C.textLight)}
                    </>
                  ),
                  duration: asset.duration_seconds,
                  intentKey: `book_visual:${asset.asset_id}`,
                  onAdd: () => handleAddBookVisual(asset),

                })}
              </div>
            ))
          )}
        </div>
        <div>
          {renderSectionHeader("Audio")}
          {filteredBookAudio.length === 0 ? (
            <div style={{ padding: "0 6px 10px", color: C.textDim, fontSize: "var(--ui-text-small)" }}>
              No book audio assets yet
            </div>
          ) : (
            filteredBookAudio.map((asset) => (
              <div key={`book:audio:${asset.asset_id}`}>
                {renderAssetCard({
                  thumb: renderThumbVoice(),
                  approved: true,
                  name: asset.name,
                  typeBadge: renderTypeBadge("Audio", C.voice),
                  duration: asset.duration_seconds,
                  intentKey: `book_audio:${asset.asset_id}`,
                  onAdd: () => undefined,
                  audioUrl: asset.source_url,
                })}
              </div>
            ))
          )}
        </div>
      </>
    );
  }

  function renderVideoTile(asset: VisualAsset) {
    const key = getVisualIntentKey(asset);
    const adding = addingKey === key;
    const placed = placedKeys.has(key);
    const browseSource = asset.preparation?.state === "ready" && asset.preparation.render
      ? `/api/projects/${encodeURIComponent(projectId)}/media/${asset.preparation.render.split("/").map(encodeURIComponent).join("/")}`
      : asset.source_url;
    const unavailable = !asset.source_url || asset.file_available === false;
    const canDrag = !!onAddElement && !pickingGenerationRole && !unavailable && asset.preparation?.state === "ready";
    const identity = libraryIdentity(asset);
    const shape = asset as VisualAsset & { width?: number | null; height?: number | null };
    const choose = (fallback: string) => void handleAddVisual(asset).catch(error => toast.error(error instanceof Error ? error.message : fallback));
    const action = pickingGenerationRole || (referencePicker && !mediaPicker)
      ? renderCardAction({ label: "Use", busy: adding, busyLabel: "Preparing…", disabled: addingKey !== null || unavailable, ariaLabel: pickingGenerationRole ? `Use ${asset.name} as generation reference` : `Use ${asset.name} as reference`, onClick: () => choose("Could not use reference") })
      : mediaPicker ? (isInMedia(identity, asset.upload_id) ? renderInMedia(asset.name)
        : renderCardAction({ label: pickerAddLabel, plus: true, busy: adding, disabled: addingKey !== null || unavailable, ariaLabel: `Add ${asset.name} to Media`, onClick: () => choose("Could not add media") }))
      : !onAddElement ? null
      : asset.preparation?.state !== "ready" ? renderPreparingAddAction(asset)
      : renderCardAction({ label: "Add", plus: true, busy: adding, disabled: addingKey !== null || unavailable, ariaLabel: `Add ${asset.name} to timeline`, onClick: () => choose("Could not add video") });
    return <div key={key} className={imageStyles.tile} draggable={canDrag}
      onDragStart={event => {
        if (!canDrag || (event.target as HTMLElement).closest("button,video")) { event.preventDefault(); return; }
        setShelfDragPayload(event, buildVisualElementPayload(asset, beats), asset.name);
      }}>
      <div className={imageStyles.videoPicture}>
        {asset.source_url && !unavailable
          ? <MarkableMedia source={identity}><BrowseVideoPreview source={browseSource!} name={asset.name}
            {...(asset.downloaded === false ? { aspect: shape.width && shape.height ? shape.width / shape.height : 16 / 9 } : { poster: thumbnailUrl(asset.source_url, 640) })} /></MarkableMedia>
          : <PlayIcon size={28} aria-hidden="true" />}
        {(placed || unavailable) && <span className={imageStyles.status} aria-label={unavailable ? "File unavailable" : "On timeline"}>{unavailable ? "!" : "✓"}</span>}
      </div>
      {action ? <div className={imageStyles.imageActions}>{action}</div> : null}
      <TileName name={asset.name} />
      <div className={imageStyles.meta}>
        <span>{asset.duration_seconds != null ? formatMediaDuration(asset.duration_seconds) : "Video"}{asset.has_alpha_channel ? " · Transparent background" : ""}</span>
      </div>
    </div>;
  }

  function renderVideos() {
    return <>
      {filteredVideos.length === 0 ? renderEmptyVisual("videos") : pickingGenerationRole ? <div className={imageStyles.instructions}>Pick a video</div> : null}
      {uploadedVideos.length > 0 && <MediaGallery className={imageStyles.grid} targetHeight={200} minCardWidth={180} {...gallerySizing}>{uploadedVideos.map(renderVideoTile)}</MediaGallery>}
      {sortedBeatIds.filter(bid => videosByBeat.has(bid)).map(bid => <section key={bid}>
        {renderBeatHeader(bid)}
        <MediaGallery className={imageStyles.grid} targetHeight={200} minCardWidth={180} {...gallerySizing}>{videosByBeat.get(bid)!.map(renderVideoTile)}</MediaGallery>
      </section>)}
    </>;
  }

  function renderVoiceClips() {
    if (filteredVoice.length === 0) return renderEmpty("No voice clips found");
    return sortedBeatIds
      .filter((bid) => voiceByBeat.has(bid))
      .map((bid) => (
        <div key={bid}>
          {renderBeatHeader(bid)}
          {voiceByBeat.get(bid)!.map((v, index) => (
            <div key={`${bid}:voice:${v.clip_id ?? index}`}>
              {renderAssetCard({
              thumb: renderThumbVoice(),
              approved: v.is_selected,
              name: v.clip_name,
              typeBadge: renderTypeBadge("Voice", C.voice),
              duration: v.duration_seconds,
              intentKey: `voice:${v.clip_id}`,
              onAdd: () => handleAddVoice(v),
              audioUrl: v.source_url,

              })}
            </div>
          ))}
        </div>
      ));
  }

  function musicChatSelection(track: MusicTrack) {
    const details = [track.artist ? `by ${track.artist}` : null, track.catalog_track_id ? `catalog id ${track.catalog_track_id}` : `track id ${track.track_id}`,
      track.moods?.length ? `moods ${track.moods.join(", ")}` : null, track.energy ? `energy ${track.energy}` : null, track.tempo_bpm ? `${track.tempo_bpm} BPM` : null].filter(Boolean).join("; ");
    return { id: `music:${track.track_id}`, kind: "Music", label: track.track_name, agentText: `Music track "${track.track_name}" (${details}).` };
  }

  function toggleMusicSelection(track: MusicTrack) {
    const selection = musicChatSelection(track);
    const selecting = !musicSelection.selectedIds.has(selection.id);
    musicSelection.toggle(selection);
    setExpandedAudioId(current => selecting ? track.track_id : current === track.track_id ? null : current);
  }

  function sfxChatSelection(track: SfxTrack) {
    const details = [track.catalog_sfx_id ? `catalog id ${track.catalog_sfx_id}` : `track id ${track.track_id}`, track.category, track.editorial?.motion?.replace("_", " to "), track.editorial?.intensity,
      track.duration_seconds != null ? `${track.duration_seconds.toFixed(2)}s` : null].filter(Boolean).join("; ");
    return { id: `sfx:${track.track_id}`, kind: "Sound", label: track.track_name, agentText: `Sound effect "${track.track_name}" (${details}).` };
  }

  /** One music or sound row: play, name and what it is, length, Add and, when it has any, details. */
  function renderAudioRow(row: {
    id: string; name: string; meta: string; notice?: React.ReactNode; duration: number | null | undefined; url: string | null | undefined;
    selected: boolean; onSelect: () => void; canPlace: boolean; addKey: string; onAdd: () => void; addTitle?: string;
    dragPayload: ElementCreatePayload | null; detailsLabel?: string; inlineDetails?: React.ReactNode;
  }) {
    const expanded = expandedAudioId === row.id;
    const hasDetails = !!row.detailsLabel;
    return (
      <article key={row.id} data-audio-row="" data-selected={row.selected} className="text-[var(--ink)]"
        draggable={!!row.dragPayload}
        onDragStart={row.dragPayload ? event => setShelfDragPayload(event, row.dragPayload!, row.name) : undefined}>
        <div className="flex min-h-12 min-w-0 items-center gap-3 px-2 py-1.5"
          style={{ background: row.selected ? "var(--chrome-selected-bg)" : expanded ? "var(--chrome-raised)" : "transparent", boxShadow: "inset 0 -1px var(--chrome-line)", fontFamily: "Inter, sans-serif" }}>
          <Button type="button" variant="ghost" size="icon" className="size-[18px] shrink-0 rounded-none p-0 hover:bg-transparent"
            disabled={!row.url}
            aria-label={`${playingUrl === row.url ? "Pause" : "Preview"} ${row.name}`}
            onClick={() => row.url && togglePlay(row.url)}>
            {row.url && playingUrl === row.url ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          </Button>
          <button type="button" className="min-w-0 flex-1 text-left" aria-pressed={row.selected}
            aria-label={`${row.selected ? "Deselect" : "Select"} ${row.name}`} onClick={row.onSelect}>
            <div className="flex min-w-0 items-start gap-1 text-[length:var(--ui-text-small)] font-normal" title={row.name}>{row.selected && <CheckIcon size={13} strokeWidth={3} aria-hidden="true" className="mt-[3px] shrink-0" />}<span className="line-clamp-2 [overflow-wrap:anywhere]">{row.name}</span></div>
            {row.meta ? <div className="mt-[3px] truncate text-[length:var(--ui-text-small)] text-[var(--ink-secondary)]">{row.meta}</div> : null}
            {row.notice}
          </button>
          <span className="shrink-0 text-[length:var(--ui-text-small)] tabular-nums text-[var(--ink-secondary)]">{row.duration != null ? formatMediaDuration(row.duration) : ""}</span>
          {mediaPicker && row.url ? (isInMedia(row.url, row.id.startsWith("local:") ? row.id.slice(6) : null) ? renderInMedia(row.name) : renderCardAction({
            label: pickerAddLabel, plus: true, busy: addingKey === row.addKey, disabled: !row.canPlace || addingKey !== null, ariaLabel: `Add ${row.name} to Media`,
            onClick: () => {
              setAddingKey(row.addKey);
              void librarySelection.prepareAudio(row.url!).then(async media => { await mediaPicker.onChoose(media.source); rememberAdded(row.url!, media.source); void fetchAssets({ silent: true }); })
                .catch(error => toast.error(error instanceof Error ? error.message : "Could not add audio")).finally(() => setAddingKey(null));
            },
          })) : onAddElement && renderCardAction({ label: "Add", plus: true, busy: addingKey === row.addKey, disabled: !row.canPlace || addingKey != null,
            ariaLabel: `Add ${row.name} to timeline`, title: row.addTitle ?? (row.canPlace ? "Add at playhead" : "No local audio"), onClick: row.onAdd })}
          {hasDetails ? <button type="button" className="grid size-[18px] shrink-0 place-items-center text-[var(--ink-muted)]"
            aria-label={`Details for ${row.name}`} title={row.detailsLabel}
            aria-expanded={expanded} aria-controls={`audio-details-${row.id}`}
            onClick={() => setExpandedAudioId(current => current === row.id ? null : row.id)}>
            <ChevronDownIcon size={16} style={{ transform: expanded ? "rotate(180deg)" : undefined }} />
          </button> : <span className="size-[18px] shrink-0" aria-hidden="true" />}
        </div>
        {expanded && row.inlineDetails ? <div id={`audio-details-${row.id}`} className="bg-[var(--chrome-deep)] px-4 py-3 text-[length:var(--ui-text-small)] leading-5 text-[var(--ink-secondary)]">{row.inlineDetails}</div> : null}
      </article>
    );
  }

  /** A word every listed item shares (every track "dynamic") tells the creator nothing; leave it out of each row. */
  function sharedValue(values: (string | null | undefined)[]) {
    return values.length > 1 && values.every(value => value && value === values[0]) ? values[0] : null;
  }

  function renderMusicTracks(detailsOnly = false) {
    if (filteredMusic.length === 0) return renderEmptyVisual("music");
    const sharedMusicEnergy = sharedValue(filteredMusic.map(track => track.energy));
    return filteredMusic.map((track) => {
      if (detailsOnly && (expandedAudioId !== track.track_id || !track.catalog_track_id)) return null;
      if (!track.catalog_track_id) {
        return renderAudioRow({
          id: track.track_id, name: track.track_name, meta: "", duration: track.duration_seconds, url: track.source_url,
          selected: musicSelection.selectedIds.has(`music:${track.track_id}`), onSelect: () => musicSelection.toggle(musicChatSelection(track)),
          canPlace: !!track.source_url, addKey: `music:${track.track_id}`, onAdd: () => void handleAddMusic(track),
          dragPayload: onAddElement && track.source_url ? buildMusicElementPayload(track, beats, musicSelections[track.track_id]) : null,
        });
      }

      const selection = musicSelections[track.track_id] ?? { versionId: track.recommended_version_id ?? undefined };
      const version = resolveTrackVersion(track, selection);
      const cue = resolveTrackCue(version, selection);
      const canPlace = Boolean(version?.source_url && version.delivery_mode === "embedded");
      const platformLabel = track.delivery_platform
        ? `${track.delivery_platform[0].toUpperCase()}${track.delivery_platform.slice(1)}`
        : track.delivery_target ?? "current target";

      const selected = musicSelection.selectedIds.has(`music:${track.track_id}`);
      if (!detailsOnly) return renderAudioRow({
        id: track.track_id, name: track.track_name, meta: [track.artist, track.energy && track.energy !== sharedMusicEnergy ? energyLabel(track.energy) : null].filter(Boolean).join(" · "),
        // Licence status is never truncated away.
        notice: version?.source_status === "reference_only" ? <div className="mt-[2px] text-[length:var(--ui-text-small)] font-medium text-[var(--ink)]">Reference only · rights unverified</div> : null,
        duration: track.duration_seconds, url: version?.source_url, selected, onSelect: () => toggleMusicSelection(track),
        canPlace, addKey: `music:${track.track_id}`, onAdd: () => void handleAddMusic(track),
        dragPayload: canPlace && onAddElement ? buildMusicElementPayload(track, beats, musicSelections[track.track_id]) : null,
        detailsLabel: "Versions, cues and usage",
      });
      return (
        <article key={track.track_id} data-audio-row="" className="text-[var(--ink)]">
          {<div id={`audio-details-${track.track_id}`} className="media-track-details flex h-[186px] flex-col gap-3 bg-[var(--chrome-deep)] px-4 py-4 font-[Inter] text-xs text-[var(--ink-muted)]">
          <div className="truncate text-sm font-normal text-[var(--ink)]">{track.track_name}</div>
          <div className="truncate">{[version?.label, track.tempo_bpm ? `${track.tempo_bpm} BPM` : null, track.energy].filter(Boolean).join(" · ")}</div>
          <div className="contents">
            <label className="grid h-[30px] grid-cols-[72px_minmax(0,1fr)] items-center gap-2 text-xs text-[var(--ink)]">
              Version
              <Select
                value={version?.id ?? null}
                onValueChange={(value) => {
                  if (!value) return;
                  setMusicSelections((current) => ({
                    ...current,
                    [track.track_id]: { versionId: value },
                  }));
                }}
              >
                <SelectTrigger size="sm" className="ml-auto h-7 w-auto min-w-[180px] justify-end border-transparent bg-transparent text-xs text-[var(--ink)] shadow-none [&_[data-slot=select-value]]:justify-end [&_[data-slot=select-value]]:text-right">
                  <SelectValue placeholder="Choose a version" />
                </SelectTrigger>
                <SelectContent>
                  {(track.versions ?? []).map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.label}{candidate.platforms.length ? ` · ${candidate.platforms.join(", ")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {version?.cues.length ? (
              <label className="grid h-[30px] grid-cols-[72px_minmax(0,1fr)] items-center gap-2 text-xs text-[var(--ink)]">
                Cue
                <Select
                  value={cue?.id ?? null}
                  onValueChange={(value) => {
                    if (!value || !version) return;
                    setMusicSelections((current) => ({
                      ...current,
                      [track.track_id]: { versionId: version.id, cueId: value },
                    }));
                  }}
                >
                  <SelectTrigger size="sm" className="ml-auto h-7 w-auto min-w-[180px] justify-end border-transparent bg-transparent text-xs text-[var(--ink)] shadow-none [&_[data-slot=select-value]]:justify-end [&_[data-slot=select-value]]:text-right">
                    <SelectValue placeholder="Choose a cue" />
                  </SelectTrigger>
                  <SelectContent>
                    {version.cues.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.label} · {formatClock(candidate.start_seconds)}–{formatClock(candidate.end_seconds)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
          </div>
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-1 py-0"><span aria-hidden="true">›</span> Usage & technical details</summary>
            {track.description ? <p className="mt-2 leading-5 text-[var(--ink)]">{track.description}</p> : null}
            {track.good_for?.length ? <p className="mt-1 leading-5">Good for: {track.good_for.slice(0, 2).join("; ")}</p> : null}
            {track.avoid_for?.length ? <p className="mt-1 leading-5">Avoid for: {track.avoid_for.slice(0, 2).join("; ")}</p> : null}
            {cue?.use_when.length ? <p className="mt-1 leading-5">Use this part when: {cue.use_when.join("; ")}</p> : null}
            {version ? <p className="mt-1 leading-5">{version.delivery_mode === "platform_native"
              ? `Add this sound inside ${platformLabel}.`
              : `${version.source_status.replace("_", " ")} source · audio ${version.file_available ? "available" : "not added yet"}`}</p> : null}
          </details>

          <div className="hidden">
            {version?.source_url ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-[var(--edge-outline)] bg-[var(--chrome-deep)] text-sm text-[var(--ink)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]"
                onClick={() => togglePlay(version.source_url!)}
              >
                {playingUrl === version.source_url ? <PauseIcon /> : <PlayIcon />}
                {playingUrl === version.source_url ? "Pause" : "Preview"}
              </Button>
            ) : null}
            <Button type="button" size="sm" className="h-8 text-sm" disabled={!canPlace} onClick={() => void handleAddMusic(track)}>
              {canPlace
                ? "Add at playhead"
                : version?.delivery_mode === "platform_native"
                  ? "Add during posting"
                  : "Add local audio first"}
            </Button>
            {hasSelectedMusic && onReplaceMusic ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 text-sm"
                disabled={!canPlace}
                onClick={() => void handleReplaceMusic(track)}
              >
                Replace selected music
              </Button>
            ) : null}
          </div>
          </div>}
        </article>
      );
    });
  }

  function renderSfx() {
    if (filteredSfx.length === 0) return renderEmptyVisual("sfx");
    const describe = (t: SfxTrack) => [t.category, t.editorial?.motion].filter((value): value is string => Boolean(value)).map(value => filterValueLabel(value));
    const sharedCategory = sharedValue(filteredSfx.map(t => t.category));
    return filteredSfx.map((t) => {
      const locked = t.access === "members" && membersLocked;
      const canPlace = !locked && t.file_available !== false && !!t.source_url;
      const hasDetails = !!t.catalog_sfx_id && !!(t.good_for?.length || t.analysis?.integrated_lufs != null);
      return renderAudioRow({
        id: t.track_id, name: t.track_name,
        meta: describe(t).filter(label => !sharedCategory || label !== filterValueLabel(sharedCategory)).join(" · "),
        notice: t.access === "members" ? <div className="mt-[2px] flex items-center gap-1 text-[length:var(--ui-text-small)] font-medium text-[var(--ink)]"><CrownIcon size={12} aria-hidden="true" className="text-[var(--premium)]" />Members</div> : undefined,
        addTitle: locked ? "For DreamCut members" : undefined,
        duration: t.duration_seconds, url: locked ? null : t.source_url,
        selected: soundSelection.selectedIds.has(`sfx:${t.track_id}`), onSelect: () => soundSelection.toggle(sfxChatSelection(t)),
        canPlace, addKey: `sfx:${t.track_id}`, onAdd: () => void handleAddSfx(t),
        dragPayload: onAddElement && canPlace ? buildSfxElementPayload(t) : null,
        detailsLabel: hasDetails ? "Usage and loudness" : undefined,
        inlineDetails: hasDetails ? <>
          {t.good_for?.length ? <div>Good for: {t.good_for.slice(0, 2).join("; ")}</div> : null}
          {t.analysis?.integrated_lufs != null ? (
            <div>{t.analysis.integrated_lufs.toFixed(1)} LUFS · peak {t.analysis.true_peak_dbtp?.toFixed(1) ?? "?"} dBTP · {t.analysis.peak_position ?? "unknown"}-weighted</div>
          ) : null}
        </> : undefined,
      });
    });
  }

  function renderCaptions() {
    if (filteredCaptions.length === 0) return renderEmpty("No saved captions");
    return sortedBeatIds
      .filter((bid) => captionsByBeat.has(bid))
      .map((bid) => (
        <div key={bid}>
          {renderBeatHeader(bid)}
          {captionsByBeat.get(bid)!.map((c, index) => (
            <div key={`${bid}:caption:${c.caption_id ?? index}`}>
              {renderAssetCard({
              thumb: renderThumbCaption(c.text),
              approved: true, // captions always shown
              name: c.text.length > 40 ? c.text.slice(0, 40) + "\u2026" : c.text,
              typeBadge: renderTypeBadge("Caption", C.caption),
              duration: c.duration_seconds,
              intentKey: `caption:${c.caption_id}`,
              onAdd: () => handleAddCaption(c),

              })}
            </div>
          ))}
        </div>
      ));
  }

  function renderEmpty(msg: string) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          color: C.textSecondary,
          fontSize: 14,
        }}
      >
        {msg}
      </div>
    );
  }

  /** An empty kind says why and offers the next step for the source being shown. */
  function renderEmptyVisual(kind: UploadableTabKey) {
    const noun = LIBRARY_KINDS.find(entry => entry.key === kind)!.noun;
    if (searchQuery.trim()) return renderEmpty(`No ${noun} match “${searchQuery.trim()}”.`);
    if (librarySource === "personal" && !pickingGenerationRole && !showAllAudio) return renderEmpty(`No ${noun} in My library yet.`);
    if (pickingGenerationRole || librarySource === "catalog" || showAllAudio || Object.values(activeAudioFilters).some(value => value && value !== "project")) return renderEmpty(`No ${noun} found.`);
    return <div className="flex flex-col items-center gap-3 px-5 py-10 text-center text-[14px] text-[var(--ink-secondary)]">
      <span>No {noun} in this project yet.</span>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={uploadingTab != null}><UploadIcon size={14} />Import {noun}</Button>
        <Button variant="ghost" size="sm" onClick={() => chooseBucket("catalog")}>Browse catalog</Button>
      </div>
    </div>;
  }

  const tabContent: Record<TabKey, () => React.ReactNode> = {
    exports: () => <LibraryExports active={(open || !!alwaysOpen) && browseVisible} search={searchQuery} />,
    layout: () => {
      if (openedLayoutProposalId) {
        return (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[var(--chrome-line)] px-2 py-1">
              <Button
                variant="ghost"
                size="default"
                onClick={() => setOpenedLayoutProposalId(null)}
              >
                ← Layouts
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              {renderLayoutProposal?.(openedLayoutProposalId) ?? layoutNode}
            </div>
          </div>
        );
      }
      if (layoutProposals.length === 0) return renderEmpty("No saved layouts for this project");
      return (
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink)]">Saved layouts</h3>
          </div>
          {layoutProposals.map((proposal) => (
            <Button
              key={proposal.layout_id}
              variant="outline"
              size="studio"
              className="h-auto w-full justify-start px-3 py-3 text-left"
              onClick={() => setOpenedLayoutProposalId(proposal.layout_id)}
            >
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span className="max-w-full truncate font-bold">{proposal.title}</span>
                <span className="text-[var(--ink-secondary)]">
                  {proposal.unique_cover_count < proposal.cover_count
                    ? `${proposal.cover_count} placements · ${proposal.unique_cover_count} covers`
                    : `${proposal.cover_count} covers`} · revision {proposal.revision}
                </span>
              </span>
            </Button>
          ))}
        </div>
      );
    },
    book: renderBookAssets,
    stills: renderStills,
    videos: renderVideos,
    voice: renderVoiceClips,
    music: renderMusicTracks,
    sfx: renderSfx,
    captions: () => <>
      {captionGeneration}
      {captionTranscript && captionView === "transcript" ? captionTranscript : <>
        <CaptionLookGallery target={captionLookTarget ?? textTarget} onApplyLaneStyle={onApplyCaptionLaneStyle} onAddElement={onAddElement} />
        {filteredCaptions.length > 0 && <><div className="mb-2 mt-2"><InspectorItemHeader title="Saved captions" /></div>{renderCaptions()}</>}
      </>}
    </>,
  };
  const activeSection = sectionForTab(activeTab);
  const generationVisible = standaloneGeneration || visualPane === "generate" || visualPane === "results";
  const browseVisible = standaloneGeneration || visualPane === "browse";
  const libraryKind = LIBRARY_KINDS.find(kind => kind.key === (activeTab === "voice" ? "music" : activeTab));
  const visibleSections = SHELF_SECTIONS.filter((section) => (
    section.key === "stills" || section.key === "videos" || section.key === "exports" || (section.key === "audio" && !editorRail)
  ));
  const detailTabs = browseVisible && activeSection === "audio" && !editorRail
      ? AUDIO_TABS
      : [];
  const ownRailTab = editorRail && (activeTab === "captions" || (!audioInLibrary && (activeTab === "music" || activeTab === "sfx")));

  const selectWorkflowPane = (pane: MediaWorkspacePane, reveal = true) => {
    if (reveal) onReveal?.();
    setVisualPane(pane === "recipes" ? "catalog" : pane === "text" ? "text" : pane === "generate" ? "generate" : "browse");
    if (pane === "captions") selectTab("captions");
    else if (pane === "music") selectTab("music");
    else if (pane === "sounds") selectTab("sfx");
    else if (pane === "browse" && (activeTab === "captions" || (editorRail && !audioInLibrary && (activeTab === "music" || activeTab === "sfx" || activeTab === "voice")))) selectTab("stills");
    if (pane === "recipes") setCatalogMounted(true);
    if (pane === "generate") setGenerationMounted(true);
    setPickingGenerationRole(undefined);
  };
  const activeWorkflowPane: MediaWorkspacePane = generationVisible ? "generate" : visualPane === "catalog" ? "recipes" : visualPane === "text" ? "text"
    : activeTab === "captions" ? "captions" : editorRail && !audioInLibrary && activeTab === "music" ? "music" : editorRail && !audioInLibrary && activeTab === "sfx" ? "sounds" : "browse";
  // A shelf offering only some panes starts on its first one (Wide's tool panel has no Library), without opening itself.
  useEffect(() => {
    if (workflowPanes?.length && !workflowPanes.includes(activeWorkflowPane)) selectWorkflowPane(workflowPanes[0]!, false);
  }, [workflowPanes]); // eslint-disable-line react-hooks/exhaustive-deps
  const workflowTabs = <MediaWorkspaceTabs active={activeWorkflowPane} onSelect={selectWorkflowPane} browseLabel={editorRail ? "Library" : "Browse"} properties={propertiesTab} panes={workflowPanes} />;
  // A parent tab strip (Properties · Text · Captions) selects the pane.
  useEffect(() => { if (controlledPane && controlledPane !== activeWorkflowPane) selectWorkflowPane(controlledPane); }, [controlledPane]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownDockRequest = useRef(dockRequest?.n ?? 0);
  useEffect(() => {
    if (!dockRequest || dockRequest.n === shownDockRequest.current) return;
    shownDockRequest.current = dockRequest.n;
    if (dockRequest.pane !== "layouts") selectWorkflowPane(dockRequest.pane, false);
  }, [dockRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const workspaceHeader = (
<div className={propertiesTab ? "editor-rail-header" : undefined}
        style={{
          height: propertiesTab ? "100%" : 56,
          padding: propertiesTab ? "8px 4px" : "0 14px",
          borderBottom: propertiesTab ? undefined : "1px solid var(--chrome-line)",
          flexShrink: 0,
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            height: "100%",
            alignItems: "center",
            gap: propertiesTab ? 8 : 12,
            flexDirection: propertiesTab ? "column" : "row",
          }}
        >
          {/* The close control sits on the drawer's inner edge: first in a right-hand drawer, last in a left-hand one. */}
          {!hideClose && drawerSide === "right" && <DrawerCloseButton label="Close Library drawer" onClick={onClose} />}
          <div className={propertiesTab ? "editor-rail-tabs" : "flex min-w-0 flex-1"}>{workflowTabs}</div>

          {!propertiesTab && !editorRail && (<button
            type="button"
            aria-label={uploadingTab != null ? "Importing media" : "Import media"}
            title={uploadingTab != null ? "Importing media…" : "Import media"}
            onClick={() => { onReveal?.(); handleUploadClick(); }}
            disabled={uploadingTab != null}
            style={{ width: 36, height: 36, padding: 0, border: 0, borderRadius: RADIUS_SM, background: "transparent", display: "grid", placeItems: "center", flexShrink: 0, color: C.textSecondary, cursor: uploadingTab != null ? "wait" : "pointer" }}
          >
            <UploadIcon size={18} />
          </button>)}
          {!hideClose && drawerSide === "left" && <DrawerCloseButton label="Close Library drawer" onClick={onClose} />}
        </div>


      </div>
  );

  const generationPanel = (generationMounted && <div id="media-visual-panel-generate" role={standaloneGeneration ? "region" : "tabpanel"} aria-label={standaloneGeneration ? "Generation workspace" : undefined} aria-labelledby={standaloneGeneration ? undefined : "media-visual-generate"} className="min-h-0 min-w-0 flex-1 flex-col" style={{ display: generationVisible ? "flex" : "none", order: 4 }}>
        <AssetGenerationDrawer inline inlinePane={visualPane === "results" ? "history" : "create"} onInlinePaneChange={onGenerationPaneChange} projectId={projectId} open={open && generationVisible}
          onClose={() => { setVisualPane("browse"); setPickingGenerationRole(undefined); }}
          onLibraryChanged={() => { void fetchAssets({ silent: true }); onLibraryChanged?.(); }} launch={generationLaunch}
          onPickLibrary={(role, label) => { setPickingGenerationRole(role); setPickingGenerationLabel(label); setVisualPane("browse"); setSearchQuery(""); selectTab(role === "motion" || role === "source" ? "videos" : "stills"); }} />
      </div>);

  // ── Main render ────────────────────────────────────────────────────────

  const shelf = (
    <div ref={shelfRef} data-asset-shelf-root="" style={shelfShellStyle}
      onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = importBusy.current ? "none" : "copy"; setFileDrag(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileDrag(false); }}
      onDrop={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); setFileDrag(false); void importFiles(Array.from(event.dataTransfer.files)); } }}>

          <input
            ref={fileInputRef}
            type="file"
            accept={APPROVED_UPLOAD_ACCEPT}
            multiple
            onChange={handleUploadChange}
            style={{ display: "none" }}
          />
      <div style={shelfStyle}>
      {standaloneGeneration && <h2 className="shrink-0 border-b border-[var(--chrome-line)] px-4 py-3 text-sm font-semibold">Library</h2>}
      {/* The shared drawer owns resizing when this shelf is inside it. */}
      {!alwaysOpen && !drawerMode && (
        <div
          style={resizeHandleStyle}
          onPointerDown={handleResizePointerDown}
        />
      )}

      {!alwaysOpen && !standaloneGeneration && !mediaPicker && (headerTarget ? createPortal(workspaceHeader, headerTarget) : headerTarget === null ? null : workspaceHeader)}

      {/* The rail and drawer tabs already name the pane (Library, Music, Sounds); a heading here only repeated it. */}
      {!mediaPicker && editorRail && generateAsDrawer && !standaloneGeneration && !controlledPane && browseVisible && activeTab !== "captions" && (
        <div className="shelf-panel-title" style={{ order: 1 }}>
          <span className="flex-1" />
          {<div className="shelf-panel-actions">
            {generateAsDrawer && <Button variant="outline" size="sm" className="h-7" aria-pressed={generateDrawerOpen} onClick={() => { setPickingGenerationRole(undefined); setGenerateDrawerOpen(true); if (!propertiesTab) onClose(); /* Wide rail: Library stays beside Generate. */ }}>
              <SparklesIcon size={14} />Generate
            </Button>}
          </div>}
        </div>
      )}
      {browseVisible && activeTab === "captions" && (captionTranscript || panelActions?.captions) && <div className="shrink-0" style={{ order: 1 }}>
        {(() => {
          const tabs = captionTranscript ? <SegmentedControl size="sm" fill aria-label="Caption view">
            <button type="button" aria-pressed={captionView === "transcript"} onClick={() => setCaptionView("transcript")}>Transcript</button>
            <button type="button" aria-pressed={captionView === "looks"} onClick={() => setCaptionView("looks")}>Looks</button>
          </SegmentedControl> : null;
          // Expand keeps the panel header's corner, as on every panel; Transcript / Looks are the row below it.
          return <>{panelActions?.captions && <ToolPanelHeader pane="captions" action={panelActions.captions} />}{tabs && <div className="tool-panel-header">{tabs}</div>}</>;
        })()}
      </div>}
      {/* Workflow first; the row below contains controls for that workflow. */}
      {alwaysOpen && !standaloneGeneration && <div className="flex shrink-0 justify-center px-4 py-2" style={{ order: 1 }}>{workflowTabs}</div>}
      {browseVisible && activeTab !== "captions" && !ownRailTab && <div className="shrink-0 px-4 py-2" style={{ order: 2 }}><SegmentedControl size="sm" fill aria-label="Browse media types">
        {audioInLibrary ? LIBRARY_KINDS.map(kind => <button key={kind.key} type="button" aria-pressed={libraryKind?.key === kind.key} onClick={() => selectTab(kind.key)}>
          <span>{kind.label}</span>
        </button>) : visibleSections.map(section => <button key={section.key} type="button" aria-pressed={activeSection === section.key}
          onClick={() => section.key === "audio" ? selectTab(lastAudioTabRef.current ?? (counts.music > 0 ? "music" : "sfx")) : selectTab(section.key)}
          >
          {section.icon}<span>{section.label}</span>
        </button>)}
      </SegmentedControl></div>}
      {pickingGenerationRole && <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2" style={{ order: 2 }}><span role="status" className="text-sm font-medium text-[var(--ink)]">Choose the {pickingGenerationLabel}</span><Button variant="outline" size="sm" onClick={() => { setPickingGenerationRole(undefined); setVisualPane("generate"); }}>Cancel</Button></div>}
      {browseVisible && activeTab === "stills" && !pickingGenerationRole && !mediaPicker && librarySelection.sources.length > 0 ? <div className={imageStyles.selectionBar} style={{ order: 4, flexShrink: 0, padding: "0 16px" }}>
        <span role="status">{librarySelection.sources.length} selected</span>
        <Button variant="ghost" size="sm" disabled={!librarySelection.sources.length || librarySelection.busy}
          onClick={() => void librarySelection.clear().catch(error => toast.error(error.message))}>Clear selection</Button>
      </div> : null}
      {detailTabs.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            height: 50,
            padding: "10px 16px 12px",
            flexShrink: 0,
            order: 3,
          }}
        >
          <button
            type="button"
            aria-pressed={showAllAudio}
            onClick={() => setShowAllAudio(true)}
            style={{ height: 28, padding: 0, border: "none", background: "transparent", color: showAllAudio ? C.textPrimary : C.textMuted, fontFamily: "Inter, sans-serif", fontSize: "var(--ui-text-small)", fontWeight: 400, cursor: "pointer" }}
          >
            All
          </button>
          {detailTabs.map((tab) => {
            const isActive = !showAllAudio && activeTab === tab.key;
            return (
              <button
                key={tab.key}
                aria-pressed={isActive}
                onClick={() => selectTab(tab.key)}
                style={{
                  height: 28,
                  padding: 0,
                  borderRadius: 0,
                  border: "none",
                  background: "transparent",
                  color: isActive ? C.textPrimary : C.textMuted,
                  fontFamily: "Inter, sans-serif",
                  fontSize: "var(--ui-text-small)",
                  fontWeight: 400,
                  cursor: "pointer",
                }}
              >
                {tab.label === "SFX" ? "Sound effects" : tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      {activeTab !== "layout" && browseVisible && !(editorRail && activeTab === "captions") && (
      <div
        className="asset-shelf-filters"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px 0",
          position: "relative",
          flexShrink: 0,
          order: 3,
        }}
      >
        <SearchIcon size={18} aria-hidden="true" style={{ position: "absolute", left: 24, top: 16, color: C.textMuted, pointerEvents: "none" }} />
        <input
          type="search"
          aria-label={`Search ${activeTab === "sfx" ? "sound effects" : activeTab}`}
          placeholder={audioInLibrary && libraryKind ? `Search ${libraryKind.noun}…` : activeTab === "sfx" ? "Search sounds by name, use or texture…" : activeTab === "music" ? "Search music by name, artist or use…" : activeSection === "audio" ? "Search audio…" : "Search assets…"}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          style={{
            minWidth: 0,
            width: "100%",
            flex: 1,
            height: 34,
            borderRadius: RADIUS_SM,
            border: activeSection === "audio" ? "1px solid transparent" : `1px solid ${C.borderSubtle}`,
            background: "var(--chrome-deep)",
            color: C.textPrimary,
            padding: "0 9px 0 32px",
            fontFamily: "Inter, sans-serif",
            fontSize: "var(--ui-text-small)",
            outline: "none",
          }}
        />
        {editorRail && !standaloneGeneration && !controlledPane && isUploadableTab(activeTab) && (
          <Button variant="outline" size="sm" className="h-[34px] shrink-0" onClick={handleUploadClick} disabled={uploadingTab != null}
            aria-label={uploadingTab != null ? "Importing…" : `Import ${libraryKind?.noun ?? "media"}`} title={uploadingTab != null ? "Importing…" : `Import ${libraryKind?.noun ?? "media"}`}>
            <UploadIcon size={16} /> Import
          </Button>
        )}
        {standaloneGeneration && (activeTab === "stills" || activeTab === "videos") && (
          <ThumbnailSizeControl value={thumbnailSize} onChange={setThumbnailSize} />
        )}
      </div>
      )}

      {/* Kind, then whose (This project / My library / Catalog), then search within it. */}
      {browseVisible && sourcedTab && !pickingGenerationRole && (
        <div className="shrink-0 px-4" style={{ order: 2 }}>
          <SegmentedControl size="sm" fill role="group" aria-label="Media source">
            {LIBRARY_BUCKET_ORDER.map(value => <button key={value} type="button" aria-pressed={librarySource === value} onClick={() => chooseBucket(value)}>
              <span>{bucketLabel(value, assets?.page?.counts?.[`${activeTab}_${value}`])}</span>
            </button>)}
          </SegmentedControl>
        </div>
      )}
      {browseVisible && !showAllAudio && (activeTab === "music" || activeTab === "sfx") && assets?.page?.facets && (
        // Each filter is one chip whose menu lists its choices, so a dozen moods or sound types never wall off the list.
        <div className="asset-shelf-facets flex shrink-0 flex-wrap items-center gap-1 px-3 pt-1.5" style={{ order: 3 }}>
          {(activeTab === "music"
            ? [["mood", "Mood"], ["energy", "Energy"]]
            : [["sfx_category", "Type"], ["motion", "Movement"]]).map(([name, label]) => (
            <FilterButtons key={name} label={label} menu value={audioFilters[name] || "all"}
              values={Array.from(new Set([...(assets.page?.facets?.[name] ?? []), ...(audioFilters[name] ? [audioFilters[name]] : [])]))}
              onChange={value => setAudioFilters(current => ({ ...current, [name]: value === "all" ? "" : value }))} />
          ))}
        </div>
      )}

      {visualPane === "text" && !standaloneGeneration && (
        <div id="media-visual-panel-text" role="tabpanel" aria-labelledby="media-visual-text" style={{ order: 4, flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {panelActions?.text && <ToolPanelHeader pane="text" action={panelActions.text} />}
          <div className="asset-shelf-scroll" style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "auto", padding: "8px 16px" }}>
            <TextPanel target={textTarget} onPatchElementProps={onPatchElementProps} onAddElement={onAddElement} />
          </div>
        </div>
      )}

      {fileDrag && <div role="status" className="shrink-0 border border-dashed border-[var(--ink-secondary)] p-4 text-center text-sm" style={{ order: 4 }}>{uploadingTab ? "Import in progress" : "Drop to import"}</div>}
      {importProgress && <div role="status" aria-live="polite" className="shrink-0 px-4 py-3 text-sm" style={{ order: 4 }}>
        <div className="truncate">{importProgress.percent === 100 ? "Saving…" : `Importing ${importProgress.percent}%`} · {importProgress.index} of {importProgress.total}</div>
        <div className="truncate text-xs text-[var(--ink-secondary)]">{importProgress.name}</div>
        <progress aria-label="Import progress" value={importProgress.percent} max={100} className="w-full" />
      </div>}
      {uploadError && <div role="alert" className="shrink-0 px-4 py-2 text-sm text-[var(--destructive)]" style={{ order: 4 }}>{uploadError}</div>}
      {/* Asset list */}
      <div
        id={`media-visual-panel-${(activeWorkflowPane === "captions" || activeWorkflowPane === "music" || activeWorkflowPane === "sounds" ? activeWorkflowPane : "browse")}`}
        role={standaloneGeneration ? "region" : "tabpanel"}
        aria-label={standaloneGeneration ? "Library assets" : undefined}
        aria-labelledby={standaloneGeneration ? undefined : `media-visual-${(activeWorkflowPane === "captions" || activeWorkflowPane === "music" || activeWorkflowPane === "sounds" ? activeWorkflowPane : "browse")}`}
        className="asset-shelf-scroll"
        style={{
          display: browseVisible ? undefined : "none",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: activeTab === "layout" ? "hidden" : "auto",
          overscrollBehaviorX: "contain",
          padding: activeTab === "layout" ? 0 : activeSection === "audio" ? "0 8px" : "8px 16px",
          order: 4,
        }}
      >
        {loading && !assets ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: C.textDim,
              fontSize: "var(--ui-text-small)",
            }}
          >
            Loading assets...
          </div>
        ) : (
          showAllAudio && activeSection === "audio"
            ? <>{renderMusicTracks()}{renderSfx()}</>
            : tabContent[activeTab]()
        )}
        {assetLoadError && <div role="alert" className="p-3 text-sm">{assetLoadError} <Button variant="ghost" onClick={() => void fetchAssets()}>Retry</Button></div>}
        {assets?.page?.nextOffset != null && !assetLoadError && <div className="flex justify-center p-3"><Button variant="ghost" disabled={loading} onClick={loadMore}>{loading ? "Loading more…" : "Show more"}</Button></div>}
      </div>
      {catalogMounted && <div id="media-visual-panel-recipes" role="tabpanel" aria-labelledby="media-visual-recipes" className="flex min-h-0 flex-1 flex-col" style={{ order: 4, display: visualPane === "catalog" ? "flex" : "none" }}><h2 className="sr-only">Templates</h2><LibraryEffectCatalog projectId={projectId} active={(open || !!alwaysOpen) && visualPane === "catalog"} kindAction={panelActions?.recipes} /></div>}
      {!standaloneGeneration && !generateAsDrawer && generationPanel}
      {generateAsDrawer && generateDrawerMounted && <AssetGenerationDrawer presentation="drawer" projectId={projectId} open={generateDrawerOpen} onClose={() => setGenerateDrawerOpen(false)}
        onBack={() => { setGenerateDrawerOpen(false); onReveal?.(); }}
        onLibraryChanged={() => { void fetchAssets({ silent: true }); onLibraryChanged?.(); }} launch={generationLaunch}
 />}
      {browseVisible && activeTab === "music" && expandedAudioId && (
        <div data-media-details-panel="" style={{ order: 5, height: 187, flexShrink: 0, overflowY: "auto", borderTop: "1px solid var(--chrome-line-strong)" }}>
          {renderMusicTracks(true)}
        </div>
      )}
      </div>
    </div>
  );
  return standaloneGeneration ? <div className="generation-library-workspace">{shelf}{generationPanel}</div> : shelf;
}
