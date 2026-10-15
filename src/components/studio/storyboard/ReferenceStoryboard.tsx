"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Plus, ScissorsIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, OptionSelect } from "@/components/ui/select";
import { InspectorHeading, InspectorDisclosure } from "../timeline/InspectorHierarchy";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { PlayerRef } from "@/lib/frame-runtime/player";
import type { ReferenceBeat, StoryboardAsset, StoryboardMark, StoryboardShot } from "@/lib/storyboard/model";
import type { useStoryboard } from "./useStoryboard";
import { VideoTrimControls } from "./VideoTrimControls";
import { Seconds } from "./StoryboardSeconds";
import { StoryboardCardMedia } from "./StoryboardCardMedia";
import { StoryboardPreview } from "./StoryboardPreview";
import { useStoryLayout } from "./StoryCanvas";
import { BeatRecast, CastEditor, useRecastData } from "./RecastPanel";
import styles from "./storyboard.module.css";

type Controller = ReturnType<typeof useStoryboard>;
const stamp = (v: number) => `${v.toFixed(2)}s`;
const newBeat = (start: number, end: number): ReferenceBeat => ({ id: crypto.randomUUID(), label: "New beat", start, end, originalText: "", text: "", note: "", candidates: [], reviewed: false });

const pendingKey = (projectId: string) => `dreamcut:pending-reference:${projectId}`;

export function ReferenceStoryboard({ projectId, api, lead, history }: { projectId: string; api: Controller; lead: React.ReactNode; history: React.ReactNode }) {
  const board = api.snapshot!.content, ref = board.reference, busy = api.busy;
  const [active, setActive] = useState<string | null>(null), [editingBeat, setEditingBeat] = useState(false);
  const [layout, setLayout] = useStoryLayout(projectId);
  const [castOpen, setCastOpen] = useState(false);
  const recastData = useRecastData(projectId, api.snapshot!.revision, Boolean(ref) && !ref?.independentStory);
  const recastAll = recastData.quote?.ready ? recastData.quote.beats.filter(b => b.credits) : [];
  const left = useRef<PlayerRef>(null), right = useRef<PlayerRef>(null);
  const beat = ref?.beats.find(b => b.id === active) ?? ref?.beats[0];
  const selected = beat?.candidates.find(c => c.id === beat.selectedId);
  const referenceAsset = api.assets.find(a => a.source === ref?.source);
  const selectedAsset = api.assets.find(a => a.source === selected?.source);
  const patch = (id: string, values: Partial<ReferenceBeat>) => api.edit(b => ({ ...b, reference: b.reference && { ...b.reference, beats: b.reference.beats.map(v => v.id === id ? { ...v, ...values, reviewed: values.reviewed ?? false } : v) } }));
  const router = useRouter();
  /** Missing shot: open Generate with a prompt written from this beat; a chosen photo becomes the start frame. */
  const generateForBeat = () => {
    if (!ref || !beat) return;
    const index = ref.beats.indexOf(beat) + 1, seconds = Math.max(1, beat.end - beat.start);
    const prompt = [`Storyboard beat ${index}, "${beat.label}" (${seconds.toFixed(1)}s in the reference).`,
      beat.note && `Direction: ${beat.note}`, beat.text && `On-screen text planned: ${beat.text}`, beat.originalText && `The reference shows: ${beat.originalText}`].filter(Boolean).join("\n");
    const photo = selectedAsset?.kind === "image" ? selected?.source : undefined;
    try { sessionStorage.setItem(`dreamcut:generation-launch:${projectId}`, JSON.stringify({ task: photo ? "animate" : "video", source: photo, prompt, nonce: Date.now() })); } catch { /* Navigation still opens Generate. */ }
    router.push(`/p/${encodeURIComponent(projectId)}/library?generate=create`);
  };
  const choose = (id: string) => { const target = ref?.beats.find(b => b.id === id); setActive(id); if (target) left.current?.seekTo(Math.round(target.start * 30)); };
  const addCandidate = (source: string, mark?: StoryboardMark) => {
    const asset = api.assets.find(a => a.source === source);
    if (!beat || !asset?.ready) return;
    const start = asset.kind === "image" ? 0 : mark?.start ?? 0;
    const duration = Math.min(600, mark?.end != null ? mark.end - start : beat.end - beat.start, asset.kind === "image" ? 600 : (asset.duration ?? 0) - start);
    if (duration < 1 / 30) return;
    const shot: StoryboardShot = { id: crypto.randomUUID(), source, start, duration, label: mark?.label || asset.name, ...(mark ? { markId: mark.id } : {}), note: "", text: "" };
    void api.edit(b => ({ ...b, sources: [...new Set([...b.sources, source])], reference: b.reference && { ...b.reference, beats: b.reference.beats.map(v => v.id === beat.id ? { ...v, candidates: [...v.candidates, shot], selectedId: shot.id, reviewed: false } : v) } }));
  };
  const patchCandidate = (values: Partial<StoryboardShot>) => { if (beat && selected) void api.edit(b => ({ ...b, reference: { ...b.reference!, beats: b.reference!.beats.map(v => v.id === beat.id ? { ...v, reviewed: false, candidates: v.candidates.map(c => c.id === selected.id ? { ...c, ...values } : c) } : v) } })); };
  const needFootage = ref ? ref.beats.filter(b => !b.selectedId).length : 0;
  const addBeat = () => {
    if (!ref || !referenceAsset?.duration) return;
    const start = ref.beats.at(-1)?.end ?? 0, next = newBeat(start, Math.min(start + 2, referenceAsset.duration));
    void api.edit(b => ({ ...b, reference: { ...b.reference!, beats: [...b.reference!.beats, next] } })); setActive(next.id);
  };
  const canAddBeat = !busy && !!referenceAsset?.duration && (ref?.beats.at(-1)?.end ?? 0) < referenceAsset.duration - 1 / 30;
  const ours = !ref?.independentStory;
  const attachReference = (asset: StoryboardAsset) => api.edit(b => ({ ...b, mode: "reference", sources: [...new Set([...b.sources, asset.source])], reference: { source: asset.source, title: api.catalogReferences.find(r => r.sourceHash === asset.sourceHash)?.title ?? asset.name, sourceHash: asset.sourceHash, captions: false, beats: [] } }));
  // A dropped reference is imported first and attached once preparation makes it valid; the
  // pending source survives a reload for this tab.
  const [pending, setPendingState] = useState<string | null>(null), [dropping, setDropping] = useState(false);
  const referenceFile = useRef<HTMLInputElement>(null);
  const setPending = (source: string | null) => { setPendingState(source); try { if (source) sessionStorage.setItem(pendingKey(projectId), source); else sessionStorage.removeItem(pendingKey(projectId)); } catch { /* This visit only. */ } };
  useEffect(() => { try { setPendingState(sessionStorage.getItem(pendingKey(projectId))); } catch { /* None pending. */ } }, [projectId]);
  const pendingAsset = api.assets.find(a => a.source === pending);
  const watch = api.watch;
  useEffect(() => { watch(pending); return () => watch(null); }, [pending, watch]);
  useEffect(() => {
    if (!pending || ref) { if (pending && ref) setPending(null); return; }
    if (pendingAsset?.kind === "video" && pendingAsset.ready && pendingAsset.duration && !busy) { setPending(null); void attachReference(pendingAsset); }
  }); // Runs after every refresh/poll; the guards make it idempotent.
  const intake = (list: FileList | null) => { const file = list?.[0]; if (file) void api.uploadReference(file, setPending); };
  const pick = (b: ReferenceBeat) => b.candidates.find(c => c.id === b.selectedId);
  const pictures = (b: ReferenceBeat) => <>
    <div className={styles.shotPicture}><StoryboardCardMedia asset={referenceAsset} start={b.start} duration={b.end - b.start} label={`Reference frame for ${b.label}`} playable={false} /></div>
    {ours && (pick(b) ? <div className={styles.shotPicture}><StoryboardCardMedia asset={api.assets.find(a => a.source === pick(b)!.source)} start={pick(b)!.start} duration={pick(b)!.duration} label={`Our footage for ${b.label}`} playable={false} /></div>
      : <div className={styles.missingPicture}>Needs footage</div>)}
  </>;

  if (!ref) return <section className={styles.assembly} aria-label="Reference">
    <div className={styles.sectionBar}><div className={styles.storyLead}>{lead}</div><div className={styles.actions}>{history}</div></div>
    <div className={styles.referenceDrop} data-drop={dropping} onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }} onDragLeave={e => { if (e.currentTarget === e.target) setDropping(false); }} onDrop={e => { e.preventDefault(); setDropping(false); intake(e.dataTransfer.files); }}>
      {pending ? <p role="status">{pendingAsset?.preparationState === "failed" ? <>Preparation failed for {pendingAsset.name}. <Button size="sm" variant="outline" onClick={() => void api.prepare(pendingAsset.source)}>Retry preparation</Button></> : `Preparing ${pendingAsset?.name ?? "the video"} as your reference…`}</p>
        : <><strong>Drop the video you want to follow</strong><Button variant="outline" disabled={busy} onClick={() => referenceFile.current?.click()}><FileUp />Choose file</Button></>}
      <input ref={referenceFile} type="file" hidden accept="video/mp4,video/quicktime,video/webm,.m4v" onChange={e => { intake(e.target.files); e.target.value = ""; }} />
    </div>
    <div className={styles.referenceSetup}>
      <div className={styles.referenceField}><span id="reference-video-label">Or use a project video</span>
        <Select value="" disabled={busy} onValueChange={source => { const asset = api.assets.find(a => a.source === source); if (asset?.duration) void attachReference(asset); }}>
          <SelectTrigger className="w-full" aria-labelledby="reference-video-label"><SelectValue>Choose from project Library</SelectValue></SelectTrigger>
          <SelectContent>{api.assets.filter(a => a.kind === "video").map(a => <SelectItem key={a.source} value={a.source} disabled={!a.ready}>{api.catalogReferences.find(r => r.sourceHash === a.sourceHash)?.title ?? a.name}{!a.ready ? " · Prepare preview first" : ""}</SelectItem>)}
            {!api.assets.some(a => a.kind === "video") && <SelectItem value="empty" disabled>No project videos yet</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      {!!api.catalogReferences.length && <div className={styles.referenceField}><span id="catalog-reference-label">Or a Catalog reference</span>
        <Select value={null} disabled={busy} onValueChange={id => { if (id) void api.prepareCatalogReference(id); }}>
          <SelectTrigger className="w-full" aria-labelledby="catalog-reference-label"><SelectValue placeholder="Choose from DreamCut Catalog" /></SelectTrigger>
          <SelectContent>{api.catalogReferences.map(r => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>}
    </div>
  </section>;

  return <div className={styles.referenceLayout}>
    {/* One line of beats: the reference frame paired with our pick, in the same Strip/Script layouts as the story. */}
    <section className={styles.assembly} aria-label="Reference beats">
      <div className={styles.sectionBar}>
        <div className={styles.storyLead}>{lead}<span className={styles.count}>{ref.title} · {ref.beats.length} {ref.beats.length === 1 ? "beat" : "beats"}{ours && needFootage ? ` · ${needFootage} ${needFootage === 1 ? "needs" : "need"} footage` : ""}</span></div>
        <div className={styles.actions}>
          {history}
          <SegmentedControl aria-label="Story layout">
            {([["strip", "Strip"], ["script", "Script"]] as const).map(([key, label]) => <button key={key} aria-pressed={layout === key} onClick={() => setLayout(key)}>{label}</button>)}
          </SegmentedControl>
          <Button size="sm" variant="outline" disabled={!canAddBeat} onClick={addBeat}><Plus />Add beat</Button>
          {ref.beats.length <= 1 && <Button size="sm" variant="outline" disabled={busy} onClick={() => void api.splitAtCuts()}><ScissorsIcon />Split at cuts</Button>}
          {ours && recastAll.length > 1 && <Button size="sm" disabled={busy} onClick={() => api.recast("generate", { accepted: Object.fromEntries(recastAll.map(b => [b.beat_id, b.credits!])) })}><SparklesIcon />Recast {recastAll.length} beats · {recastData.quote!.total_credits.toLocaleString()} credits</Button>}
        </div>
      </div>
      {ref.beats.length > 0 && <div className={styles.pace} role="list" aria-label="Pacing">
        {ref.beats.map((b, i) => <button key={b.id} role="listitem" className={styles.paceShot} style={{ flexGrow: b.end - b.start }} data-active={beat?.id === b.id} data-missing={ours && !b.selectedId} title={`${i + 1}. ${b.label} · ${stamp(b.end - b.start)}`} aria-label={`Go to beat ${i + 1}, ${stamp(b.end - b.start)}`} onClick={() => choose(b.id)} />)}
      </div>}
      {!ref.beats.length ? <div className={styles.storyEmpty}><Button variant="outline" disabled={busy} onClick={() => void api.splitAtCuts()}><ScissorsIcon />Split at cuts</Button><Button variant="outline" disabled={!canAddBeat} onClick={addBeat}><Plus />Add the first beat</Button></div>
        : layout === "strip" ? <div className={styles.referenceStrip}>
          <div className={styles.laneLabels} aria-hidden="true"><span>Reference</span>{ours && <span>Ours</span>}</div>
          <div className={styles.strip}>
            {ref.beats.map((b, i) => <button key={b.id} type="button" className={styles.stripShot} data-active={beat?.id === b.id} aria-pressed={beat?.id === b.id} aria-label={`Beat ${i + 1}: ${b.label}`} onClick={() => choose(b.id)}>
              <div className={styles.rail}><span className={styles.railDot}>{i + 1}</span><span className={styles.railTime}>{stamp(b.end - b.start)}</span></div>
              {pictures(b)}
              <strong className={styles.shotLabel}>{b.label}</strong>
              {(ours ? b.text : b.originalText) && <p className={styles.shotNotePreview}>{ours ? b.text : b.originalText}</p>}
            </button>)}
          </div>
        </div>
        : <div className={styles.script}>
          {ref.beats.map((b, i) => <button key={b.id} type="button" className={`${styles.scriptRow} ${styles.referenceRowScript}`} data-ours={ours} data-active={beat?.id === b.id} aria-pressed={beat?.id === b.id} aria-label={`Beat ${i + 1}: ${b.label}`} onClick={() => choose(b.id)}>
            <span className={styles.railDot}>{i + 1}</span>
            {pictures(b)}
            <div className={styles.scriptBody}>
              <div className={styles.scriptHead}><strong className={styles.shotLabel}>{b.label}</strong><span>{stamp(b.start)}–{stamp(b.end)}</span></div>
              {b.originalText && <p className={styles.scriptText}>Reference: {b.originalText}</p>}
              {ours && <p className={styles.scriptText}>{b.text ? `Ours: ${b.text}` : pick(b) ? "" : "Choose footage for this beat."}</p>}
            </div>
          </button>)}
        </div>}
    </section>

    {beat && <aside className={`${styles.details} ${styles.beatDetails}`} aria-label="Beat details">
      {ours && <CastEditor api={api} reference={ref} open={castOpen || !ref.cast?.length} onOpenChange={setCastOpen} />}
      <InspectorHeading>{ref.beats.indexOf(beat) + 1}. {beat.label}</InspectorHeading>
      {ours && <div className={styles.beatFootage}>
        <label>Footage<OptionSelect label="Footage" value={selected?.source ?? ""} disabled={busy} placeholder="Choose footage" onValueChange={source => { const existing = beat.candidates.find(c => c.source === source); if (existing) void patch(beat.id, { selectedId: existing.id }); else addCandidate(source); }} options={api.assets.filter(a => a.kind !== "audio" && a.source !== ref.source).map(a => ({ value: a.source, label: beat.candidates.find(c => c.source === a.source)?.label ?? a.name, disabled: !a.ready }))} /></label>
      </div>}
      <div className={styles.beatPlayers} data-ours={ours}>
        <div><span className={styles.laneName}>Reference</span><StoryboardPreview projectId={projectId} source={ref.source} revision={0} player={left} initialTime={beat.start} /></div>
        {ours && <div><span className={styles.laneName}>Ours</span>{selected ? <StoryboardPreview key={selected.id} projectId={projectId} source={selected.source} duration={selectedAsset?.kind === "video" ? undefined : selected.duration} revision={0} player={right} /> : <div className={styles.missingPicture}>Needs footage</div>}</div>}
      </div>
      {ours && <div key={beat.id} className={styles.referenceDetail}>
        {selected && (selectedAsset?.kind === "video" ? <VideoTrimControls key={selected.id} start={selected.start} duration={selected.duration} sourceDuration={selectedAsset.duration ?? 0} busy={busy} player={right} commit={patchCandidate} />
          : <Seconds label="Duration" value={selected.duration} min={1 / 30} max={600} disabled={busy} commit={duration => patchCandidate({ duration })} />)}
        <PlanText label="Our text" value={beat.text} maxLength={500} disabled={false} commit={text => void patch(beat.id, { text })} />
      </div>}
      {ours && <BeatRecast key={`recast-${beat.id}`} projectId={projectId} api={api} reference={ref} beat={beat} quote={recastData.quote} jobs={recastData.jobs[beat.id] ?? []} />}
      <Button variant="outline" size="sm" className="self-start" disabled={busy} onClick={generateForBeat}><SparklesIcon />{ours && selected ? "Generate an alternative" : "Generate shot"}</Button>
      <InspectorDisclosure title="Edit reference beat" open={editingBeat} onOpenChange={setEditingBeat}>
        <div key={beat.id} className={styles.referenceDetail}>
          <PlanText label="Beat name" value={beat.label} maxLength={240} disabled={false} commit={label => void patch(beat.id, { label })} singleLine />
          <Seconds label="Reference start" value={beat.start} min={ref.beats[ref.beats.indexOf(beat) - 1]?.end ?? 0} max={beat.end - 1 / 30} disabled={false} commit={start => void patch(beat.id, { start })} />
          <Seconds label="Reference end" value={beat.end} min={beat.start + 1 / 30} max={ref.beats[ref.beats.indexOf(beat) + 1]?.start ?? referenceAsset?.duration ?? beat.end} disabled={false} commit={end => void patch(beat.id, { end })} />
          <PlanText label="Original text" value={beat.originalText} maxLength={1000} disabled={false} commit={originalText => void patch(beat.id, { originalText })} />
          <Button size="sm" variant="ghost" className="self-start" disabled={busy} onClick={() => void api.edit(b => ({ ...b, reference: { ...b.reference!, beats: b.reference!.beats.filter(v => v.id !== beat.id) } }))}>Remove beat</Button>
        </div>
      </InspectorDisclosure>
    </aside>}
  </div>;
}

function PlanText({ label, value, maxLength, disabled, commit, singleLine = false }: { label: string; value: string; maxLength: number; disabled: boolean; commit: (value: string) => void; singleLine?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const props = { "aria-label": label, value: draft, maxLength, readOnly: disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: () => { if (draft !== value) commit(draft); },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (e.key === "Escape") { setDraft(value); e.preventDefault(); } },
  };
  return <label>{label}{singleLine ? <Input {...props} /> : <textarea {...props} />}</label>;
}
