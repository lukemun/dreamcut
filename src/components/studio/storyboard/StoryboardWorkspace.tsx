"use client";
import { Check, Clapperboard, FileUp, FolderUp, Library, Maximize2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { WorkspaceResizeHandle, usePanelSize } from "@/components/ui/workspace-resize";
import { toast } from "sonner";
import { useOptionalWorkspaceChrome } from "@/app/WorkspaceChrome";
import { AssetGenerationDrawer, type GenerationLaunch } from "../generation/AssetGenerationDrawer";
import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { useProjectReviewDock, useAgentSelection } from "@/components/desktop/ProjectReviewDock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InspectorHeading, InspectorDisclosure } from "../timeline/InspectorHierarchy";
import { FrameTagControls } from "../timeline/FrameTagControls";
import { StoryboardCanvas } from "./StoryboardCanvas";
import { MarkRow, MomentsTimeline } from "./MomentsTimeline";
import { MarkStrip } from "./MarkStrip";
import { markNote, markNumbers } from "@/lib/storyboard/canvas";
import { Seconds } from "./StoryboardSeconds";
import { ReferenceStoryboard } from "./ReferenceStoryboard";
import type { PlayerRef } from "@/lib/frame-runtime/player";
import { type StoryboardAsset, type StoryboardMark, type StoryboardShot } from "@/lib/storyboard/model";
import { useStoryboard } from "./useStoryboard";
import { StoryboardPreview } from "./StoryboardPreview";
import styles from "./storyboard.module.css";
import { StoryboardCardMedia } from "./StoryboardCardMedia";
import { MediaMembershipBadges } from "./MediaMembershipBadges";
import { AudioWorkspaceCard } from "./AudioWorkspaceCard";
import { SourceAudioTimeline } from "./SourceAudioTimeline";
import { readScriptDocument } from "@/lib/storyboard/script";
import { AssetShelf } from "../timeline/AssetShelf";
import { StoryboardPanels } from "./StoryboardPanels";
import { ScriptSection, type ScriptRangeSelection } from "./ScriptSection";
import { SelectionTray } from "../timeline/SelectionTray";
import { ShotNote } from "./ShotNote";
import { StoryCanvas } from "./StoryCanvas";
import { MEDIA_DRAG, StoryRows } from "./StoryRows";
import { ShotVisualsEditor } from "./ShotVisuals";
import { VideoTrimControls } from "./VideoTrimControls";
import { SourceVideoPlayer } from "@/lib/frame-runtime/source-video-player";
import { MediaGallery } from "@/components/ui/media-gallery";
import { OptionSelect } from "@/components/ui/select";
import { useKeyboardShortcuts } from "@/components/studio/hooks/useKeyboardShortcuts";
import { bindingMatches, OFF, shortcutLabel } from "@/lib/keyboard-shortcuts";

const MEDIA_FILTER_COUNT = 8;
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
function ShotDetails({ projectId, shot, asset, busy, patch, generate, visuals }: { projectId: string; shot: StoryboardShot; asset?: StoryboardAsset; busy: boolean; patch: (patch: Partial<StoryboardShot>) => void; generate: () => void; visuals: React.ReactNode }) {
  const [notesOpen, setNotesOpen] = useState(true);
  const source = useRef<PlayerRef>(null);
  const video = asset?.kind === "video", playable = video && (asset.ready || asset.previewReady);
  return <div className={styles.detailsBody}>
    {/* Closer inspection: video shows the whole source so the trim can move anywhere in it. */}
    {playable ? <SourceVideoPlayer key={asset.source} ref={source} src={asset.preview || asset.url} label={`Full source: ${asset.name}`} />
      : <StoryboardCardMedia asset={asset} start={shot.start} duration={shot.duration} label={shot.label} />}
    <label>Shot name<Input key={shot.label} aria-label="Shot name" defaultValue={shot.label} disabled={busy} maxLength={240} onBlur={e => { if (e.target.value !== shot.label) patch({ label: e.target.value }); }} /></label>
    {video ? <VideoTrimControls start={shot.start} duration={shot.duration} sourceDuration={asset.duration ?? 0} busy={busy} player={source} commit={patch} />
      : <Seconds key={`duration-${shot.duration}`} label="Duration" value={shot.duration} min={1 / 30} max={3600} disabled={busy} commit={duration => patch({ duration })} />}
    {visuals}
    <div className={styles.noteGroup}><span>What happens here?</span><ShotNote value={shot.note} label="Shot note" placeholder="Add a note…" maxLength={2000} projectId={projectId} save={note => patch({ note })} /></div>
    <div className={styles.noteGroup}><span>Transition into this shot</span><ShotNote value={shot.transitionNote ?? ""} label="Transition note" placeholder="Add a transition note…" maxLength={2000} projectId={projectId} save={transitionNote => patch({ transitionNote: transitionNote || undefined })} />{shot.transitionNote && <Button size="sm" variant="outline" className="justify-self-start" onClick={generate}>Generate assets</Button>}</div>
    <InspectorDisclosure title="Planning notes" open={notesOpen} onOpenChange={setNotesOpen}>
      <label>Text idea<textarea key={shot.text} aria-label="Text idea" defaultValue={shot.text} disabled={busy} maxLength={1000} onBlur={e => { if (e.target.value !== shot.text) patch({ text: e.target.value }); }} /></label>
    </InspectorDisclosure>
  </div>;
}

export function StoryboardWorkspace({ projectId }: { projectId: string }) {
  const api = useStoryboard(projectId), board = api.snapshot?.content;
  // The chat on this page sees the board: beats, chosen footage and what is still missing.
  const setPageContext = useProjectReviewDock()?.setPageContext;
  const name = (source?: string) => source ? api.assets.find(a => a.source === source)?.name ?? source : "";
  const boardContext = !board ? "" : [
    `Script: ${readScriptDocument(board).markdown}`,
    `Page: Storyboard (${board.mode === "reference" ? "following a reference video" : "freeform"}). ${board.sources.length} media items in the workspace.`,
    ...(board.mode === "reference" && board.reference ? [`Reference: ${name(board.reference.source)}. Beats (reference time · chosen footage):`,
      ...board.reference.beats.map((beat, index) => { const pick = beat.candidates.find(c => c.id === beat.selectedId);
        return `  ${index + 1}. ${beat.label} · ${beat.start.toFixed(2)}–${beat.end.toFixed(2)}s · ${pick ? name(pick.source) : "NO FOOTAGE"}${beat.text ? ` · text "${beat.text}"` : ""}${beat.note ? ` · note: ${beat.note}` : ""}`; })]
      : [`Shots in order: ${board.shots.map(shot => `${shot.label || name(shot.source)} (${shot.start.toFixed(1)}–${(shot.start + shot.duration).toFixed(1)}s${shot.script ? `; script: "${shot.script.slice(0, 160)}${shot.script.length > 160 ? "…" : ""}"` : ""}${shot.visuals?.length ? `; over it: ${shot.visuals.map(v => `${v.label} at +${v.at.toFixed(1)}s`).join(", ")}` : ""})`).join(", ") || "none yet"}`]),
    "When the creator asks you to storyboard, plan or break up their footage, follow the storyboard-drafting skill: storyboard_get, then storyboard_draft (one Undo step; never touches the timeline). The page shows the story as rows: each shot's picture beside its script. Screenshots, mockups or graphics shown while they talk go in a shot's visuals, not separate shots. Build timeline lays the board onto the timeline as a first assembly and stays their action. You may stage a generation draft for a missing shot with asset_generation_prepare. Generate only after the creator explicitly approves that draft in chat (asset_generation_submit); never approve proposals.",
  ].join("\n");
  useEffect(() => {
    if (!setPageContext || !boardContext) return;
    setPageContext({ key: "storyboard", label: "Storyboard", text: boardContext, tips: [
      "Describe the video and ask to break your footage into beats.",
      "Ask which beats still need footage, or how to tighten the pacing.",
      "Your beats and chosen footage come with every message.",
    ] });
  }, [setPageContext, boardContext]);
  useEffect(() => () => setPageContext?.(null), [setPageContext]);
  const referenceView = board?.mode === "reference";
  const independentStory = !referenceView || !!board?.reference?.independentStory;
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationLaunch] = useState<GenerationLaunch>();
  const files = useRef<HTMLInputElement>(null), folder = useRef<HTMLInputElement>(null), player = useRef<PlayerRef>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // A source is in the story as a shot or as a visual over one.
  const usesSource = (shot: StoryboardShot, source: string) => shot.source === source || Boolean(shot.visuals?.some(v => v.source === source));
  const inStory = (source: string) => storyShots.some(shot => usesSource(shot, source));
  const [search, setSearch] = useState(""), [sort, setSort] = useState("loaded");
  const [source, setSource] = useState<string | null>(null), [position, setPosition] = useState(0), [rangeStart, setRangeStart] = useState<number | null>(null);
  // A landscape source gets the full width with Marks below; a vertical one keeps Marks beside it.
  const [landscape, setLandscape] = useState(false);
  const fitSource = useCallback(({ width, height }: { width: number; height: number }) => setLandscape(width > height), []);
  const [mediaSelection, setMediaSelection] = useState<string[]>([]);
  const binHeight = usePanelSize(`dreamcut:storyboard-media-height:${projectId}`, 340, 160, 1200);
  const [scriptSelection, setScriptSelection] = useState<ScriptRangeSelection[]>([]);
  const [mediaType, setMediaType] = useState<"all" | "video" | "image" | "audio">("all");
  const [initialTime, setInitialTime] = useState(0);
  const [previewOpen,setPreviewOpen] = useState(false);
  const detailPanel = useRef<HTMLElement>(null);
  const [details, setDetails] = useState<string | null>(null), [appendClips, setAppendClips] = useState<number | null>(null);
  // The visual picker belongs to one shot, so opening another shot's details never shows it.
  const [visualPicker, setVisualPicker] = useState<string | null>(null), [visualFocus, setVisualFocus] = useState<string | null>(null);
  const openDetails = setDetails;
  const openVisual = (shotId: string, visualId?: string) => { setDetails(shotId); setVisualPicker(visualId ? null : shotId); setVisualFocus(visualId ?? null); };
  useEffect(() => {
    if (!visualFocus) return;
    const row = document.getElementById(`shot-visual-${visualFocus}`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" }); row?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
    setVisualFocus(null);
  }, [visualFocus, details]);
  const busy = api.busy, selectedAsset = api.assets.find(a => a.source === source), shot = board?.shots.find(s => s.id === details);
  const restoredSelection = useRef(false);
  useEffect(() => {
    if (api.snapshot && !restoredSelection.current) {
      restoredSelection.current = true;
      // A selection belongs to the tab that made it (as in Library): a reload keeps it, a new visit starts empty.
      const key = `dreamcut:storyboard-selection-started:${projectId}`;
      let started = true;
      try { started = sessionStorage.getItem(key) === "1"; sessionStorage.setItem(key, "1"); } catch { /* Keep the saved selection. */ }
      const saved = api.snapshot.selection?.sources ?? (api.snapshot.selection?.source ? [api.snapshot.selection.source] : []);
      if (started) setMediaSelection(saved); else if (saved.length) void api.selectMedia([]);
    }
  }, [api.snapshot]);
  const lookup = (s: string) => api.assets.find(a => a.source === s);
  useEffect(() => { if (api.notice) toast(api.notice); }, [api.notice]);
  // Selected media also appears as chat pills, so the creator sees what "this" will mean to the agent.
  const agentSelection = useAgentSelection(), replaceSelectionGroup = agentSelection?.replaceSelectionGroup;
  useEffect(() => {
    if (!replaceSelectionGroup) return;
    replaceSelectionGroup("storyboard-media", mediaSelection.map(source => {
      const asset = api.assets.find(a => a.source === source), label = asset?.name ?? source.split("/").pop() ?? source;
      const kind = asset?.kind === "image" ? "Photo" : asset?.kind === "audio" ? "Audio" : "Video";
      return { id: `storyboard-media:${source}`, group: "storyboard-media", kind, label, agentText: `Project ${kind.toLowerCase()} "${label}" (${source}) selected in Storyboard Media.`,
        onRemove: () => setMediaSelection(current => { const next = current.filter(item => item !== source); void api.selectMedia(next); return next; }) };
    }));
  }, [replaceSelectionGroup, mediaSelection, api.assets]);
  useEffect(() => () => replaceSelectionGroup?.("storyboard-media", []), [replaceSelectionGroup]);

  useEffect(() => { if (details) detailPanel.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [details]);
  // A plain click selects just this item (what "this" means in chat); ⌘/Ctrl/Shift-click adds or removes it.
  const selectMedia = (s: string, add = false) => {
    const next = add ? mediaSelection.includes(s) ? mediaSelection.filter(item => item !== s) : [...mediaSelection, s]
      : mediaSelection.length === 1 && mediaSelection[0] === s ? [] : [s];
    setMediaSelection(next); void api.selectMedia(next);
  };
  const chooseSource = (s: string, at = 0) => { setSource(s); setPreviewOpen(true); setInitialTime(at); setPosition(at); setRangeStart(null); setLandscape(false); };
  // The player's own frame, not the last reported time: M while playing marks what is on screen.
  const playhead = () => player.current ? player.current.getCurrentFrame() / 30 : position;
  const openClip = useCallback((s: string, at: number) => chooseSource(s, at), []); // eslint-disable-line react-hooks/exhaustive-deps -- chooseSource only sets state
  // The canvas's Moment button opens the selected clip (or the first video) to mark in.
  const addMoment = () => {
    const pick = mediaSelection.map(lookup).find(a => a && a.kind !== "audio") ?? api.assets.find(a => a.kind === "video");
    if (pick) chooseSource(pick.source); else toast("Add a video in Media first, then mark moments in it.");
  };
  const saveMark = (end: number | null) => {
    if (!source) return;
    const start = end === null ? playhead() : rangeStart ?? playhead();
    // Marks are numbered as in the editor (M1, M2…); a name is the mark's optional note.
    void api.saveMark({ id: crypto.randomUUID(), source, label: "", start: selectedAsset?.kind === "image" ? 0 : start, end });
    setRangeStart(null);
  };
  const sourceMarks = board?.marks.filter(m => m.source === source) ?? [];
  // One number per mark across the board (M1, M2…), matching its card on the canvas.
  const numbers = board ? markNumbers(board) : new Map<string, number>();
  const jump = (mark: StoryboardMark) => { player.current?.seekTo(Math.round(mark.start * 30)); setPosition(mark.start); };
  const storyShots = board?.mode === "reference" && !board.reference?.independentStory ? board.reference?.beats.flatMap(b => b.candidates.filter(c => c.id === b.selectedId)) ?? [] : board?.shots ?? [];
  const shortcuts = useKeyboardShortcuts();
  const keyTitle = (label: string, binding: string) => binding === OFF ? label : `${label} (${shortcutLabel(binding)})`;
  const chrome = useOptionalWorkspaceChrome(), setPageHistory = chrome?.setPageHistory;
  const canUndo = !busy && !!api.snapshot?.canUndo, canRedo = !busy && !!api.snapshot?.canRedo;
  // Storyboard Undo/Redo by keyboard, except while typing, where the field keeps its own undo.
  const historyKeys = useRef({ undo: api.undo, redo: api.redo, canUndo: false, canRedo: false, busy, shortcuts });
  historyKeys.current = { undo: api.undo, redo: api.redo, canUndo: !!api.snapshot?.canUndo, canRedo: !!api.snapshot?.canRedo, busy, shortcuts };
  // The header's Undo/Redo call through the ref: api's functions change every render, availability does not.
  useEffect(() => { setPageHistory?.({ undo: () => void historyKeys.current.undo(), redo: () => void historyKeys.current.redo(), canUndo, canRedo }); }, [setPageHistory, canUndo, canRedo]);
  useEffect(() => () => setPageHistory?.(null), [setPageHistory]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isRedo = bindingMatches(e, historyKeys.current.shortcuts.redo);
      if (!isRedo && !bindingMatches(e, historyKeys.current.shortcuts.undo)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']")) return;
      const keys = historyKeys.current; if (keys.busy) return;
      e.preventDefault();
      if (isRedo) { if (keys.canRedo) void keys.redo(); } else if (keys.canUndo) void keys.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const scriptMarks = board ? readScriptDocument(board).marks : [];
  const linkedSections = (source: string) => scriptMarks.filter(m => m.visuals?.includes(source)).map(m => m.label);
  const removeFromVisuals = (a: StoryboardAsset) => void api.edit(content => ({ ...content, sources: content.sources.filter(source => source !== a.source) }))
    .then(() => toast(`Removed “${a.name}” from Visuals`, { duration: 10000, action: { label: "Undo", onClick: () => void api.undo() } }));
  const inVisuals = (source: string) => !!board?.sources.includes(source);
  const filtered = (list: StoryboardAsset[]) => list.filter(a => mediaType === "all" || a.kind === mediaType).filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "imported" ? (a.importedAt ?? "").localeCompare(b.importedAt ?? "") : 0);
  const binAssets = filtered(api.assets), visualAssets = (board?.sources ?? []).map(lookup).filter((a): a is StoryboardAsset => !!a);
  // One card for both places: in Media (everything in the project) it offers Add to Visuals; in Visuals it can be removed.
  const card = (a: StoryboardAsset, place: "media" | "visuals") => {
    const used = storyShots.filter(s => usesSource(s, a.source)).length, linked = linkedSections(a.source), added = inVisuals(a.source);
    // Freeform boards: cards drag down into the rows (a photo or video, not audio).
    const draggable = !referenceView && place === "media" && a.kind !== "audio";
    return <article className={styles.mediaCard} data-active={mediaSelection.includes(a.source)} key={a.source} draggable={draggable || undefined}
      onDragStart={draggable ? event => { event.dataTransfer.setData(MEDIA_DRAG, a.source); event.dataTransfer.effectAllowed = "copy"; } : undefined}>
      {/* Clicking the picture or name selects it for chat and for Link (the editor panels' convention). */}
      <div className={styles.mediaOpen} onClick={event => { if (!(event.target as HTMLElement).closest("button, a, input, label, video[controls]")) selectMedia(a.source, event.metaKey || event.ctrlKey || event.shiftKey); }}><StoryboardCardMedia asset={a} />
        {place === "media" && !referenceView && <Button className={styles.cardPill} size="sm" variant="secondary" disabled={busy || a.kind === "audio"} aria-label={`Add ${a.name} as a row`} onClick={() => void api.rows.add(a.source)}><Plus aria-hidden="true" />Row</Button>}
        {place === "media" && referenceView && (added ? <span className={styles.cardPill} data-done="true"><Check aria-hidden="true" />In Visuals</span>
          : <Button className={styles.cardPill} size="sm" variant="secondary" disabled={busy || a.kind === "audio"} aria-label={`Add ${a.name} to Visuals`} onClick={() => void api.load([a.source])}><Plus aria-hidden="true" />Visuals</Button>)}
      </div>
      <button type="button" className={styles.mediaName} aria-pressed={mediaSelection.includes(a.source)} title={a.name} onClick={event => selectMedia(a.source, event.metaKey || event.ctrlKey || event.shiftKey)}>{a.name}</button>
      {place === "visuals" && linked.length > 0 && <p className={styles.linkedTo} title={linked.join(", ")}>Linked to {linked.join(", ")}</p>}
      {a.preparationState === "preparing" && <p className={styles.muted} role="status">{a.previewReady ? "Preview ready · full quality preparing in background" : a.preparationStage === "preview" ? "Preparing browsing preview…" : a.preparationStage === "full_quality" ? "Preparing full-quality media…" : "Preview queued…"}</p>}
      {a.preparationState === "failed" && <p className={styles.muted}>{a.previewReady ? "Preview ready · full-quality preparation failed. Open to retry." : "Preparation failed. Open to retry."}</p>}
      <div className={styles.cardActions}>
        <span className={styles.cardDuration}>{a.kind === "image" ? "Photo" : a.duration ? time(a.duration) : "Video"}{a.generated ? " · Generated" : ""}</span>
        {place === "visuals" && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${a.name} from Visuals`} title={used || board?.reference?.source === a.source ? "Used in the storyboard" : "Remove from Visuals"} disabled={busy || used > 0 || board?.reference?.source === a.source} onClick={() => removeFromVisuals(a)}><Trash2 aria-hidden="true" /></Button>}
        <Button size="icon-sm" variant="ghost" title="Review and mark moments" aria-label={`Review and mark moments in ${a.name}`} onClick={() => chooseSource(a.source)}><Maximize2 aria-hidden="true" /></Button>
      </div>
    </article>;
  };
  const gallery = (list: StoryboardAsset[], place: "media" | "visuals") => <>
    {list.some(a => a.kind === "audio") && <div className={styles.audioList}>{list.filter(a => a.kind === "audio").map(a => <AudioWorkspaceCard key={a.source} asset={a} selected={mediaSelection.includes(a.source)} onSelect={add => selectMedia(a.source, add)} onOpen={() => chooseSource(a.source)} onRemove={place === "visuals" && !busy && !inStory(a.source) ? () => removeFromVisuals(a) : undefined} />)}</div>}
    <MediaGallery className={styles.grid} targetHeight={120} minCardWidth={150}>{list.filter(a => a.kind !== "audio").map(a => card(a, place))}</MediaGallery>
  </>;
  // Assemble asks the agent to lay the storyboard onto the timeline as proposal cards the creator approves;
  // it never writes the timeline itself. Desktop hands the request to the chat; elsewhere it is copied.
  const dock = useProjectReviewDock();
  const assembleRequest = "Assemble this storyboard on the timeline as proposal cards I can approve: my talking take, each linked visual during its script section, and the treatments I asked for.";
  const assemble = <Button size="sm" variant="outline" title={dock ? "Ask the agent to assemble" : "Copy a request for your agent"} onClick={() => {
      if (dock) { dock.askAgent({ id: crypto.randomUUID(), text: assembleRequest, display: "Assemble this storyboard", label: "Assemble" }); return; }
      void navigator.clipboard?.writeText(assembleRequest).then(() => toast("Copied. Paste it to your agent."), () => toast(assembleRequest));
    }}><Clapperboard aria-hidden="true" />Assemble</Button>;
  const storyActions = <>{assemble}{agentSelection && <SelectionTray placement="below" selections={agentSelection.selections} onRemove={agentSelection.removeSelection} onClear={agentSelection.clearSelections} ghostButtonClassName="text-[var(--ink)]" />}</>;
  // Media: everything brought into the project, above the Storyboard. New files and Library picks land here only.
  const mediaBin = !board ? null : <section className={styles.bin} aria-label="Media" style={{ height: binHeight.value }}
      onKeyDown={e => { if (e.key === "Escape" && libraryOpen) { e.preventDefault(); e.stopPropagation(); setLibraryOpen(false); } }}
      onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = busy ? "none" : "copy"; e.currentTarget.dataset.dragging = "true"; } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) delete e.currentTarget.dataset.dragging; }}
      onDrop={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.stopPropagation(); delete e.currentTarget.dataset.dragging; if (!busy) void api.upload(Array.from(e.dataTransfer.files), false); } }}>
    <div className={styles.binHeader}>
      <InspectorHeading>Media</InspectorHeading><span className={styles.count}>{api.assets.length}</span>
      {!libraryOpen && api.assets.length > MEDIA_FILTER_COUNT && <>
        <SegmentedControl size="sm" aria-label="Media type">{([["all", "All"], ["video", "Video"], ["image", "Photos"], ["audio", "Audio"]] as const).map(([key,label]) => <button key={key} aria-pressed={mediaType === key} onClick={() => setMediaType(key)}>{label}</button>)}</SegmentedControl>
        <Input className={styles.search} aria-label="Search media" placeholder="Search media" value={search} onChange={e => setSearch(e.target.value)} />
        <span className={styles.binSort}><OptionSelect label="Sort media" value={sort} onValueChange={setSort} options={[{ value: "loaded", label: "Order added" }, { value: "imported", label: "Import time" }, { value: "name", label: "Name" }]} /></span>
      </>}
      <span className={styles.spacer} />
      {libraryOpen ? <Button size="sm" onClick={() => setLibraryOpen(false)}>Back to Media</Button>
        : <ActionMenu trigger={<Button size="sm" variant="outline" disabled={busy}><Plus />Add media</Button>}>
          <ActionMenuItem icon={<Library />} onClick={() => setLibraryOpen(true)}>From Library</ActionMenuItem>
          <ActionMenuItem icon={<FileUp />} onClick={() => files.current?.click()}>Files…</ActionMenuItem>
          <ActionMenuItem icon={<FolderUp />} onClick={() => folder.current?.click()}>Folder…</ActionMenuItem>
          <ActionMenuItem icon={<RefreshCw />} onClick={() => void api.refresh()}>Check for new files</ActionMenuItem>
        </ActionMenu>}
    </div>
    <div className={styles.binBody}>
      {libraryOpen ? <div id="storyboard-library" className={styles.inlineLibrary}>
        <AssetShelf projectId={projectId} open width={800} onWidthChange={() => {}} onClose={() => setLibraryOpen(false)} beats={[]} drawerMode hideClose workflowPanes={["browse"]} showAdvancedTools={false}
          mediaPicker={{ onChoose: async () => { await api.refresh(); }, chosen: api.assets.map(a => a.source) }} onLibraryChanged={() => { void api.refresh(); }} />
      </div>
      : !api.assets.length ? <div className={styles.empty}><h2>Drop media here</h2><div className={styles.emptyActions}>
          <Button onClick={() => setLibraryOpen(true)} disabled={busy}><Library aria-hidden="true" />From Library</Button>
          <Button variant="outline" onClick={() => files.current?.click()} disabled={busy}><FileUp aria-hidden="true" />Choose files</Button>
        </div></div>
      : <>{gallery(binAssets, "media")}{!binAssets.length && <p className={styles.empty}>No media matches this view.</p>}</>}
    </div>
    <WorkspaceResizeHandle label="Resize Media height" axis="y" value={binHeight.value} min={160} max={1200} onChange={binHeight.change} onReset={binHeight.reset} style={{ position: "relative", flex: "0 0 10px", width: "100%" }} />
  </section>;
  // Visuals: what this storyboard plans to show, picked from Media and linked to the script.
  const visualsContent = !board ? null : !visualAssets.length ? <div className={styles.empty}><h2>No visuals yet</h2></div> : gallery(visualAssets, "visuals");
  return <main className={styles.workspace} aria-label="Storyboard workspace">
    {/* Workspaces carry no page title or toolbar row: each control sits in the section it changes. */}
    <input ref={files} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,.m4v" onChange={e => { void api.upload(Array.from(e.target.files ?? []), false); e.target.value = ""; }} />
    <input ref={folder} type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={e => { void api.upload(Array.from(e.target.files ?? []), false); e.target.value = ""; }} />
    {api.error && <div role="alert" className={styles.error}>{api.error}</div>}
    {busy && <p role="status" className={styles.status}>Saving…</p>}
    {!api.snapshot && <p role="status">Loading workspace…</p>}
    {/* Nothing below renders until the board loads, so no empty story flashes first. */}
    {api.snapshot && <div className={styles.mainBody}>
      <div className={styles.content}>

        {mediaBin}
        {!referenceView ? <StoryRows projectId={projectId} api={api} lookup={lookup} openDetails={openDetails} actions={storyActions} />
        : <StoryboardPanels key={projectId} projectId={projectId}
          actions={storyActions}
          defaultLayout={{ rows: referenceView
          ? [{ height: 640, panels: [{ id: "script", width: .5 }, { id: "visuals", width: .5 }] }, { height: 560, panels: [{ id: "reference", width: 1 }] }]
          : [{ height: 760, panels: [{ id: "canvas", width: 1 }] }] }} panels={[
          { id: "timeline", title: "Timeline", height: 720, content: <MomentsTimeline projectId={projectId} api={api} lookup={lookup} openClip={openClip} addMoment={addMoment} /> },
          { id: "canvas", title: "Canvas", height: 720, content: <StoryboardCanvas projectId={projectId} api={api} lookup={lookup} openClip={openClip} addMoment={addMoment} /> },
          { id: "script", title: "Script", height: 640, content: <ScriptSection api={api} selection={scriptSelection} setSelection={setScriptSelection} mediaSelection={mediaSelection} lookup={lookup} /> },
          { id: "visuals", title: "Visuals", count: board?.sources.length ?? 0, height: 640, content: visualsContent },
          { id: "reference", title: "Reference", height: 560, content: <ReferenceStoryboard projectId={projectId} api={api} layout="column" lead={null} history={null} /> },
          ...(independentStory ? [{ id: "story", title: "Story", height: 460, content: <StoryCanvas projectId={projectId} api={api} lookup={lookup} lead={<></>} history={undefined} details={details} openDetails={openDetails} openVisual={openVisual} markMoments={s => chooseSource(s.source, s.start)}
          toolbar={null} /> }] : []),
        ]} />}
        <Dialog.Root open={previewOpen && !!selectedAsset} onOpenChange={setPreviewOpen}>
          <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-(--layer-dialog-backdrop) bg-black/70" /><Dialog.Viewport className="editor-chrome fixed inset-0 z-(--layer-dialog) grid place-items-center overflow-auto p-4"><Dialog.Popup className={styles.clipDialog}
            // M marks the current moment, as in the editor; audio's source timeline handles its own M.
            onKeyDown={event => {
              if (event.key.toLowerCase() !== "m" || event.metaKey || event.ctrlKey || event.altKey || event.repeat || selectedAsset?.kind === "audio") return;
              if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]') || busy || !(selectedAsset?.ready || selectedAsset?.previewReady)) return;
              event.preventDefault(); saveMark(null);
            }}>
          {selectedAsset && <><div className={styles.sectionBar}><Dialog.Title>{selectedAsset.name}</Dialog.Title><Dialog.Close render={<Button variant="ghost" />}>Close</Dialog.Close></div>
          <MediaMembershipBadges asset={selectedAsset} inStory={!!storyShots.some(shot => shot.source === selectedAsset.source)} />
          {selectedAsset.previewReady && !selectedAsset.ready && <p role="status" className={styles.muted}>Preview ready. {selectedAsset.preparationState === "failed" ? <>Full-quality preparation failed. <Button size="sm" variant="outline" onClick={() => void api.prepare(selectedAsset.source)}>Retry preparation</Button></> : "Full quality is preparing."}</p>}
          {selectedAsset.kind === "audio" && selectedAsset.assetId ? <SourceAudioTimeline key={selectedAsset.source} projectId={projectId} assetId={selectedAsset.assetId} sourceUrl={selectedAsset.url} name={selectedAsset.name} duration={selectedAsset.duration ?? 0} /> : <div className={styles.sourceColumns} data-landscape={landscape || undefined}><div className={styles.viewerColumn}><div className={styles.viewer}>
            {(selectedAsset.ready || selectedAsset.previewReady) ? selectedAsset.kind === "image" ? <img src={selectedAsset.preview || selectedAsset.url} alt={selectedAsset.name} onLoad={e => fitSource({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} /> : <StoryboardPreview key={source} projectId={projectId} source={source!} revision={0} player={player} onTime={setPosition} initialTime={initialTime} onDimensions={fitSource} fill />
              : <div>{selectedAsset.error && <p>{selectedAsset.error}</p>}<Button disabled={busy} onClick={() => void api.prepare(selectedAsset.source)}>Prepare preview</Button></div>}
          </div>
          {selectedAsset.kind === "video" && !!selectedAsset.duration && <MarkStrip duration={selectedAsset.duration} position={position} rangeStart={rangeStart}
            marks={sourceMarks.map(m => ({ id: m.id, label: `M${numbers.get(m.id)}`, time: m.start, ...(m.end !== null ? { end: m.end } : {}), note: markNote(m) }))}
            onSeek={at => { player.current?.seekTo(Math.round(at * 30)); setPosition(at); }} onSelect={id => { const mark = sourceMarks.find(m => m.id === id); if (mark) jump(mark); }} />}
          </div><div className={styles.markColumn}>
            <ol className={styles.momentsList} style={{ ["--moment-frame" as string]: "96px" }} aria-label={`Marks in ${selectedAsset.name}`}>
              {sourceMarks.map(m => <MarkRow key={m.id} mark={m} number={numbers.get(m.id)!} asset={selectedAsset} projectId={projectId} api={api} onOpen={() => jump(m)} />)}
            </ol>
            {!sourceMarks.length && <p className={styles.muted}>Press M (or the bookmark below) to mark the moment on screen.</p>}
          <div className={styles.markRow}>
            <FrameTagControls tags={sourceMarks.map((m, index) => ({ id: m.id, label: `M${numbers.get(m.id) ?? index + 1}`, timeline_seconds: m.start, end_seconds: m.end, note: markNote(m) }))}
              busy={busy || !(selectedAsset.ready || selectedAsset.previewReady)} addLabel="Mark this moment (M)"
              onAdd={() => saveMark(null)} onSeek={(_, id) => { const mark = sourceMarks.find(m => m.id === id); if (mark) jump(mark); }}
              onRemove={id => void api.removeMark(id)} onClear={() => void api.clearMarks(selectedAsset.source)}
              onUpdate={(id, { note }) => { const mark = sourceMarks.find(m => m.id === id); if (mark && note !== undefined) void api.saveMark({ ...mark, note: note.trim() }); }}
              ghostButtonClassName="" />
            {selectedAsset.kind === "video" && <Button size="sm" variant="ghost" disabled={busy || !(selectedAsset.ready || selectedAsset.previewReady) || (rangeStart !== null && position <= rangeStart)} onClick={() => rangeStart === null ? setRangeStart(playhead()) : saveMark(playhead())}>{rangeStart === null ? "Start range" : "End range"}</Button>}
            {rangeStart !== null && <Button size="sm" variant="ghost" onClick={() => setRangeStart(null)}>Cancel range</Button>}
            <span role="status" className="tabular-nums">{rangeStart !== null ? `Range from ${time(rangeStart)}` : time(position)}</span>
          </div></div></div>}</>}
          </Dialog.Popup></Dialog.Viewport></Dialog.Portal>
        </Dialog.Root>
      </div>
      {shot && <aside ref={detailPanel} className={styles.details} aria-label="Shot details"><div className={styles.sectionBar}><InspectorHeading>Shot details</InspectorHeading><Button variant="ghost" onClick={() => openDetails(null)}>Close</Button></div><Button size="sm" variant="ghost" onClick={() => chooseSource(shot.source, shot.start)}>Mark moments in this clip</Button><ShotDetails key={shot.id} projectId={projectId} shot={shot} asset={lookup(shot.source)} busy={busy} patch={patch => void api.patchShot(shot.id, patch)} generate={() => setGenerationOpen(true)}
        visuals={<ShotVisualsEditor shot={shot} api={api} lookup={lookup} busy={busy} picking={visualPicker === shot.id} setPicking={open => setVisualPicker(open ? shot.id : null)} />} /></aside>}
    </div>}
    <Dialog.Root open={appendClips !== null} onOpenChange={open => { if (!open) setAppendClips(null); }}>
      <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-(--layer-dialog-backdrop) bg-black/70" /><Dialog.Viewport className="editor-chrome fixed inset-0 z-(--layer-dialog) grid place-items-center p-4"><Dialog.Popup className="grid w-full max-w-sm gap-4 rounded-xl border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-5 text-[var(--ink)]">
        <Dialog.Title className="m-0 text-[length:var(--ui-text-heading)] font-semibold">Your timeline has {appendClips} {appendClips === 1 ? "clip" : "clips"}</Dialog.Title>
        <Dialog.Description className="m-0 text-[var(--ink-secondary)]">Add the storyboard after them?</Dialog.Description>
        <div className="flex justify-end gap-2"><Dialog.Close render={<Button variant="ghost" />}>Cancel</Dialog.Close><Button disabled={busy} onClick={() => { setAppendClips(null); void api.build(true); }}>Add after</Button></div>
      </Dialog.Popup></Dialog.Viewport></Dialog.Portal>
    </Dialog.Root>
    <AssetGenerationDrawer launch={generationLaunch} projectId={projectId} open={generationOpen} onClose={() => setGenerationOpen(false)} onLibraryChanged={() => { void api.refresh(); }} />
  </main>;
}
