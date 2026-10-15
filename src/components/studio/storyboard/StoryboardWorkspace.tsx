"use client";
import { ChevronRight, FileUp, FolderUp, Library, Maximize2, Plus, Redo2, Undo2 } from "lucide-react";
import { AssetGenerationDrawer, type GenerationLaunch } from "../generation/AssetGenerationDrawer";
import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useRef, useState } from "react";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { useProjectReviewDock } from "@/components/desktop/ProjectReviewDock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InspectorHeading, InspectorItemHeader, InspectorDisclosure } from "../timeline/InspectorHierarchy";
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
import { ShotNote } from "./ShotNote";
import { StoryCanvas } from "./StoryCanvas";
import { ShotVisualsEditor } from "./ShotVisuals";
import { VideoTrimControls } from "./VideoTrimControls";
import { SourceVideoPlayer } from "@/lib/frame-runtime/source-video-player";
import { MediaGallery } from "@/components/ui/media-gallery";

const MEDIA_PREVIEW_COUNT = 8;
const mediaOpenKey = (projectId: string) => `dreamcut:storyboard-media-open:${projectId}`;
/**
 * Media folds away once the story has shots, so the story is the page; a viewer's own
 * choice is kept per project. A reading preference, never board content or Undo.
 */
function useMediaOpen(projectId: string, hasShots: boolean | undefined) {
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => { try { const value = localStorage.getItem(mediaOpenKey(projectId)); setSaved(value === null ? null : value === "true"); } catch { /* Default. */ } }, [projectId]);
  const open = saved ?? !hasShots;
  return [open, (next: boolean) => { setSaved(next); try { localStorage.setItem(mediaOpenKey(projectId), String(next)); } catch { /* This visit only. */ } }] as const;
}
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
    `Page: Storyboard (${board.mode === "reference" ? "following a reference video" : "freeform"}). ${board.sources.length} media items in the workspace.`,
    ...(board.mode === "reference" && board.reference ? [`Reference: ${name(board.reference.source)}. Beats (reference time · chosen footage):`,
      ...board.reference.beats.map((beat, index) => { const pick = beat.candidates.find(c => c.id === beat.selectedId);
        return `  ${index + 1}. ${beat.label} · ${beat.start.toFixed(2)}–${beat.end.toFixed(2)}s · ${pick ? name(pick.source) : "NO FOOTAGE"}${beat.text ? ` · text "${beat.text}"` : ""}${beat.note ? ` · note: ${beat.note}` : ""}`; })]
      : [`Shots in order: ${board.shots.map(shot => `${shot.label || name(shot.source)} (${shot.duration.toFixed(1)}s${shot.visuals?.length ? `; over it: ${shot.visuals.map(v => `${v.label} at +${v.at.toFixed(1)}s`).join(", ")}` : ""})`).join(", ") || "none yet"}`]),
    "When the creator asks you to storyboard, plan or break up their footage, follow the storyboard-drafting skill: storyboard_get, then storyboard_draft (one Undo step; never touches the timeline). Screenshots, mockups or graphics shown while they talk go in a shot's visuals, not separate shots. Build timeline lays the board onto the timeline as a first assembly and stays their action. You may stage a generation draft for a missing shot with asset_generation_prepare. Generate only after the creator explicitly approves that draft in chat (asset_generation_submit); never approve proposals.",
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
  const [libraryOpen, setLibraryOpen] = useState(false), [picked, setPicked] = useState<string[]>([]);
  // A source is in the story as a shot or as a visual over one.
  const usesSource = (shot: StoryboardShot, source: string) => shot.source === source || Boolean(shot.visuals?.some(v => v.source === source));
  const inStory = (source: string) => storyShots.some(shot => usesSource(shot, source));
  const [view, setView] = useState<"all" | "added" | "unused">("all"), [search, setSearch] = useState(""), [sort, setSort] = useState("loaded");
  const [source, setSource] = useState<string | null>(null), [position, setPosition] = useState(0), [rangeStart, setRangeStart] = useState<number | null>(null), [markLabel, setMarkLabel] = useState("");
  const [mediaSelection, setMediaSelection] = useState<string[]>([]);
  // The page is the one scroll area; long media lists fold so the story stays near.
  const [showAllMedia, setShowAllMedia] = useState(false);
  const [mediaOpen, setMediaOpen] = useMediaOpen(projectId, board ? board.shots.length > 0 : undefined);
  const mediaShown = mediaOpen || !board?.sources.length;
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
      setMediaSelection(api.snapshot.selection?.sources ?? (api.snapshot.selection?.source ? [api.snapshot.selection.source] : []));
    }
  }, [api.snapshot]);
  const lookup = (s: string) => api.assets.find(a => a.source === s);

  useEffect(() => { if (details) detailPanel.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [details]);
  const selectMedia = (s: string) => {
    const next = mediaSelection.includes(s) ? mediaSelection.filter(item => item !== s) : [...mediaSelection, s];
    setMediaSelection(next); void api.selectMedia(next);
  };
  const chooseSource = (s: string, at = 0) => { setSource(s); setPreviewOpen(true); setInitialTime(at); setPosition(at); setRangeStart(null); setMarkLabel(""); };
  const saveMark = (end: number | null) => {
    if (!source) return;
    const start = end === null ? position : rangeStart ?? position;
    void api.saveMark({ id: crypto.randomUUID(), source, label: markLabel.trim() || (end === null ? "Saved moment" : "Saved range"), start: selectedAsset?.kind === "image" ? 0 : start, end });
    setRangeStart(null); setMarkLabel("");
  };
  const jump = (mark: StoryboardMark) => { player.current?.seekTo(Math.round(mark.start * 30)); setPosition(mark.start); };
  const storyShots = board?.mode === "reference" && !board.reference?.independentStory ? board.reference?.beats.flatMap(b => b.candidates.filter(c => c.id === b.selectedId)) ?? [] : board?.shots ?? [];
  const loaded = (board?.sources ?? []).map(lookup).filter((a): a is StoryboardAsset => !!a)
    .filter(a => mediaType === "all" || a.kind === mediaType)
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()) && (view !== "added" || inStory(a.source)) && (view !== "unused" || !inStory(a.source)))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "imported" ? (a.importedAt ?? "").localeCompare(b.importedAt ?? "") : 0);
  const modeSwitch = <SegmentedControl aria-label="Storyboard mode">
    {([["freeform", "Freeform"], ["reference", "Follow reference"]] as const).map(([mode, label]) => <button key={mode} disabled={busy || !board} aria-pressed={board?.mode === mode || (mode === "freeform" && !board?.mode)} onClick={() => { setDetails(null); void api.edit(content => ({ ...content, mode })); }}>{label}</button>)}
  </SegmentedControl>;
  const history = <>
    <Button variant="ghost" size="icon-sm" aria-label="Undo" title="Undo (⌘Z)" disabled={busy || !api.snapshot?.canUndo} onClick={() => void api.undo()}><Undo2 /></Button>
    <Button variant="ghost" size="icon-sm" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={busy || !api.snapshot?.canRedo} onClick={() => void api.redo()}><Redo2 /></Button>
  </>;
  // Storyboard Undo/Redo by keyboard, except while typing, where the field keeps its own undo.
  const historyKeys = useRef({ undo: api.undo, redo: api.redo, canUndo: false, canRedo: false, busy });
  historyKeys.current = { undo: api.undo, redo: api.redo, canUndo: !!api.snapshot?.canUndo, canRedo: !!api.snapshot?.canRedo, busy };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']")) return;
      const keys = historyKeys.current; if (keys.busy) return;
      e.preventDefault();
      if (e.shiftKey) { if (keys.canRedo) void keys.redo(); } else if (keys.canUndo) void keys.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <main className={styles.workspace} aria-label="Storyboard workspace">
    {/* Workspaces carry no page title or toolbar row: each control sits in the section it changes. */}
    <input ref={files} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,.m4v" onChange={e => { void api.upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    <input ref={folder} type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={e => { void api.upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    {api.error && <div role="alert" className={styles.error}>{api.error}</div>}
    {(busy || api.notice) && <p role="status" className={styles.status}>{busy ? "Saving / preparing… " : ""}{api.notice}</p>}
    {!api.snapshot && <p role="status">Loading workspace…</p>}
    {libraryOpen && <section className={styles.library} aria-label="Choose media">
      <InspectorItemHeader title="Choose media from this project" actions={<><Button size="sm" variant="ghost" onClick={() => { setLibraryOpen(false); setPicked([]); }}>Close</Button><Button size="sm" variant="ghost" onClick={() => setPicked(api.assets.filter(a => !board?.sources.includes(a.source)).map(a => a.source))}>Select all</Button><Button size="sm" disabled={busy || !picked.length} onClick={() => { void api.load(picked); setLibraryOpen(false); }}>Load {picked.length || "selected"}</Button></>} />
      <MediaGallery className={styles.libraryGrid} targetHeight={150}>{api.assets.map(a => <label key={a.source} className={styles.libraryItem}>
        <input type="checkbox" checked={picked.includes(a.source) || !!board?.sources.includes(a.source)} disabled={busy || board?.sources.includes(a.source)} onChange={e => setPicked(p => e.target.checked ? [...p, a.source] : p.filter(s => s !== a.source))} />
        <StoryboardCardMedia asset={a} playable={false} /><span>{a.name}{board?.sources.includes(a.source) ? " · Loaded" : a.generated ? " · Generated" : ""}</span>
      </label>)}</MediaGallery>
      {!api.assets.length && <p>No media yet.</p>}
    </section>}
    {/* Nothing below renders until the board loads, so no empty story flashes first. */}
    {api.snapshot && <div className={styles.mainBody}>
      <div className={styles.content}>

        <section className={styles.footage} aria-label="Media workspace">

          {mediaShown && mediaSelection.length > 0 && <p className={styles.muted}>{mediaSelection.length} selected</p>}
          <div className={`${styles.sectionBar} ${styles.mediaBar}`}><InspectorHeading>{board?.sources.length
            ? <button type="button" className={styles.mediaToggle} aria-expanded={mediaShown} aria-controls="storyboard-media" onClick={() => setMediaOpen(!mediaShown)}><ChevronRight aria-hidden="true" />Media <span className={styles.count}>{board.sources.length}</span></button>
            : <>Media <span className={styles.count}>0</span></>}</InspectorHeading>
            {mediaShown && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void api.refresh()}>Refresh</Button>}
            {mediaShown && mediaSelection.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setMediaSelection([]); void api.selectMedia([]); }}>Clear selection</Button>}
            {mediaShown && !!board?.sources.length && <>
            <SegmentedControl size="sm" aria-label="Media type">{([["all", "All"], ["video", "Video"], ["image", "Photos"], ["audio", "Audio"]] as const).map(([key,label]) => <button key={key} aria-pressed={mediaType === key} onClick={() => setMediaType(key)}>{label}</button>)}</SegmentedControl>
            <SegmentedControl size="sm" aria-label="Filter media">{([['all', 'All media'], ['added', 'Added'], ['unused', 'Unused']] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</SegmentedControl>
            <Input className={styles.search} aria-label="Search media" placeholder="Search media" value={search} onChange={e => setSearch(e.target.value)} />
            <NativeSelect aria-label="Sort media" value={sort} onChange={e => setSort(e.target.value)}><option value="loaded">Workspace order</option><option value="imported">Import time</option><option value="name">Name</option></NativeSelect>
            </>}
            <span className={styles.spacer} />
            <ActionMenu trigger={<Button size="sm" variant="outline" disabled={busy}><Plus />Add media</Button>}>
              <ActionMenuItem icon={<Library />} onClick={() => { setLibraryOpen(true); setPicked([]); }}>From Library</ActionMenuItem>
              <ActionMenuItem icon={<FileUp />} onClick={() => files.current?.click()}>Files…</ActionMenuItem>
              <ActionMenuItem icon={<FolderUp />} onClick={() => folder.current?.click()}>Folder…</ActionMenuItem>
            </ActionMenu>
          </div>
          <div id="storyboard-media" hidden={!mediaShown}>
          {!board || !mediaShown ? null : !board.sources.length ? <div className={styles.empty}><h2>Start with your media</h2><div className={styles.emptyActions}>
              {/* Media already in this project's Library is one click away; new files are the other path. */}
              {api.assets.length > 0 && <Button onClick={() => { setLibraryOpen(true); setPicked([]); }} disabled={busy}><Library aria-hidden="true" />From Library · {api.assets.length}</Button>}
              <Button variant={api.assets.length > 0 ? "outline" : "default"} onClick={() => files.current?.click()} disabled={busy}><FileUp aria-hidden="true" />Choose files</Button>
            </div></div>
            : <>
              <div className={styles.audioList}>{loaded.filter(a => a.kind === "audio").map(a => <AudioWorkspaceCard key={a.source} asset={a} selected={mediaSelection.includes(a.source)} onSelect={() => selectMedia(a.source)} onOpen={() => chooseSource(a.source)} />)}</div>
              <MediaGallery className={styles.grid} targetHeight={120} minCardWidth={150}>{loaded.filter(a => a.kind !== "audio").slice(0, showAllMedia ? undefined : MEDIA_PREVIEW_COUNT).map(a => {
              const used = storyShots.filter(s => usesSource(s, a.source)).length;
              return <article className={styles.mediaCard} data-active={mediaSelection.includes(a.source)} key={a.source} data-added={used > 0}>
                {/* Clicking the picture or name selects it for chat (the editor panels' convention); the checkbox adds it to the story. */}
                <div className={styles.mediaOpen} onClick={event => { if (!(event.target as HTMLElement).closest("button, video, a, input")) selectMedia(a.source); }}><StoryboardCardMedia asset={a} /></div>
                <button type="button" className={styles.mediaName} aria-pressed={mediaSelection.includes(a.source)} title={a.name} onClick={() => selectMedia(a.source)}>{a.name}</button>
                <MediaMembershipBadges asset={a} />
                {a.preparationState === "preparing" && <p className={styles.muted} role="status">{a.previewReady ? "Preview ready · full quality preparing in background" : a.preparationStage === "preview" ? "Preparing browsing preview…" : a.preparationStage === "full_quality" ? "Preparing full-quality media…" : "Preview queued…"}</p>}
                {a.preparationState === "failed" && <p className={styles.muted}>{a.previewReady ? "Preview ready · full-quality preparation failed. Open to retry." : "Preparation failed. Open to retry."}</p>}
                <div className={styles.cardActions}>
                  <span className={styles.cardDuration}>{a.kind === "image" ? "Photo" : a.duration ? time(a.duration) : "Video"}{a.generated ? " · Generated" : ""}</span>
                  <Button size="icon-sm" variant="ghost" title="Open for review and marks" aria-label={`Open ${a.name} for review`} onClick={() => chooseSource(a.source)}><Maximize2 aria-hidden="true" /></Button>
                </div>
                {a.kind !== "audio" && independentStory && <label className={styles.sourceSelection} data-checked={used > 0}>
                  <input type="checkbox" aria-label={`In story: ${a.name}`} checked={used > 0} disabled={busy || (!used && !a.ready)} onChange={e => void api.selectSource(a.source, e.target.checked)} />
                  <span>In story</span>
                </label>}
              </article>;
            })}</MediaGallery>
              {loaded.filter(a => a.kind !== "audio").length > MEDIA_PREVIEW_COUNT && <Button className={styles.showAll} size="sm" variant="ghost" onClick={() => setShowAllMedia(value => !value)}>{showAllMedia ? "Show fewer" : `Show all ${loaded.filter(a => a.kind !== "audio").length}`}</Button>}</>}
          {mediaShown && !!board?.sources.length && !loaded.length && <p className={styles.empty}>No media matches this view.</p>}
          </div>
        </section>
        {referenceView && <ReferenceStoryboard projectId={projectId} api={api} lead={modeSwitch} history={history} />}
        <Dialog.Root open={previewOpen && !!selectedAsset} onOpenChange={setPreviewOpen}>
          <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-[1190] bg-black/70" /><Dialog.Viewport className="editor-chrome fixed inset-0 z-[1200] grid place-items-center overflow-auto p-4"><Dialog.Popup className="w-full max-w-3xl max-h-[88vh] overflow-auto rounded-xl border border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] p-5 text-[var(--ink)]">
          {selectedAsset && <><div className={styles.sectionBar}><Dialog.Title>{selectedAsset.name}</Dialog.Title><Dialog.Close render={<Button variant="ghost" />}>Close</Dialog.Close></div>
          <MediaMembershipBadges asset={selectedAsset} inStory={!!storyShots.some(shot => shot.source === selectedAsset.source)} />
          {selectedAsset.previewReady && !selectedAsset.ready && <p role="status" className={styles.muted}>Preview ready. {selectedAsset.preparationState === "failed" ? <>Full-quality preparation failed. <Button size="sm" variant="outline" onClick={() => void api.prepare(selectedAsset.source)}>Retry preparation</Button></> : "Full quality is preparing."}</p>}
          {selectedAsset.kind === "audio" && selectedAsset.assetId ? <SourceAudioTimeline key={selectedAsset.source} projectId={projectId} assetId={selectedAsset.assetId} sourceUrl={selectedAsset.url} name={selectedAsset.name} duration={selectedAsset.duration ?? 0} /> : <div className={styles.sourceColumns}><div className={styles.viewer}>
            {(selectedAsset.ready || selectedAsset.previewReady) ? selectedAsset.kind === "image" ? <img src={selectedAsset.preview || selectedAsset.url} alt={selectedAsset.name} /> : <StoryboardPreview key={source} projectId={projectId} source={source!} revision={0} player={player} onTime={setPosition} initialTime={initialTime} />
              : <div>{selectedAsset.error && <p>{selectedAsset.error}</p>}<Button disabled={busy} onClick={() => void api.prepare(selectedAsset.source)}>Prepare preview</Button></div>}
          </div><div className={styles.marks}>
            <InspectorHeading>Saved moments</InspectorHeading>
            <Input aria-label="Marker label" placeholder="Name this moment (optional)" value={markLabel} maxLength={240} onChange={e => setMarkLabel(e.target.value)} />
            <div className={styles.actions}><Button disabled={busy || !(selectedAsset.ready || selectedAsset.previewReady)} onClick={() => saveMark(null)}>Mark moment</Button>
              {selectedAsset.kind === "video" && <Button variant="outline" disabled={busy || !(selectedAsset.ready || selectedAsset.previewReady) || (rangeStart !== null && position <= rangeStart)} onClick={() => rangeStart === null ? setRangeStart(position) : saveMark(position)}>{rangeStart === null ? "Start range" : "End range"}</Button>}
              {rangeStart !== null && <Button variant="ghost" onClick={() => setRangeStart(null)}>Cancel range</Button>}</div>
            <p className={styles.muted}>{rangeStart !== null ? `Range from ${time(rangeStart)}` : `Current moment ${time(position)}`}</p>
            {board?.marks.filter(m => m.source === source).map(m => <div className={styles.mark} key={m.id}>
              <button onClick={() => jump(m)} className={styles.markJump}><strong>{m.label}</strong><span>{time(m.start)}{m.end !== null ? `–${time(m.end)}` : " · moment"}</span></button>
              {board?.mode !== "reference" && <Button size="sm" disabled={busy || !selectedAsset.ready} onClick={() => void api.useAsset(m.source, m)}>Use this</Button>}<Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove mark ${m.label}`} onClick={() => void api.removeMark(m.id)}>×</Button>
            </div>)}
            {!board?.marks.some(m => m.source === source) && <p className={styles.muted}>No marks yet.</p>}
          </div></div>}</>}
          </Dialog.Popup></Dialog.Viewport></Dialog.Portal>
        </Dialog.Root>
        {independentStory && <StoryCanvas projectId={projectId} api={api} lookup={lookup} lead={referenceView ? undefined : modeSwitch} history={referenceView ? undefined : history} details={details} openDetails={openDetails} openVisual={openVisual} markMoments={s => chooseSource(s.source, s.start)}
          toolbar={<Button size="lg" disabled={busy || !board?.shots.length} onClick={() => void api.build(false, setAppendClips)}>Build timeline</Button>} />}
      </div>
      {shot && <aside ref={detailPanel} className={styles.details} aria-label="Shot details"><div className={styles.sectionBar}><InspectorHeading>Shot details</InspectorHeading><Button variant="ghost" onClick={() => openDetails(null)}>Close</Button></div><Button size="sm" variant="ghost" onClick={() => chooseSource(shot.source, shot.start)}>Mark moments in this clip</Button><ShotDetails key={shot.id} projectId={projectId} shot={shot} asset={lookup(shot.source)} busy={busy} patch={patch => void api.patchShot(shot.id, patch)} generate={() => setGenerationOpen(true)}
        visuals={<ShotVisualsEditor shot={shot} api={api} lookup={lookup} busy={busy} picking={visualPicker === shot.id} setPicking={open => setVisualPicker(open ? shot.id : null)} />} /></aside>}
    </div>}
    <Dialog.Root open={appendClips !== null} onOpenChange={open => { if (!open) setAppendClips(null); }}>
      <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-[1190] bg-black/70" /><Dialog.Viewport className="editor-chrome fixed inset-0 z-[1200] grid place-items-center p-4"><Dialog.Popup className="grid w-full max-w-sm gap-4 rounded-xl border border-[var(--chrome-line-strong)] bg-[var(--chrome-panel)] p-5 text-[var(--ink)]">
        <Dialog.Title className="m-0 text-[length:var(--ui-text-heading)] font-semibold">Your timeline has {appendClips} {appendClips === 1 ? "clip" : "clips"}</Dialog.Title>
        <Dialog.Description className="m-0 text-[var(--ink-secondary)]">Add the storyboard after them?</Dialog.Description>
        <div className="flex justify-end gap-2"><Dialog.Close render={<Button variant="ghost" />}>Cancel</Dialog.Close><Button disabled={busy} onClick={() => { setAppendClips(null); void api.build(true); }}>Add after</Button></div>
      </Dialog.Popup></Dialog.Viewport></Dialog.Portal>
    </Dialog.Root>
    <AssetGenerationDrawer launch={generationLaunch} projectId={projectId} open={generationOpen} onClose={() => setGenerationOpen(false)} onLibraryChanged={() => { void api.refresh(); }} />
  </main>;
}
