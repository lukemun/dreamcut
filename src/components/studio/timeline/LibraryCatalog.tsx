"use client";

import { FilterButtons } from "./FilterButtons";
import { assetGenerationPoll, libraryPresentationPoll } from "./shared-poll";
import { AssetGenerationDrawer, type GenerationLaunch } from "../generation/AssetGenerationDrawer";
import { assetMediaUrl, type AssetJob } from "@/lib/generation/assets";
import type { ReferenceRole } from "@/lib/generation/asset-models";
import { usePanelSize, useWorkspaceSize, WorkspaceResizeHandle } from "@/components/ui/workspace-resize";
import { LIBRARY_CHANGED_EVENT } from "@/lib/media/upload-library-media";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClapperboardIcon, CrownIcon, FilmIcon, ImageIcon, Music4Icon, PauseIcon, PlayIcon, SearchIcon, SparklesIcon, Volume2Icon } from "lucide-react";
import { useCloudAccount } from "./CloudAccountSettings";
import { MembershipOffer, useMembership } from "./MembershipPrompt";
import { GENERATE_STATE_EVENT, OPEN_GENERATE_EVENT, TOGGLE_GENERATE_EVENT, generatePaneFromParam, type GeneratePane } from "../generation/open-generate";
import { WaveformPreview } from "./WaveformPreview";
import { catalogAudioPreviewUrl } from "@/lib/remotion/catalog-audio-preview";
import { LibraryRhythmInspector } from "./LibraryRhythmInspector";
import type { VideoCatalogDescription, VideoFrameDescription } from "@/lib/media-analysis/video-descriptions";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { LibrarySourceNotes } from "./LibrarySourceNotes";
import { MediaGallery } from "@/components/ui/media-gallery";
import { getStoredItem } from "@/lib/persisted-key";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";
import { libraryReferenceIdentity } from "@/lib/library/reference-identity";
import { librarySourceOf } from "@/lib/library/asset-page";
import { LIBRARY_BUCKET_LABELS, LIBRARY_BUCKET_ORDER, bucketLabel, bucketRank, defaultLibraryBucket, initialLibraryKind, isLibraryBucket, readLibraryView, writeLibraryView, type LibraryBucket } from "@/lib/library/library-buckets";
import { formatMediaDuration } from "@/lib/media/format-duration";
import { LibraryExports } from "./LibraryExports";
import { LibraryEffectCatalog } from "./LibraryEffectCatalog";

type Visual = {
  video_description?: VideoCatalogDescription;
  matching_frames?: VideoFrameDescription[];
  matching_frame_count?: number;
  asset_id?: string;
  project_id?: string;
  project_title?: string;
  media_path?: string;
  original_filename?: string;
  processing_status?: string | null;
  processing_error?: string | null;
  projects?: Array<{ id: string; title: string; media_path: string }>;

  import_search_text?: string;
  slot_id: string;
  name: string;
  type: "still" | "video_clip";
  source_url: string | null;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  is_catalog?: boolean;
  is_personal?: boolean;
  catalog_visual_id?: string | null;
  catalog_image_id?: string | null;
  upload_id?: string | null;
  library_annotation?: LibraryAssetAnnotation | null;
  /** False for a shared catalog clip that downloads from DreamCut Cloud the first time it is played. */
  downloaded?: boolean;
};

type LibraryAssetAnnotation = {
  display_name: string;
  meaning: string;
  use_cases: string[];
  tone: string[];
  template_structure: string;
  cultural_context: string;
  avoid_when: string[];
  tags: string[];
  confidence: "high" | "medium" | "low";
  sources: Array<{ label: string; url: string; kind: "template_page" | "cultural_reference" | "original_source" }>;
};

type Track = {
  source_status?: string;
  /** Sound effects only: members-only sounds need a DreamCut membership. */
  access?: "free" | "members";
  source_asset_id?: string;
  import_search_text?: string;
  track_id: string;
  track_name: string;
  duration_seconds?: number | null;
  source_url?: string | null;
  description?: string | null;
  tags?: string[];
  good_for?: string[];
  avoid_for?: string[];
  category?: string | null;
  moods?: string[];
  energy?: string | null;
  tempo_bpm?: number | null;
  textures?: string[];
  editorial?: { motion?: string | null; intensity?: string | null; texture?: string[] } | null;
  is_catalog?: boolean;
  is_personal?: boolean;
};

type LibraryResponse = {
  visuals: Visual[];
  music_tracks: Track[];
  sfx_tracks: Track[];
};

type LibraryTab = "stills" | "videos" | "music" | "sfx" | "exports" | "templates";
type MediaTab = Exclude<LibraryTab, "exports" | "templates">;
const LIBRARY_TABS: readonly LibraryTab[] = ["stills", "videos", "music", "sfx", "exports", "templates"];
/** Tabs with their own browsing (search, filters) rather than the media list. */
const ownBrowsing = (tab: LibraryTab): tab is "exports" | "templates" => tab === "exports" || tab === "templates";

/** One vocabulary with the editor's Library: This project, My library and Catalog. */
const SOURCE_LABELS = LIBRARY_BUCKET_LABELS;
const PROVENANCE_TAG_PATTERN = /(?:youtube|source|warrior\s*sfx|techkeyfi)/i;

const formatDuration = (seconds?: number | null) => seconds == null ? "Duration unknown" : formatMediaDuration(seconds);
const displayTags = (tags?: string[]) => (tags ?? []).filter((tag) => !PROVENANCE_TAG_PATTERN.test(tag));
const isLibrarySfx = (track: Track) => track.category !== "collection";
const annotationSearchValues = (asset: Visual) => [
  asset.library_annotation?.display_name, asset.library_annotation?.meaning,
  ...(asset.library_annotation?.tags ?? []), asset.import_search_text ?? "",
  asset.video_description?.summary, ...(asset.video_description?.tags ?? []),
];

const mostCommon = (values: string[], limit = 12) => [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()).entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, limit)
  .map(([value]) => value);

function AssetGroup({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  children: ReactNode;
}) {
  return <section className="space-y-3" aria-label={`${title} (${count})`}>
    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
      {icon}<span>{title}</span><span className="rounded-[var(--edge-pill)] bg-[var(--chrome-raised)] px-2 py-0.5 text-xs text-[var(--ink-secondary)]">{count}</span>
    </div>
    {children}
  </section>;
}

function AnnotationSummary({ annotation }: { annotation?: LibraryAssetAnnotation | null }) {
  const [open, setOpen] = useState(false);
  if (!annotation) return null;
  return <div className="space-y-2 text-xs leading-5 text-[var(--ink-secondary)]">
    <p>{annotation.meaning}</p>
    <div className="flex flex-wrap gap-1">
      {annotation.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded-[var(--edge-pill)] bg-[var(--chrome-deep)] px-2 py-0.5">{tag}</span>)}
    </div>
    <InspectorDisclosure title="Cultural context &amp; usage" open={open} onOpenChange={setOpen}>
      <div className="space-y-2">
        <p><span className="font-medium text-[var(--ink)]">Structure:</span> {annotation.template_structure}</p>
        <p><span className="font-medium text-[var(--ink)]">Common uses:</span> {annotation.use_cases.join(" · ")}</p>
        <p><span className="font-medium text-[var(--ink)]">Tone:</span> {annotation.tone.join(" · ")}</p>
        <p><span className="font-medium text-[var(--ink)]">Context:</span> {annotation.cultural_context}</p>
        {annotation.avoid_when.length ? <p><span className="font-medium text-[var(--ink)]">Avoid when:</span> {annotation.avoid_when.join(" · ")}</p> : null}
        <p><span className="font-medium text-[var(--ink)]">Confidence:</span> {annotation.confidence}</p>
        <p><span className="font-medium text-[var(--ink)]">Sources:</span> {annotation.sources.map((source, index) => <span key={source.url}>{index ? " · " : ""}<a href={source.url} target="_blank" rel="noreferrer" className="underline">{source.label}</a></span>)}</p>
      </div>
    </InspectorDisclosure>
  </div>;
}

function VideoDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <InspectorDisclosure title="Description" open={open} onOpenChange={setOpen}>{children}</InspectorDisclosure>;
}

const VIDEO_VIEW_KEY = "dreamcut:library-video-view";
type VideoView = { size: "small" | "medium" | "large"; columns: "auto" | "1" | "2" | "3" | "4" | "5" | "6" };
const DEFAULT_VIDEO_VIEW: VideoView = { size: "medium", columns: "auto" };
/** Music and sound cards per row; narrow windows still fall back to fewer. */
const AUDIO_COLUMNS_KEY = "dreamcut:library-audio-columns";
type AudioColumns = 1 | 2 | 3;
const AUDIO_GRID: Record<AudioColumns, string> = { 1: "grid-cols-1", 2: "grid-cols-1 md:grid-cols-2", 3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" };

function VideoDescriptionSummary({ asset, onSeek, onAnalyze }: { asset: Visual; onSeek: (time: number) => void; onAnalyze: () => void }) {
  const [open, setOpen] = useState(false);
  const description = asset.video_description;
  const frames = asset.matching_frames ?? [];
  const working = asset.processing_status === "queued" || asset.processing_status === "running";
  return <div className="space-y-2 text-xs leading-5 text-[var(--ink-secondary)]">
    {description?.summary ?? asset.library_annotation?.meaning ? <p>{description?.summary ?? asset.library_annotation?.meaning}</p> : null}
    {description?.coverage ? <p className="text-[var(--ink-muted)]">{description.coverage}</p> : null}
    {description?.reason ? <p>{description.reason}</p> : null}
    {asset.processing_error ? <p role="status">{asset.processing_error}</p> : null}
    {description?.status !== "ready" && asset.asset_id ? <button type="button" disabled={working} onClick={onAnalyze} className="rounded-md border border-[var(--edge-outline)] px-3 py-1.5 text-xs disabled:opacity-50">{working ? "Analyzing video…" : "Analyze whole video"}</button> : null}
    {frames.length ? <InspectorDisclosure title={`${asset.matching_frame_count ?? frames.length} matching ${(asset.matching_frame_count ?? frames.length) === 1 ? "moment" : "moments"}`} open={open} onOpenChange={setOpen}>
      <ul className="space-y-2">{frames.map(frame => <li key={frame.id}><button type="button" disabled={!asset.source_url} onClick={() => onSeek(frame.time_seconds)} className="text-left underline disabled:opacity-50" aria-label={`Preview at ${frame.time_seconds.toFixed(2)} seconds: ${frame.description}`}><span className="font-medium tabular-nums">{frame.time_seconds.toFixed(2)}s</span> · {frame.description}</button></li>)}</ul>
      {(asset.matching_frame_count ?? 0) > frames.length ? <p>Showing first {frames.length}</p> : null}
    </InspectorDisclosure> : null}
    {asset.project_id ? <a href={`/p/${encodeURIComponent(asset.project_id)}/library`} className="underline">{asset.project_title ?? asset.project_id}{(asset.projects?.length ?? 0) > 1 ? ` · in ${asset.projects!.length} projects` : ""}</a> : null}
    <p className="text-[var(--ink-muted)]">{asset.original_filename ?? asset.name}</p>
  </div>;
}

function AudioUseNotes({ track }: { track: Track; showDescription?: boolean }) {
  if (!track.good_for?.length) return null;
  return <p className="mt-2 text-xs leading-5 text-[var(--ink-secondary)]"><span className="font-medium text-[var(--ink)]">Good for:</span> {track.good_for.join("; ")}</p>;
}


/** Where Library shows the Generate form. Switch to "drawer" to slide it over the grid instead. */
const LIBRARY_GENERATE_PRESENTATION: "docked" | "drawer" = "docked";
type GeneratedResult = { key: string; source: string; kind: "image" | "video" | "audio"; label: string };

export function LibraryCatalog({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationPane, setGenerationPane] = useState<GeneratePane>("create");
  const [generationLaunch, setGenerationLaunch] = useState<GenerationLaunch>();
  /** A reference slot the form asked to fill: the next Library click fills it. */
  const [pickingRole, setPickingRole] = useState<ReferenceRole | null>(null);
  const [pickingLabel, setPickingLabel] = useState("");
  const [generated, setGenerated] = useState<GeneratedResult[]>([]);
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceSize = useWorkspaceSize(workspaceRef);
  const panelMax = Math.max(360, Math.min(720, workspaceSize.width - 420));
  const panel = usePanelSize("dreamcut:library-generate-width", 440, 360, panelMax);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const closeGeneration = useCallback(() => setGenerationOpen(false), []);
  const reloadLibrary = useCallback(() => setLibraryRevision(n => n + 1), []);
  // Media imported elsewhere in the editor, such as from the chat, appears without a reload.
  useEffect(() => {
    window.addEventListener(LIBRARY_CHANGED_EVENT, reloadLibrary);
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, reloadLibrary);
  }, [reloadLibrary]);
  const openGenerate = useCallback((pane: GeneratePane = "create") => { setGenerationPane(pane); setGenerationOpen(true); }, []);
  // A Storyboard or editor handoff waits in session storage until the form is here to take it.
  useEffect(() => {
    if (!generationOpen) return;
    const key = `dreamcut:generation-launch:${projectId}`;
    try { const saved = sessionStorage.getItem(key); if (saved) { sessionStorage.removeItem(key); setGenerationLaunch(JSON.parse(saved)); } } catch { /* A stale handoff never blocks Generate. */ }
  }, [generationOpen, projectId]);
  // Results that are not yet kept appear in the grid as they arrive.
  useEffect(() => assetGenerationPoll<{ jobs: AssetJob[] }>(projectId).subscribe(({ jobs }) => {
    setGenerated(jobs.filter(job => job.request.task !== "extract").flatMap(job => job.outputs.filter(output => !output.keptSource)
      .map(output => ({ key: `${job.id}/${output.id}`, source: output.source, kind: output.kind, label: job.request.prompt.trim().slice(0, 80) || output.id }))));
  }), [projectId]);
  /** With Generate open, a Library image becomes a reference: the asked-for slot, or a role chosen in the form. */
  const addAsReference = (source: string) => {
    setGenerationLaunch({ addReference: true, source, ...(pickingRole ? { referenceRole: pickingRole } : {}), nonce: Date.now() });
    setPickingRole(null);
  };
  /** Catalog items are copied into the project first (the same path as the editor's Library), then fill the slot. */
  const [preparing, setPreparing] = useState<string | null>(null);
  const pickReference = async (key: string, identity: string, catalog: boolean) => {
    if (!catalog) { addAsReference(identity); return; }
    setPreparing(key); setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/library-selection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare_reference", source: identity }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not use this reference.");
      addAsReference(body.source); reloadLibrary();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not use this reference."); } finally { setPreparing(null); }
  };
  const projectMediaPrefix = `/api/projects/${encodeURIComponent(projectId)}/media/`;
  const projectSource = (url: string | null) => url?.startsWith(projectMediaPrefix) ? decodeURIComponent(url.slice(projectMediaPrefix.length).split("?")[0]) : null;
  // The Generate drawer opens from `?generate=create|results` (old Generate links, agent review links), from an
  // agent-staged draft (OPEN_GENERATE_EVENT) and from a Storyboard/editor handoff waiting in session storage.
  useEffect(() => {
    const requested = generatePaneFromParam(new URLSearchParams(window.location.search).get("generate"));
    let handoff = false;
    try { handoff = Boolean(sessionStorage.getItem(`dreamcut:generation-launch:${projectId}`)); } catch { /* No handoff. */ }
    if (requested || handoff) openGenerate(requested ?? "create");
    const open = (event: Event) => openGenerate((event as CustomEvent<{ pane?: GeneratePane }>).detail?.pane ?? "create");
    window.addEventListener(OPEN_GENERATE_EVENT, open);
    return () => window.removeEventListener(OPEN_GENERATE_EVENT, open);
  }, [projectId, openGenerate]);
  useEffect(() => {
    const toggleFromHeader = () => { if (generationOpen) setGenerationOpen(false); else openGenerate(); };
    window.addEventListener(TOGGLE_GENERATE_EVENT, toggleFromHeader);
    return () => window.removeEventListener(TOGGLE_GENERATE_EVENT, toggleFromHeader);
  }, [generationOpen, openGenerate]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(GENERATE_STATE_EVENT, { detail: { open: generationOpen } }));
  }, [generationOpen]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent(GENERATE_STATE_EVENT, { detail: { open: false } })); }, []);
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LibraryTab>("stills");
  const [query, setQuery] = useState("");
  const [videoScope, setVideoScope] = useState("all"); // "all" means this project, matching FilterButtons' default.
  const [videoSearch, setVideoSearch] = useState<{ videos: Visual[]; total: number; next_offset: number | null; warnings: Array<{ project_id: string; reason: string }> } | null>(null);
  const [videoSearchError, setVideoSearchError] = useState<string | null>(null);
  const [videoSearchLoading, setVideoSearchLoading] = useState(false);
  const [presentation, setPresentation] = useState<{ presentation: { id: string; title: string; note: string }; videos: Visual[]; warnings: string[] } | null>(null);
  const presentationId = useRef<string | null>(null);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [videoOffset, setVideoOffset] = useState(0);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const [videoView, setVideoView] = useState<VideoView>(DEFAULT_VIDEO_VIEW);
  useEffect(() => {
    try {
      const saved = JSON.parse(getStoredItem(localStorage, VIDEO_VIEW_KEY) ?? "null");
      if (saved && ["small", "medium", "large"].includes(saved.size) && ["auto", "1", "2", "3", "4", "5", "6"].includes(saved.columns)) setVideoView({size: saved.size, columns: saved.columns});
    } catch { /* Storage may be unavailable; keep the usable default layout. */ }
  }, []);
  const [audioColumns, setAudioColumns] = useState<AudioColumns>(2);
  useEffect(() => {
    try { const saved = Number(getStoredItem(localStorage, AUDIO_COLUMNS_KEY)); if (saved === 1 || saved === 2 || saved === 3) setAudioColumns(saved); }
    catch { /* Storage may be unavailable; keep two per row. */ }
  }, []);
  const changeAudioColumns = (next: AudioColumns) => {
    setAudioColumns(next);
    try { localStorage.setItem(AUDIO_COLUMNS_KEY, String(next)); } catch { /* The choice still applies without persistence. */ }
  };
  const changeVideoView = (next: VideoView) => {
    setVideoView(next);
    try { localStorage.setItem(VIDEO_VIEW_KEY, JSON.stringify(next)); } catch { /* View choices still work without persistence. */ }
  };
  // One shared, visibility-aware, ETag-gated poll (also used by the project shell).
  useEffect(() => libraryPresentationPoll(projectId).subscribe((data) => {
    if (!data.presentation) { setPresentation(null); return; }
    setPresentation(data as typeof presentation); setPresentationError(null);
    if (presentationId.current !== data.presentation.id) {
      presentationId.current = data.presentation.id; setActiveTab("videos"); setQuery("");
      setVisualSource("all");
    }
  }, (error) => { if (presentationId.current) setPresentationError((error as Error).message); }), [projectId]);
  const dismissPresentation = async () => {
    if (!presentation) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/library-presentation`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: presentation.presentation.id }) });
    if (!response.ok) { setPresentationError("New results arrived."); return; }
    setPresentation(null); setPresentationError(null); setQuery("");
  };
  useEffect(() => { setVideoOffset(0); setVideoSearch(null); }, [query, videoScope, projectId]);
  useEffect(() => {
    if (activeTab !== "videos") return;
    if (presentation) { setVideoSearchLoading(false); return; }
    const controller = new AbortController();
    setVideoSearchLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, offset: String(videoOffset) });
      if (videoScope === "all") params.set("project_id", projectId);
      void fetch(`/api/video-search?${params}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Video search unavailable");
        if (controller.signal.aborted) return;
        setVideoSearch(result); setVideoSearchError(null);
      }).catch(error => { if (!controller.signal.aborted) setVideoSearchError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setVideoSearchLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [activeTab, query, videoScope, videoOffset, projectId, libraryRevision, Boolean(presentation)]);
  useEffect(() => {
    if (activeTab !== "videos" || !videoSearch?.videos.some(asset => ["queued", "running"].includes(asset.processing_status ?? ""))) return;
    const timer = setTimeout(reloadLibrary, 5000);
    return () => clearTimeout(timer);
  }, [activeTab, videoSearch, reloadLibrary]);
  const analyzeVideo = async (asset: Visual) => {
    if (!asset.project_id || !asset.asset_id) return;
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(asset.project_id)}/import-jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: asset.asset_id, action: "analyze_video" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not analyze video");
      reloadLibrary();
    } catch (error) { setVideoSearchError(error instanceof Error ? error.message : "Could not analyze video"); }
  };
  const [visualSource, setVisualSource] = useState<"all" | LibraryBucket>("all");
  useEffect(() => {
    if (!presentation) return;
    for (const asset of presentation.videos) {
      const video = videoRefs.current.get(asset.slot_id), frame = asset.matching_frames?.[0];
      if (video && frame && video.readyState >= 1) { video.pause(); video.currentTime = frame.time_seconds; }
    }
  }, [presentation?.presentation.id]);
  const [sfxCategory, setSfxCategory] = useState("all");
  const [sfxMotion, setSfxMotion] = useState("all");
  const [musicMood, setMusicMood] = useState("all");
  const [musicEnergy, setMusicEnergy] = useState("all");
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  // Members-only sounds: locked when signed out or when DreamCut Cloud says the creator is not a member.
  const cloud = useCloudAccount();
  const membership = useMembership(cloud.account);
  const membersLocked = cloud.account !== null && (!cloud.account.signed_in || membership?.member === false);
  const [membershipFor, setMembershipFor] = useState<string | null>(null);
  const [playingProgress, setPlayingProgress] = useState(0);
  const [inspectedTrack, setInspectedTrack] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/projects/${projectId}/timeline/assets`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as LibraryResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load the library.");
        if (active) setLibrary(payload);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load the library."); });
    return () => { active = false; };
  }, [projectId, libraryRevision]);

  useEffect(() => () => audioRef.current?.pause(), []);

  // This project, then My library, then the catalog, as every Library lists them.
  const groups = useMemo(() => {
    const ordered = <T extends Visual | Track>(items: T[]) => [...items].sort((a, b) => bucketRank(librarySourceOf(a)) - bucketRank(librarySourceOf(b)));
    return {
      stills: ordered(library?.visuals.filter((asset) => asset.type === "still") ?? []),
      videos: ordered(library?.visuals.filter((asset) => asset.type === "video_clip") ?? []),
      music: ordered(library?.music_tracks ?? []),
      sfx: ordered(library?.sfx_tracks.filter((track) => Boolean(track.source_url)).filter(isLibrarySfx) ?? []),
    };
  }, [library]);
  const bucketCounts = useMemo(() => Object.fromEntries((Object.entries(groups) as [MediaTab, (Visual | Track)[]][]).flatMap(([kind, items]) =>
    LIBRARY_BUCKET_ORDER.map(bucket => [`${kind}_${bucket}`, items.filter(item => librarySourceOf(item) === bucket).length]))) as Record<string, number>, [groups]);
  const inSource = (item: Visual | Track) => visualSource === "all" || librarySourceOf(item) === visualSource;
  /** A kind opens on its first non-empty bucket; switching kinds starts its search afresh. */
  const selectTab = (tab: LibraryTab) => { setActiveTab(tab); setQuery(""); if (!ownBrowsing(tab)) setVisualSource(defaultLibraryBucket(bucketCounts, tab)); };
  // First open: the saved view for this session, else the kind this project's own media has and its first non-empty bucket.
  const viewReadyFor = useRef<string | null>(null);
  useEffect(() => {
    if (!library || viewReadyFor.current === projectId) return;
    viewReadyFor.current = projectId;
    const saved = readLibraryView("library-page", projectId);
    const savedTab = LIBRARY_TABS.find(tab => tab === saved?.kind);
    if (savedTab) { setActiveTab(savedTab); setVisualSource(saved?.bucket === "all" || isLibraryBucket(saved?.bucket) ? saved!.bucket as typeof visualSource : "all"); setQuery(saved?.search ?? ""); return; }
    if (presentationId.current) return;
    const kind = initialLibraryKind(bucketCounts, "stills");
    setActiveTab(kind); setVisualSource(defaultLibraryBucket(bucketCounts, kind));
  }, [library, projectId, bucketCounts]);
  useEffect(() => {
    if (viewReadyFor.current === projectId) writeLibraryView("library-page", projectId, { kind: activeTab, bucket: visualSource, search: query });
  }, [activeTab, visualSource, query, projectId]);

  const sfxCategories = useMemo(() => [...new Set(groups.sfx.map((track) => track.category).filter((category): category is string => Boolean(category)))].sort(), [groups.sfx]);
  const sfxMotions = useMemo(() => [...new Set(groups.sfx.map((track) => track.editorial?.motion).filter((motion): motion is string => Boolean(motion)))].sort(), [groups.sfx]);
  const musicMoods = useMemo(() => mostCommon(groups.music.flatMap((track) => track.moods ?? [])), [groups.music]);
  const musicEnergies = useMemo(() => [...new Set(groups.music.map((track) => track.energy).filter((energy): energy is string => Boolean(energy)))].sort(), [groups.music]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesQuery = (...values: Array<string | null | undefined>) => !normalizedQuery || values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
  const filteredGroups = useMemo(() => ({
    stills: groups.stills.filter((asset) => matchesQuery(asset.name, ...annotationSearchValues(asset)) && inSource(asset)),
    videos: presentation ? presentation.videos : videoSearch ? [
      // Video search covers this project's own files; My library and the catalog are listed after them.
      ...(visualSource === "all" || visualSource === "project" || videoScope !== "all" ? videoSearch.videos : []),
      ...(videoScope === "all" ? groups.videos.filter(asset => asset.is_catalog && inSource(asset) && matchesQuery(asset.name, ...annotationSearchValues(asset))) : []),
    ] : groups.videos.filter((asset) => matchesQuery(asset.name, ...annotationSearchValues(asset)) && inSource(asset)),
    music: groups.music.filter((track) => matchesQuery(track.track_name, track.import_search_text, track.description, track.category, track.energy, ...(track.moods ?? []), ...(track.textures ?? []), ...(track.good_for ?? [])) && (musicMood === "all" || track.moods?.includes(musicMood)) && (musicEnergy === "all" || track.energy === musicEnergy) && inSource(track)).sort((a, b) => bucketRank(librarySourceOf(a)) - bucketRank(librarySourceOf(b)) || Number(Boolean(b.source_url)) - Number(Boolean(a.source_url))),
    sfx: groups.sfx.filter((track) => matchesQuery(track.track_name, track.import_search_text, track.description, track.category, ...displayTags(track.tags), track.editorial?.motion, track.editorial?.intensity, ...(track.editorial?.texture ?? []), ...(track.good_for ?? [])) && (sfxCategory === "all" || track.category === sfxCategory) && (sfxMotion === "all" || track.editorial?.motion === sfxMotion) && inSource(track)).sort((a, b) => bucketRank(librarySourceOf(a)) - bucketRank(librarySourceOf(b)) || Number(Boolean(b.source_url)) - Number(Boolean(a.source_url))),
  }), [groups, musicEnergy, musicMood, normalizedQuery, sfxCategory, sfxMotion, visualSource, videoSearch, videoScope, presentation]);

  const startPreview = (track: Track, startFraction = 0, startSeconds?: number) => {
    if (!track.source_url) return;
    audioRef.current?.pause();
    const audio = new Audio(catalogAudioPreviewUrl(track.source_url));
    audioRef.current = audio;
    setPlayingUrl(track.source_url);
    setPlayingProgress(startSeconds != null && track.duration_seconds ? startSeconds / track.duration_seconds : startFraction);
    audio.addEventListener("timeupdate", () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : track.duration_seconds;
      if (duration) setPlayingProgress(Math.min(1, audio.currentTime / duration));
    });
    const clearPreview = () => { setPlayingUrl(null); setPlayingProgress(0); };
    audio.addEventListener("ended", clearPreview, { once: true });
    audio.addEventListener("error", clearPreview, { once: true });
    const playFromRequestedPoint = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : track.duration_seconds;
      if (duration) audio.currentTime = Math.min(duration - 0.01, Math.max(0, startSeconds ?? duration * startFraction));
      void audio.play().catch(clearPreview);
    };
    if (audio.readyState >= 1) playFromRequestedPoint();
    else audio.addEventListener("loadedmetadata", playFromRequestedPoint, { once: true });
  };

  const togglePreview = (track: Track) => {
    if (!track.source_url) return;
    if (audioRef.current && playingUrl === track.source_url) {
      audioRef.current.pause();
      setPlayingUrl(null);
      setPlayingProgress(0);
      return;
    }
    startPreview(track);
  };

  const seekPreview = (track: Track, fraction: number) => {
    const audio = audioRef.current;
    if (!audio || playingUrl !== track.source_url) {
      startPreview(track, fraction);
      return;
    }
    const duration = Number.isFinite(audio.duration) ? audio.duration : track.duration_seconds;
    if (duration) audio.currentTime = Math.min(duration - 0.01, Math.max(0, duration * fraction));
    setPlayingProgress(fraction);
    if (audio.paused) void audio.play().catch(() => { setPlayingUrl(null); setPlayingProgress(0); });
  };

  const auditionPreview = (track: Track, seconds: number) => {
    const audio = audioRef.current;
    if (!audio || playingUrl !== track.source_url) { startPreview(track, 0, seconds); return; }
    const duration = Number.isFinite(audio.duration) ? audio.duration : track.duration_seconds;
    if (duration) {
      audio.currentTime = Math.min(duration - 0.01, Math.max(0, seconds));
      setPlayingProgress(audio.currentTime / duration);
    }
    if (audio.paused) void audio.play().catch(() => { setPlayingUrl(null); setPlayingProgress(0); });
  };

  const renderPreviewButton = (track: Track) => track.source_url ? <button
    type="button"
    onClick={() => togglePreview(track)}
    aria-label={`${playingUrl === track.source_url ? "Pause" : "Play"} ${track.track_name}`}
    className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--edge-outline)] bg-[var(--chrome-deep)] px-3 text-xs font-medium text-[var(--ink)] hover:bg-[var(--chrome-panel)]"
  >{playingUrl === track.source_url ? <PauseIcon size={14} aria-hidden="true" /> : <PlayIcon size={14} aria-hidden="true" />}{playingUrl === track.source_url ? "Pause" : "Play"}</button> : <span className="text-xs text-[var(--ink-muted)]">Audio unavailable</span>;

  const tabs: Array<{ id: LibraryTab; label: string; count?: number; icon: ReactNode }> = [
    { id: "stills", label: "Images", count: groups.stills.length, icon: <ImageIcon size={16} aria-hidden="true" /> },
    { id: "videos", label: "Video", count: groups.videos.length, icon: <FilmIcon size={16} aria-hidden="true" /> },
    { id: "music", label: "Music", count: groups.music.length, icon: <Music4Icon size={16} aria-hidden="true" /> },
    { id: "sfx", label: "Sounds", count: groups.sfx.length, icon: <Volume2Icon size={16} aria-hidden="true" /> },
    // Finished videos from every project, as in the editor's Library.
    { id: "exports", label: "Exports", icon: <ClapperboardIcon size={16} aria-hidden="true" /> },
    // The same Templates gallery as the editor's Library drawer and Properties.
    { id: "templates", label: "Templates", icon: <SparklesIcon size={16} aria-hidden="true" /> },
  ];

  const activeCount = ownBrowsing(activeTab) ? 0 : filteredGroups[activeTab].length;
  const searchPlaceholder = activeTab === "videos" ? "Search subjects or actions" : activeTab === "sfx" ? "Search sounds or use cases" : activeTab === "music" ? "Search music or use cases" : `Search ${tabs.find((tab) => tab.id === activeTab)?.label.toLocaleLowerCase() ?? "library"}`;

  const generateForm = (presentation: "docked" | "drawer") => <AssetGenerationDrawer projectId={projectId} presentation={presentation} open={generationOpen}
    onClose={closeGeneration} onLibraryChanged={reloadLibrary} launch={generationLaunch} inlinePane={generationPane} onInlinePaneChange={setGenerationPane}
    onPickLibrary={(role, label) => { setPickingRole(role); setPickingLabel(label); setActiveTab(role === "motion" || role === "source" ? "videos" : "stills"); }} />;
  const docked = LIBRARY_GENERATE_PRESENTATION === "docked" && generationOpen;
  return <main ref={workspaceRef} className="editor-chrome memory-page library-workspace" aria-labelledby="library-title">
    <div className="library-browse">
    {/* Generate opens from the header's Library button (or its shortcut). */}
    <PageHeader id="library-title" icon={<ImageIcon size={19} />} eyebrow={projectTitle} title="Library" />
    {library ? <SegmentedControl as="nav" wrap className="memory-page-tabs" aria-label="Library media types" role="tablist">
      {tabs.map((tab) => <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        tabIndex={activeTab === tab.id ? 0 : -1}
        onKeyDown={event => {
          const index = tabs.findIndex(item => item.id === tab.id);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : null;
          if (next === null) return;
          event.preventDefault(); selectTab(tabs[next]!.id);
          (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
        }}
        aria-label={tab.count != null ? `${tab.label} (${tab.count})` : tab.label}
        aria-controls={`library-panel-${tab.id}`}
        onClick={() => selectTab(tab.id)}
        className="flex items-center gap-2"
      >
        {tab.icon}<span>{tab.label}</span>{tab.count != null ? <span className="rounded-[var(--edge-pill)] bg-[var(--chrome-deep)] px-2 py-0.5 text-xs text-[var(--ink-secondary)]">{tab.count}</span> : null}
      </button>)}
    </SegmentedControl> : null}
    <div className="memory-body memory-page-body space-y-5">
      {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
      {!library && !error ? <p className="text-sm text-[var(--ink-secondary)]">Loading library…</p> : null}
      {library ? <>
        {activeTab === "videos" && presentation ? <section aria-label="Videos found for you" className="space-y-2 rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-panel)] p-4">
          <p className="text-xs text-[var(--ink-muted)]">Found for you · {presentation.videos.length} {presentation.videos.length === 1 ? "video" : "videos"}</p>
          <h2 className="text-lg font-semibold">{presentation.presentation.title}</h2>
          {presentation.presentation.note ? <p className="text-sm">{presentation.presentation.note}</p> : null}
          <button type="button" onClick={() => void dismissPresentation().catch(() => setPresentationError("Could not return to browsing"))} className="rounded-md border border-[var(--edge-outline)] px-3 py-2 text-sm">Browse all videos</button>
          {presentation.warnings.map((warning, index) => <p key={index} role="status" className="text-sm">{warning}</p>)}
        </section> : activeTab === "templates" ? null : <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">Search {tabs.find((tab) => tab.id === activeTab)?.label}</span>
            <SearchIcon size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input aria-label={`Search ${tabs.find((tab) => tab.id === activeTab)?.label ?? "library"}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="h-10 w-full rounded-md border border-[var(--edge-outline)] bg-[var(--glass-field)] pl-9 pr-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--timeline-review-marker-color)]" />
          </label>
          {/* Filters share the search row as tab selectors; nothing here needs its own line. */}
          {activeTab === "videos" ? <FilterButtons inline label="Search in" value={videoScope} values={["all projects"]} allLabel="This project" onChange={value => { setVisualSource("all"); setVideoScope(value); }} /> : null}
          {activeTab !== "exports" && (activeTab !== "videos" || videoScope === "all") ? <FilterButtons inline label="Source" value={visualSource} values={[...LIBRARY_BUCKET_ORDER]}
            labels={Object.fromEntries(LIBRARY_BUCKET_ORDER.map(bucket => [bucket, bucketLabel(bucket, bucketCounts[`${activeTab}_${bucket}`])]))} onChange={(value) => setVisualSource(value as typeof visualSource)} /> : null}
          {activeTab === "videos" ? <SegmentedControl size="sm" aria-label="Video preview size">
            {(["small", "medium", "large"] as const).map(size => <button key={size} type="button" className="library-filter" aria-pressed={videoView.size === size} title={`${size[0].toUpperCase()}${size.slice(1)} previews`} onClick={() => changeVideoView({ ...videoView, size, columns: "auto" })}>{size[0].toUpperCase()}</button>)}
          </SegmentedControl> : null}
          {activeTab === "music" || activeTab === "sfx" ? <SegmentedControl size="sm" aria-label="Cards per row">
            {([1, 2, 3] as const).map(columns => <button key={columns} type="button" className="library-filter" aria-pressed={audioColumns === columns} title={`${columns} per row`} onClick={() => changeAudioColumns(columns)}>{columns}</button>)}
          </SegmentedControl> : null}
          {activeTab === "exports" ? null : <span className="ml-auto text-xs tabular text-[var(--ink-muted)]">Showing {activeCount} of {activeTab === "videos" && videoSearch ? videoSearch.total + (videoScope === "all" ? groups.videos.filter(asset => asset.is_catalog && inSource(asset) && matchesQuery(asset.name, ...annotationSearchValues(asset))).length : 0) : groups[activeTab].length}</span>}
        </div>}
        {presentationError ? <p role="alert">{presentationError}</p> : null}

        {activeTab === "videos" && !presentation ? <>
          {videoSearchLoading ? <p role="status" className="text-xs text-[var(--ink-muted)]">Searching videos…</p> : null}
          {videoSearchError ? <p role="alert" className="text-xs">{videoSearchError}</p> : null}
          {videoSearch?.warnings.length ? <p role="status" className="text-xs">{videoSearch.warnings.length} project catalogs could not be read.</p> : null}
        </> : null}
        {activeTab === "music" ? <div className="space-y-2"><FilterButtons label="Mood" value={musicMood} values={musicMoods} onChange={setMusicMood} /><FilterButtons label="Energy" value={musicEnergy} values={musicEnergies} onChange={setMusicEnergy} /></div> : null}
        {activeTab === "sfx" ? <div className="space-y-2"><FilterButtons label="Category" value={sfxCategory} values={sfxCategories} onChange={setSfxCategory} /><FilterButtons label="Motion" value={sfxMotion} values={sfxMotions} onChange={setSfxMotion} /></div> : null}

        {generationOpen && pickingRole ? <p role="status" className="flex items-center gap-3 text-sm font-medium">Choose the {pickingLabel}
          <Button variant="ghost" size="sm" onClick={() => setPickingRole(null)}>Cancel</Button></p> : null}
        {activeTab === "music" && generated.some(result => result.kind === "audio") ? <AssetGroup title="New from Generate" count={generated.filter(result => result.kind === "audio").length} icon={<SparklesIcon size={17} aria-hidden="true" />}>
          <div className="space-y-3">{generated.filter(result => result.kind === "audio").map(result => <article key={result.key} className="min-w-0 space-y-1">
            <audio src={assetMediaUrl(projectId, result.source)} controls preload="metadata" aria-label={result.label} className="block w-full" />
            <p className="truncate px-1 text-xs text-[var(--ink-secondary)]" title={result.label}>{result.label}</p>
          </article>)}</div>
        </AssetGroup> : null}
        {(activeTab === "stills" || activeTab === "videos") && generated.some(result => result.kind === (activeTab === "stills" ? "image" : "video")) ? <AssetGroup title="New from Generate" count={generated.filter(result => result.kind === (activeTab === "stills" ? "image" : "video")).length} icon={<SparklesIcon size={17} aria-hidden="true" />}>
          <MediaGallery targetHeight={180} minCardWidth={140}>
            {generated.filter(result => result.kind === (activeTab === "stills" ? "image" : "video")).map(result => <article key={result.key} className="min-w-0">
              {result.kind === "image" ? (generationOpen
                ? <button type="button" className="library-reference-pick" aria-label={`Use generated image as ${pickingRole ? `the ${pickingLabel}` : "a reference"}`} onClick={() => addAsReference(result.source)}><img src={assetMediaUrl(projectId, result.source)} alt="" data-media-preview className="block h-auto w-full rounded-lg object-contain" /><span className="library-reference-pick-label" aria-hidden="true">Use</span></button>
                : <img src={assetMediaUrl(projectId, result.source)} alt="" data-media-preview className="block h-auto w-full rounded-lg object-contain" />)
                : <video src={assetMediaUrl(projectId, result.source)} controls muted playsInline preload="metadata" className="block h-auto w-full rounded-lg" />}
              <p className="truncate px-1 pt-2 text-xs text-[var(--ink-secondary)]" title={result.label}>{result.label}</p>
            </article>)}
          </MediaGallery>
          <Button variant="ghost" size="sm" onClick={() => openGenerate("history")}>Keep or reuse in Results</Button>
        </AssetGroup> : null}
        <div id={`library-panel-${activeTab}`} role="tabpanel" aria-label={tabs.find((tab) => tab.id === activeTab)?.label}>
        {activeTab === "stills" ? <AssetGroup title="Images" count={filteredGroups.stills.length} icon={<ImageIcon size={17} aria-hidden="true" />}>
          <MediaGallery>
            {filteredGroups.stills.map((asset) => <article key={asset.slot_id} className="min-w-0">
              {asset.source_url ? (() => {
                const image = <img src={thumbnailUrl(asset.source_url, 640)} alt="" loading={asset.width && asset.height ? "lazy" : undefined} decoding="async" width={asset.width ?? undefined} height={asset.height ?? undefined} style={asset.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined} data-media-preview className="block h-auto w-full rounded-lg object-contain" />;
                if (!generationOpen) return image;
                const identity = projectSource(asset.source_url) ?? (asset.is_catalog ? libraryReferenceIdentity(asset) : null);
                return identity ? <button type="button" className="library-reference-pick" disabled={preparing !== null} aria-busy={preparing === asset.slot_id} aria-label={`Use ${asset.library_annotation?.display_name ?? asset.name} as ${pickingRole ? `the ${pickingLabel}` : "a reference"}`}
                  onClick={() => void pickReference(asset.slot_id, identity, Boolean(asset.is_catalog))}>{image}<span className="library-reference-pick-label" aria-hidden="true">{preparing === asset.slot_id ? "Adding…" : "Use"}</span></button> : image;
              })() : <div className="aspect-video rounded-lg bg-[var(--chrome-deep)]" />}
              <div className="space-y-2 px-1 pt-2"><p className="truncate text-sm font-medium" title={asset.library_annotation?.display_name ?? asset.name}>{asset.library_annotation?.display_name ?? asset.name}</p><p className="text-xs text-[var(--ink-secondary)]">{SOURCE_LABELS[librarySourceOf(asset)]}{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}</p><AnnotationSummary annotation={asset.library_annotation} /></div>
            </article>)}
          </MediaGallery>
        </AssetGroup> : null}
        {activeTab === "videos" ? <AssetGroup title="Video" count={filteredGroups.videos.length} icon={<FilmIcon size={17} aria-hidden="true" />}>
          <MediaGallery targetHeight={videoView.size === "small" ? 160 : videoView.size === "large" ? 360 : 240} gap={20} minCardWidth={200} maxPerRow={Infinity /* Per row is no longer offered; an older saved choice is ignored. */}>{filteredGroups.videos.map((asset) => <article key={asset.slot_id} className="min-w-0 self-start">
            <div className="flex justify-center overflow-hidden rounded-xl bg-[var(--chrome-deep)]">
              {asset.source_url ? <video
                ref={node => { if (node) videoRefs.current.set(asset.slot_id, node); else videoRefs.current.delete(asset.slot_id); }}
                src={asset.source_url}
                muted
                loop
                controls
                playsInline
                // A clip not downloaded yet is fetched only when played, never by browsing.
                preload={asset.downloaded === false ? "none" : "metadata"}
                aria-label={`Preview ${asset.library_annotation?.display_name ?? asset.name}`}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration;
                  if (presentation && asset.matching_frames?.[0]) { event.currentTarget.pause(); event.currentTarget.currentTime = asset.matching_frames[0].time_seconds; }
                  if (Number.isFinite(duration) && duration > 0) setVideoDurations((current) => current[asset.slot_id] === duration ? current : { ...current, [asset.slot_id]: duration });
                }}
                onError={asset.downloaded === false ? () => toast.error("Could not download this clip. Check the connection and try again.") : undefined}
                width={asset.width ?? undefined}
                height={asset.height ?? undefined}
                style={asset.downloaded === false && asset.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
                data-media-preview className="block h-auto w-full object-contain"
              /> : <div className="p-6 text-sm text-[var(--ink-muted)]">Preview unavailable</div>}
            </div>
            <div className="min-w-0 space-y-3 px-1 pt-3"><p className="text-base font-semibold" title={asset.library_annotation?.display_name ?? asset.name}>{asset.library_annotation?.display_name ?? asset.name}</p><p className="text-xs text-[var(--ink-secondary)]">{SOURCE_LABELS[librarySourceOf(asset)]} · {formatDuration(asset.duration_seconds ?? videoDurations[asset.slot_id])}</p><VideoDetails>{asset.is_catalog ? <AnnotationSummary annotation={asset.library_annotation} /> : <VideoDescriptionSummary asset={asset} onSeek={time => { const video = videoRefs.current.get(asset.slot_id); if (video) { video.pause(); video.currentTime = time; video.scrollIntoView({ behavior: "smooth", block: "center" }); } }} onAnalyze={() => void analyzeVideo(asset)} />}</VideoDetails></div>
          </article>)}</MediaGallery>
        </AssetGroup> : null}
        {activeTab === "music" ? <AssetGroup title="Music" count={filteredGroups.music.length} icon={<Music4Icon size={17} aria-hidden="true" />}>
          <div className={`grid items-start gap-2 ${AUDIO_GRID[audioColumns]}`}>{filteredGroups.music.map((track) => <article key={track.track_id} className="rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-raised)] p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{track.track_name}</p>
                {track.source_status === "reference_only" ? <p className="mt-1 text-xs text-[var(--ink-secondary)]">Reference · rights unverified</p> : null}
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">{formatDuration(track.duration_seconds)}{track.energy ? ` · ${track.energy} energy` : ""}{track.tempo_bpm ? ` · ${track.tempo_bpm} BPM` : ""}{track.moods?.length ? ` · ${track.moods.join(", ")}` : ""}</p>
              </div>
              {track.source_url ? <button type="button" aria-expanded={inspectedTrack === track.track_id} onClick={() => { audioRef.current?.pause(); setPlayingUrl(null); setInspectedTrack(inspectedTrack === track.track_id ? null : track.track_id); }} className="h-9 shrink-0 rounded-md border border-[var(--edge-outline)] bg-[var(--chrome-deep)] px-3 text-xs font-medium">Inspect</button> : null}
              {renderPreviewButton(track)}
            </div>
            {!track.source_asset_id ? <AudioUseNotes track={track} showDescription={false} /> : null}
            {track.source_asset_id && track.source_url ? <LibrarySourceNotes projectId={projectId} assetId={track.source_asset_id} sourceUrl={track.source_url}/> : null}
            <WaveformPreview track={track} progress={playingUrl === track.source_url ? playingProgress : 0} onSeek={(fraction) => seekPreview(track, fraction)} />
            {inspectedTrack === track.track_id && track.source_url ? <LibraryRhythmInspector projectId={projectId} sourceUrl={track.source_url} trackName={track.track_name} onClose={() => setInspectedTrack(null)} /> : null}
          </article>)}</div>
        </AssetGroup> : null}
        {activeTab === "sfx" ? <AssetGroup title="Sounds" count={filteredGroups.sfx.length} icon={<Volume2Icon size={17} aria-hidden="true" />}>
          <div className={`grid items-start gap-2 ${AUDIO_GRID[audioColumns]}`}>{filteredGroups.sfx.map((track) => { const tags = displayTags(track.tags); return <article key={track.track_id} className="rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-raised)] p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">{track.access === "members" ? <CrownIcon size={14} className="shrink-0 text-[var(--premium)]" aria-label="Members" /> : null}{track.track_name}</p>
                <p className="mt-1 truncate text-xs text-[var(--ink-secondary)]" title={tags.join(", ")}>{formatDuration(track.duration_seconds)}{track.category ? ` · ${track.category}` : ""}{track.editorial?.motion ? ` · ${track.editorial.motion.replaceAll("_", " ")}` : ""}{track.editorial?.intensity ? ` · ${track.editorial.intensity}` : ""}{tags.length ? ` · ${tags.join(", ")}` : ""}</p>
              </div>
              {track.access === "members" && membersLocked
                ? <button type="button" aria-expanded={membershipFor === track.track_id} onClick={() => setMembershipFor(membershipFor === track.track_id ? null : track.track_id)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--edge-outline)] bg-[var(--chrome-deep)] px-3 text-xs font-medium text-[var(--ink)] hover:bg-[var(--chrome-panel)]"><CrownIcon size={14} aria-hidden="true" className="text-[var(--premium)]" />Members</button>
                : renderPreviewButton(track)}
            </div>
            {membershipFor === track.track_id && track.access === "members" && membersLocked ? <div className="mt-3 rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-deep)] p-3">
              {!cloud.account?.signed_in
                ? <div className="space-y-2 text-sm"><p className="text-[var(--ink)]">Sign in to use members&apos; sounds</p>{cloud.account?.pending ? <p role="status">Waiting for your browser</p> : <Button type="button" size="sm" disabled={cloud.busy} onClick={() => void cloud.act("sign_in")}>Sign in</Button>}</div>
                : membership?.offer ? <MembershipOffer membership={membership} /> : <p className="text-sm text-[var(--ink)]">For DreamCut members</p>}
            </div> : null}
            {!track.source_asset_id ? <AudioUseNotes track={track} /> : null}
            {track.source_asset_id && track.source_url ? <LibrarySourceNotes projectId={projectId} assetId={track.source_asset_id} sourceUrl={track.source_url}/> : null}
            {track.access === "members" && membersLocked ? null : <WaveformPreview track={track} progress={playingUrl === track.source_url ? playingProgress : 0} onSeek={(fraction) => seekPreview(track, fraction)} />}
          </article>; })}</div>
        </AssetGroup> : null}
        {activeTab === "videos" && !presentation && videoSearch ? <div className="flex gap-2">
          {videoOffset > 0 ? <button type="button" onClick={() => setVideoOffset(Math.max(0, videoOffset - 50))} className="rounded-md border border-[var(--edge-outline)] px-3 py-2 text-xs">Previous videos</button> : null}
          {videoSearch.next_offset !== null ? <button type="button" onClick={() => setVideoOffset(videoSearch.next_offset!)} className="rounded-md border border-[var(--edge-outline)] px-3 py-2 text-xs">More videos</button> : null}
        </div> : null}
        {activeTab === "exports" ? <LibraryExports active search={query} /> : null}
        {activeTab === "templates" ? <LibraryEffectCatalog projectId={projectId} active /> : null}
        {!ownBrowsing(activeTab) && activeCount === 0 && !videoSearchLoading ? <p className="rounded-lg border border-dashed border-[var(--edge-outline)] p-8 text-center text-sm text-[var(--ink-muted)]">No matching assets.</p> : null}
        </div>
      </> : null}
    </div>
    </div>
    {docked ? <aside className="library-generate-panel" style={{ width: panel.value }} aria-label="Generate panel">
      <WorkspaceResizeHandle label="Resize Generate panel" axis="x" reverse value={panel.value} min={360} max={panelMax} onChange={panel.change} onReset={panel.reset} style={{ left: -4, top: 0, bottom: 0 }} />
      {generateForm("docked")}
    </aside> : null}
    {LIBRARY_GENERATE_PRESENTATION === "drawer" ? generateForm("drawer") : null}
  </main>;
}
