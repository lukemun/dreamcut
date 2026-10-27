"use client";
import { useEffect, useState } from "react";
import { Plus, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/select";
import { InspectorDisclosure } from "../timeline/InspectorHierarchy";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";
import { assetMediaUrl, ACTIVE_ASSET_STATUSES, type AssetJob } from "@/lib/generation/assets";
import { ASSET_MODELS } from "@/lib/generation/asset-models";
import { DEFAULT_RECAST_MODEL, RECAST_MODELS } from "@/lib/storyboard/recast";
import type { CastMember, ReferenceBeat, StoryboardReference } from "@/lib/storyboard/model";
import type { useStoryboard } from "./useStoryboard";
import styles from "./storyboard.module.css";

type Controller = ReturnType<typeof useStoryboard>;
export type RecastQuote = { beats: { beat_id: string; credits: number | null; problem: string | null }[]; total_credits: number; ready: boolean };
const credits = (n: number) => `${n.toLocaleString()} credit${n === 1 ? "" : "s"}`;
const MODEL_OPTIONS = RECAST_MODELS.map(id => ({ value: id, label: ASSET_MODELS.find(m => m.id === id)!.name }));

/** Prices for beats that have cast and no footage, and each beat's generations; refreshed as the board changes. */
export function useRecastData(projectId: string, revision: number, enabled: boolean) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/storyboard/recast`;
  const [quote, setQuote] = useState<RecastQuote | null>(null);
  const [jobs, setJobs] = useState<Record<string, AssetJob[]>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => void fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "quote" }), signal: controller.signal })
      .then(r => r.json()).then(data => { if (data.beats) setQuote(data); }).catch(() => undefined), 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [base, revision, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(base, { cache: "no-store", signal: controller.signal }).then(r => r.json()).then(data => { if (data.beats) setJobs(data.beats); }).catch(() => undefined);
    return () => controller.abort();
  }, [base, revision, tick, enabled]);
  const active = Object.values(jobs).flat().some(job => ACTIVE_ASSET_STATUSES.includes(job.status));
  useEffect(() => { if (!active) return; const timer = setInterval(() => setTick(n => n + 1), 4000); return () => clearInterval(timer); }, [active]);
  return { quote, jobs };
}

/** The people who replace those in the reference: a name and up to four photos each. */
export function CastEditor({ api, reference, open, onOpenChange }: { api: Controller; reference: StoryboardReference; open: boolean; onOpenChange: (open: boolean) => void }) {
  const cast = reference.cast ?? [], busy = api.busy;
  const photos = api.assets.filter(a => a.kind === "image" && a.ready);
  const save = (next: CastMember[], extraSources: string[] = []) => api.edit(b => ({ ...b, sources: [...new Set([...b.sources, ...extraSources])], reference: { ...b.reference!, cast: next,
    // Someone removed from the cast leaves the beats they were in.
    beats: b.reference!.beats.map(beat => beat.recast ? { ...beat, recast: { ...beat.recast, cast: beat.recast.cast.filter(id => next.some(c => c.id === id)) } } : beat) } }));
  const patch = (id: string, values: Partial<CastMember>, sources: string[] = []) => save(cast.map(c => c.id === id ? { ...c, ...values } : c), sources);
  const add = (photo: string) => save([...cast, { id: crypto.randomUUID(), name: `Person ${cast.length + 1}`, photos: [photo], note: "" }], [photo]);
  return <InspectorDisclosure title={`Cast${cast.length ? ` · ${cast.length}` : ""}`} open={open} onOpenChange={onOpenChange}>
    <div className={styles.castList}>
      {cast.map(member => <div key={member.id} className={styles.castMember}>
        <div className={styles.castHead}>
          <NameField value={member.name} disabled={busy} commit={name => void patch(member.id, { name })} />
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`} disabled={busy} onClick={() => void save(cast.filter(c => c.id !== member.id))}><XIcon /></Button>
        </div>
        <div className={styles.castPhotos}>
          {member.photos.map(photo => <span key={photo} className={styles.castPhoto}>
            <img src={thumbnailUrl(api.assets.find(a => a.source === photo)?.url ?? "", 160)} alt={`${member.name} photo`} />
            {member.photos.length > 1 && <button type="button" aria-label={`Remove this photo of ${member.name}`} disabled={busy} onClick={() => void patch(member.id, { photos: member.photos.filter(p => p !== photo) })}><XIcon size={12} /></button>}
          </span>)}
        </div>
        {member.photos.length < 4 && <OptionSelect label={`Add a photo of ${member.name}`} value="" disabled={busy} placeholder="Add photo" onValueChange={photo => { if (photo) void patch(member.id, { photos: [...member.photos, photo] }, [photo]); }}
          options={photos.filter(p => !member.photos.includes(p.source)).map(p => ({ value: p.source, label: p.name }))} />}
      </div>)}
      <OptionSelect label="Add a person from a photo" value="" disabled={busy || cast.length >= 20} placeholder={cast.length ? "Add person" : "Add the first person"} onValueChange={photo => { if (photo) void add(photo); }}
        options={photos.map(p => ({ value: p.source, label: p.name }))} />
      {!photos.length && <p className={styles.castEmpty}>Add photos of the people to your Library first.</p>}
    </div>
  </InspectorDisclosure>;
}

/** One beat's recast: who appears, the model, what else to change, Generate, and its takes. */
export function BeatRecast({ projectId, api, reference, beat, quote, jobs }: { projectId: string; api: Controller; reference: StoryboardReference; beat: ReferenceBeat; quote: RecastQuote | null; jobs: AssetJob[] }) {
  const cast = reference.cast ?? [], busy = api.busy, plan = beat.recast ?? { cast: [], prompt: "", jobs: [] };
  const savePlan = (values: Partial<typeof plan>) => api.edit(b => ({ ...b, reference: { ...b.reference!, beats: b.reference!.beats.map(v => v.id === beat.id ? { ...v, recast: { ...plan, ...values } } : v) } }));
  const toggle = (id: string) => void savePlan({ cast: plan.cast.includes(id) ? plan.cast.filter(c => c !== id) : [...plan.cast, id].slice(0, 4) });
  const price = quote?.beats.find(b => b.beat_id === beat.id);
  const results = jobs.flatMap(job => job.outputs.filter(o => o.kind === "video").map(output => ({ job, output })));
  const running = jobs.filter(job => ACTIVE_ASSET_STATUSES.includes(job.status));
  const failed = jobs.filter(job => job.status === "failed" && job.error);
  return <section className={styles.recast} aria-label="Recast this beat">
    <h3>Recast</h3>
    {cast.length ? <div className={styles.recastPeople} role="group" aria-label="Who appears, left to right">
      {cast.map(member => { const at = plan.cast.indexOf(member.id); return <button key={member.id} type="button" aria-pressed={at >= 0} disabled={busy} onClick={() => toggle(member.id)}>
        <img src={thumbnailUrl(api.assets.find(a => a.source === member.photos[0])?.url ?? "", 96)} alt="" />{at >= 0 ? `${at + 1}. ` : ""}{member.name}</button>; })}
    </div> : <p className={styles.castEmpty}>Add people to the cast first.</p>}
    <label>Model<OptionSelect label="Recast model" value={plan.modelId ?? reference.recastModel ?? DEFAULT_RECAST_MODEL} disabled={busy} onValueChange={modelId => void savePlan({ modelId })} options={MODEL_OPTIONS} /></label>
    <PromptField value={plan.prompt} disabled={busy} commit={prompt => void savePlan({ prompt })} />
    {price?.problem ? <p className={styles.recastNote}>{price.problem}</p> : null}
    <Button size="sm" variant="outline" className="self-start" disabled={busy || !price?.credits}
      onClick={() => api.recast("generate", { accepted: { [beat.id]: price!.credits } })}><SparklesIcon />{price?.credits ? `Recast this beat · ${credits(price.credits)}` : "Recast this beat"}</Button>
    {running.length ? <p role="status" className={styles.recastNote}>{running.length === 1 ? "Generating…" : `${running.length} generating…`}</p> : null}
    {failed.map(job => <p key={job.id} role="alert" className={styles.recastNote}>{job.error}</p>)}
    {results.length ? <div className={styles.recastTakes}>
      {results.map(({ job, output }, i) => { const chosen = beat.candidates.some(c => c.source === output.keptSource && c.id === beat.selectedId);
        return <figure key={`${job.id}/${output.id}`}>
          <video src={assetMediaUrl(projectId, output.source)} controls muted playsInline preload="metadata" aria-label={`Take ${i + 1}`} />
          <figcaption>Take {i + 1}{chosen ? " · in use" : ""}{!chosen && <Button size="sm" variant="ghost" disabled={busy} onClick={() => api.recast("use", { beat_id: beat.id, job_id: job.id, output_id: output.id })}><Plus />Use</Button>}</figcaption>
        </figure>; })}
    </div> : null}
  </section>;
}

function NameField({ value, disabled, commit }: { value: string; disabled: boolean; commit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <Input aria-label="Name" value={draft} maxLength={100} readOnly={disabled} onChange={e => setDraft(e.target.value)}
    onBlur={() => { if (draft.trim() && draft !== value) commit(draft.trim()); else setDraft(value); }}
    onKeyDown={e => { if (e.key === "Escape") { setDraft(value); e.preventDefault(); } if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
function PromptField({ value, disabled, commit }: { value: string; disabled: boolean; commit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label>What else to change<textarea aria-label="What else to change" value={draft} maxLength={2500} readOnly={disabled} placeholder="Keep the jacket and sunglasses" onChange={e => setDraft(e.target.value)}
    onBlur={() => { if (draft !== value) commit(draft); }} onKeyDown={e => { if (e.key === "Escape") { setDraft(value); e.preventDefault(); } }} /></label>;
}
