/**
 * Recast on the Follow-reference storyboard: shot-cut beats, per-beat prices, Generate (the creator's click),
 * and choosing a result as the beat's footage. Credits are spent only by `generateRecastBeats`, which the
 * Storyboard calls from the creator's Generate click with the prices they saw.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { quoteCloudDraft } from "../generation/cloud-generation";
import { getAssetModel } from "../generation/asset-models";
import type { AssetJob } from "../generation/assets";
import { beatRecastDraft, recastCandidate } from "../storyboard/recast";
import type { ReferenceBeat, StoryboardContent } from "../storyboard/model";
import { createAssetJob, execMedia, keepAssetOutput, listAssetJobs, probeMediaDuration, readAssetJob, resolveGenerationSource } from "./asset-generation";
import { readStoryboard, storyboardAssets, updateStoryboard } from "./storyboard";

/**
 * Beats from the reference's shot cuts (FFmpeg scene change), merging flashes shorter than `minSeconds`
 * and splitting shots longer than `maxSeconds` evenly. Cut detection is evidence, not authority: the
 * creator and agent adjust beats on the storyboard.
 */
export async function referenceShotBeats(projectId: string, source: string, { threshold = 0.3, minSeconds = 0.5, maxSeconds = 15 } = {}) {
  const file = resolveGenerationSource(projectId, source);
  const length = await probeMediaDuration(file);
  const { stderr } = await execMedia("ffmpeg", ["-hide_banner", "-i", file, "-an", "-vf", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"], { timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const cuts = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map(m => Number(m[1])).filter(t => t > minSeconds && t < length - minSeconds);
  const edges = [0, ...cuts, length].reduce<number[]>((kept, t) => (t - kept[kept.length - 1] < minSeconds && t !== length ? kept : [...kept, t]), [0]);
  if (edges[edges.length - 1] !== length) edges[edges.length - 1] = length;
  const beats: { start: number; end: number }[] = [];
  for (let i = 1; i < edges.length; i++) {
    const start = edges[i - 1], end = edges[i], parts = Math.ceil((end - start) / maxSeconds - 1e-9);
    for (let p = 0; p < parts; p++) beats.push({ start: round(start + (end - start) * p / parts), end: round(start + (end - start) * (p + 1) / parts) });
  }
  return { length, beats };
}
const round = (n: number) => Math.round(n * 1000) / 1000;

function referenceOf(board: StoryboardContent) {
  if (!board.reference) throw new Error("Choose a reference video first.");
  return board.reference;
}
async function referenceSeconds(projectId: string, board: StoryboardContent) {
  return probeMediaDuration(resolveGenerationSource(projectId, referenceOf(board).source));
}
const selectedBeats = (board: StoryboardContent, ids?: string[]) => referenceOf(board).beats.filter(b => ids ? ids.includes(b.id) : !b.selectedId && b.recast?.cast.length);

export type RecastBeatQuote = { beat_id: string; label: string; model: string; credits: number | null; window: { start: number; end: number } | null; problem: string | null };
/** Prices each beat's recast with DreamCut Cloud. Free, and never uploads or charges. */
export async function quoteRecastBeats(projectId: string, beatIds?: string[]) {
  const board = readStoryboard(projectId).content, reference = referenceOf(board), length = await referenceSeconds(projectId, board);
  const beats: RecastBeatQuote[] = await Promise.all(selectedBeats(board, beatIds).map(async beat => {
    const model = beat.recast?.modelId ?? reference.recastModel;
    try {
      const { draft, window } = beatRecastDraft(reference, beat, length);
      const quote = await quoteCloudDraft(draft);
      return { beat_id: beat.id, label: beat.label, model: getAssetModel(draft).name, credits: quote.credits, window, problem: null };
    } catch (error) {
      return { beat_id: beat.id, label: beat.label, model: model ?? "", credits: null, window: null, problem: (error as Error).message };
    }
  }));
  const priced = beats.filter(b => b.credits !== null);
  return { beats, total_credits: priced.reduce((sum, b) => sum + b.credits!, 0), ready: priced.length > 0 && priced.length === beats.length };
}

export const recastGenerateSchema = z.object({
  revision: z.number().int().nonnegative(),
  /** Beat id → the price in credits the creator saw. */
  accepted: z.record(z.string().uuid(), z.number().int().positive()),
}).strict();
/**
 * The creator's Generate click: one request per beat at the price they saw (a changed price is refused before
 * anything is charged), recorded on the beat so its results can be chosen later.
 */
export async function generateRecastBeats(projectId: string, input: unknown) {
  const { revision, accepted } = recastGenerateSchema.parse(input);
  const snapshot = readStoryboard(projectId);
  if (snapshot.revision !== revision) throw Object.assign(new Error("The storyboard changed. Review the prices again."), { status: 409 });
  const board = snapshot.content, reference = referenceOf(board), length = await referenceSeconds(projectId, board);
  const recorded: Record<string, { id: string; window: { start: number; end: number } }> = {};
  const failures: { beat_id: string; error: string }[] = [];
  const now = new Date().toISOString();
  for (const beat of reference.beats.filter(b => accepted[b.id] !== undefined)) {
    try {
      const { draft, window } = beatRecastDraft(reference, beat, length);
      const id = randomUUID();
      await createAssetJob(projectId, { ...draft, intent: `Storyboard recast · ${reference.title} · ${beat.label}` }, id, accepted[beat.id], { source: "generate_button", recorded_at: now });
      recorded[beat.id] = { id, window };
    } catch (error) { failures.push({ beat_id: beat.id, error: (error as Error).message }); }
  }
  if (Object.keys(recorded).length) await recordJobs(projectId, recorded);
  return { started: Object.keys(recorded).length, failures, storyboard: readStoryboard(projectId) };
}
async function recordJobs(projectId: string, recorded: Record<string, { id: string; window: { start: number; end: number } }>) {
  // Re-read so a save made while requests were created is kept; job ids are appended to each beat.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = readStoryboard(projectId);
    const reference = referenceOf(current.content);
    const content: StoryboardContent = { ...current.content, reference: { ...reference, beats: reference.beats.map(b => recorded[b.id]
      ? { ...b, recast: { cast: b.recast?.cast ?? [], prompt: b.recast?.prompt ?? "", ...(b.recast?.modelId ? { modelId: b.recast.modelId } : {}), jobs: [...(b.recast?.jobs ?? []), recorded[b.id]].slice(-20) } } : b) } };
    try { return await updateStoryboard(projectId, { action: "save", revision: current.revision, content }); }
    catch (error) { if ((error as { status?: number }).status !== 409) throw error; }
  }
  throw new Error("The storyboard kept changing; the generations started but aren't listed on their beats.");
}

/** A beat's generations with their status and results, newest first. */
export function beatRecastJobs(projectId: string, beat: ReferenceBeat): AssetJob[] {
  const ids = new Set((beat.recast?.jobs ?? []).map(j => j.id));
  return listAssetJobs(projectId).filter(job => ids.has(job.id));
}

export const recastUseSchema = z.object({ revision: z.number().int().nonnegative(), beat_id: z.string().uuid(), job_id: z.string().uuid(), output_id: z.string().min(1).max(200) }).strict();
/**
 * Chooses a result as the beat's footage: keeps it in the Library (managed copy with provenance) and adds it as
 * the beat's selected candidate, trimmed back to the beat inside the padded window. Once the kept copy's
 * preview is ready; until then the creator is told to try again shortly.
 */
export async function useRecastResult(projectId: string, input: unknown) {
  const { revision, beat_id, job_id, output_id } = recastUseSchema.parse(input);
  const snapshot = readStoryboard(projectId), reference = referenceOf(snapshot.content);
  if (snapshot.revision !== revision) throw Object.assign(new Error("The storyboard changed. Try again."), { status: 409 });
  const beat = reference.beats.find(b => b.id === beat_id);
  const recorded = beat?.recast?.jobs.find(j => j.id === job_id);
  if (!beat || !recorded) throw new Error("This result doesn't belong to that beat.");
  let job = readAssetJob(projectId, job_id);
  const output = job.outputs.find(o => o.id === output_id);
  if (!output || output.kind !== "video") throw new Error("Choose a video result.");
  if (!output.keptSource) job = await keepAssetOutput(projectId, job_id, output_id);
  const source = job.outputs.find(o => o.id === output_id)!.keptSource!;
  // The Library copy's preview usually prepares within seconds; wait briefly rather than asking twice.
  let asset = storyboardAssets(projectId).find(a => a.source === source);
  for (let waited = 0; !asset?.ready && asset?.preparationState !== "failed" && waited < 30; waited++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    asset = storyboardAssets(projectId).find(a => a.source === source);
  }
  if (!asset?.ready) return { ready: false as const, source, message: "The result is in your Library and its preview is still preparing. Choose it again in a moment." };
  // The board may have changed while the preview prepared; place the take on the current board.
  const latest = readStoryboard(projectId);
  if (latest.revision !== revision) return useRecastResult(projectId, { revision: latest.revision, beat_id, job_id, output_id });
  const shot = recastCandidate(beat, recorded.window, source, `Recast · ${getAssetModel(job.request).name}`);
  if (asset.duration && shot.start + shot.duration > asset.duration + 1e-3) shot.duration = Math.max(1 / 30, asset.duration - shot.start);
  const content: StoryboardContent = { ...snapshot.content, sources: [...new Set([...snapshot.content.sources, source])],
    reference: { ...reference, beats: reference.beats.map(b => b.id === beat.id ? { ...b, candidates: [...b.candidates, shot], selectedId: shot.id, reviewed: false } : b) } };
  return { ready: true as const, source, storyboard: await updateStoryboard(projectId, { action: "save", revision, content }) };
}
