import { z } from "zod";
import { readScriptDocument } from "./script";
import { canvasGraph } from "./canvas";
import { MAX_SHOT_VISUALS, storyboardContentSchema, storyboardUnits, type StoryboardAsset, type StoryboardContent, type StoryboardShot, type StoryboardSnapshot, type StoryboardVisual, visualPlacement } from "./model";

/**
 * Agent storyboard drafting. An agent writes the freeform story as beats of shots that
 * point into original sources (no cuts or re-encodes). The draft is saved through the
 * ordinary storyboard save, so it is one revision-checked Undo step for the creator, and it
 * never touches the timeline: Build timeline remains the human step toward an edit.
 */
const seconds = z.number().finite().min(0);
export const storyboardDraftVisualSchema = z.object({
  source: z.string().min(1).describe("Project photo or video from storyboard_get sources[].source shown over the shot, e.g. sources/dashboard.png"),
  at: seconds.describe("When it appears, in seconds from the shot's start (shot clock, not the source clock)"),
  duration: z.number().finite().min(1 / 30).max(3600).describe("How long it stays on screen, in seconds; at + duration must fit inside the shot"),
  start: seconds.optional().describe("Video visuals only: in-point on the visual's own source clock, in seconds. Omit for photos"),
  label: z.string().trim().min(1).max(240).describe("Short name the creator will scan, e.g. 'Pricing page screenshot'"),
  note: z.string().max(2000).default("").describe("What it shows or the planned treatment, e.g. 'zoom into the price'"),
  placement: z.enum(["float", "full"]).optional().describe("float (default): a card that rises in beside the speaker. full: covers the frame, for title cards and section breaks. A motion graphic keeps its own layout in the edit; set float when it is drawn beside the speaker so the storyboard card shows it legibly"),
}).strict();
export const storyboardDraftShotSchema = z.object({
  source: z.string().min(1).describe("Project source path from storyboard_get sources[].source, e.g. sources/talk.mp4"),
  start: seconds.describe("Start in seconds on the original source clock"),
  end: seconds.describe("End in seconds on the original source clock; must follow start. Photos use start 0 and end = how long to hold"),
  label: z.string().trim().min(1).max(240).describe("Short shot name, e.g. 'Hook: why I quit'"),
  note: z.string().max(2000).default("").describe("What happens in this shot: what is said and seen, and any planned treatment"),
  text: z.string().max(1000).default("").describe("On-screen text idea for this shot, if any"),
  transition_into: z.string().max(2000).optional().describe("Planned transition into this shot from the previous one, e.g. 'mask glitch reveal'"),
  visuals: z.array(storyboardDraftVisualSchema).max(MAX_SHOT_VISUALS).optional().describe("Cutaways shown over this shot while its picture and sound keep running underneath (screenshots, mockups, B-roll, motion graphics), in time order without overlaps. Use these for visuals during speech; a separate shot would cut the speech"),
}).strict();
export const storyboardDraftBeatSchema = z.object({
  name: z.string().trim().max(240).optional().describe("Beat name, e.g. 'Intro'. Omit for a beat that is a single ungrouped shot"),
  shots: z.array(storyboardDraftShotSchema).min(1).max(100),
}).strict();
export const storyboardDraftSchema = z.object({
  revision: z.number().int().nonnegative().describe("Storyboard revision from storyboard_get; a changed board is refused rather than overwritten"),
  mode: z.enum(["replace", "append"]).default("replace").describe("replace: the draft becomes the whole freeform story. append: add after the existing shots"),
  beats: z.array(storyboardDraftBeatSchema).min(1).max(200),
}).strict().superRefine((draft, ctx) => {
  const total = draft.beats.reduce((sum, beat) => sum + beat.shots.length, 0);
  if (total > 1000) ctx.addIssue({ code: "custom", message: "A storyboard holds at most 1000 shots" });
  draft.beats.forEach((beat, b) => beat.shots.forEach((shot, s) => {
    if (shot.end - shot.start < 1 / 30) ctx.addIssue({ code: "custom", path: ["beats", b, "shots", s, "end"], message: `Beat ${b + 1}, shot ${s + 1}: end must be at least one frame after start` });
  }));
});
export type StoryboardDraft = z.infer<typeof storyboardDraftSchema>;

/** Pure: the board content after applying a draft. `id` supplies fresh UUIDs. */
export function applyStoryboardDraft(content: StoryboardContent, draft: StoryboardDraft, assets: StoryboardAsset[], id: () => string = () => crypto.randomUUID()): StoryboardContent {
  const bySource = new Map(assets.map(a => [a.source, a]));
  const groups: StoryboardContent["groups"] = [], shots: StoryboardShot[] = [];
  draft.beats.forEach((beat, b) => {
    const groupId = beat.name ? id() : undefined;
    if (groupId) groups.push({ id: groupId, name: beat.name! });
    beat.shots.forEach((shot, s) => {
      const asset = bySource.get(shot.source);
      const where = `Beat ${b + 1}, shot ${s + 1}`;
      if (!asset) throw new StoryboardDraftError(`${where}: unknown source ${shot.source}. Use a source from storyboard_get.`);
      if (asset.kind === "audio") throw new StoryboardDraftError(`${where}: audio cannot be a storyboard shot; reference its video source instead.`);
      if (asset.kind === "video" && !asset.ready) throw new StoryboardDraftError(`${where}: ${asset.name} is still preparing; poll media_readiness first.`);
      const image = asset.kind === "image";
      const start = image ? 0 : shot.start, duration = Math.round((shot.end - shot.start) * 1e6) / 1e6;
      if (!image && asset.duration && shot.end > asset.duration + 1e-4) throw new StoryboardDraftError(`${where}: ends at ${shot.end}s but ${asset.name} is ${asset.duration.toFixed(2)}s long.`);
      const visuals = (shot.visuals ?? []).map((visual, v): StoryboardVisual => {
        const here = `${where}, visual ${v + 1}`, overlay = bySource.get(visual.source);
        if (!overlay) throw new StoryboardDraftError(`${here}: unknown source ${visual.source}. Use a source from storyboard_get.`);
        if (overlay.kind === "audio") throw new StoryboardDraftError(`${here}: visuals must be a photo or video, not audio.`);
        if (overlay.kind === "video" && !overlay.ready) throw new StoryboardDraftError(`${here}: ${overlay.name} is still preparing; poll media_readiness first.`);
        if (overlay.kind === "image" && visual.start) throw new StoryboardDraftError(`${here}: photos have no in-point; omit start.`);
        const inPoint = overlay.kind === "image" ? 0 : visual.start ?? 0;
        if (overlay.kind === "video" && overlay.duration && inPoint + visual.duration > overlay.duration + 1e-4) throw new StoryboardDraftError(`${here}: needs ${(inPoint + visual.duration).toFixed(2)}s of ${overlay.name}, which is ${overlay.duration.toFixed(2)}s long.`);
        if (visual.at + visual.duration > duration + 1e-4) throw new StoryboardDraftError(`${here}: ends ${(visual.at + visual.duration).toFixed(2)}s into a ${duration.toFixed(2)}s shot; shorten it or start it earlier.`);
        return { id: id(), source: visual.source, start: inPoint, at: visual.at, duration: visual.duration, label: visual.label, note: visual.note, ...(visual.placement ? { placement: visual.placement } : {}) };
      }).sort((a, b) => a.at - b.at);
      visuals.forEach((v, i) => { if (i && v.at < visuals[i - 1].at + visuals[i - 1].duration - 1e-4) throw new StoryboardDraftError(`${where}: visuals "${visuals[i - 1].label}" and "${v.label}" overlap; one visual shows at a time.`); });
      shots.push({ id: id(), source: shot.source, start, duration, label: shot.label, note: shot.note, text: shot.text,
        ...(shot.transition_into ? { transitionNote: shot.transition_into } : {}), ...(groupId ? { groupId } : {}), ...(visuals.length ? { visuals } : {}) });
    });
  });
  const keep = draft.mode === "append";
  const next = {
    ...content,
    mode: "freeform" as const,
    sources: [...new Set([...content.sources, ...shots.flatMap(s => [s.source, ...(s.visuals ?? []).map(v => v.source)])])],
    shots: keep ? [...content.shots, ...shots] : shots,
    groups: keep ? [...content.groups, ...groups] : groups,
  };
  return storyboardContentSchema.parse(next);
}

export class StoryboardDraftError extends Error { status = 422; }

/** Compact read for agents: the board, its revision and usable sources, without catalog payloads. */
export function storyboardAgentSummary(snapshot: StoryboardSnapshot, assets: StoryboardAsset[]) {
  const board = snapshot.content, groups = new Map(board.groups.map(g => [g.id, g.name]));
  return {
    revision: snapshot.revision,
    mode: board.mode ?? "freeform",
    sources: assets.map(a => ({ source: a.source, name: a.name, kind: a.kind, duration_seconds: a.duration ?? null,
      ready: a.ready, in_storyboard: board.sources.includes(a.source) })),
    beats: storyboardUnits(board).map(unit => ({
      name: unit[0].groupId ? groups.get(unit[0].groupId) ?? null : null,
      shots: unit.map(s => ({ id: s.id, source: s.source, start: s.start, end: +(s.start + s.duration).toFixed(4), label: s.label, note: s.note, text: s.text, transition_into: s.transitionNote ?? null,
        visuals: (s.visuals ?? []).map(v => ({ id: v.id, source: v.source, at: v.at, duration: v.duration, start: v.start, label: v.label, note: v.note, placement: visualPlacement(v) })) })),
    })),
    reference: board.reference ? { source: board.reference.source, title: board.reference.title, recast_model: board.reference.recastModel ?? null,
      cast: (board.reference.cast ?? []).map(c => ({ name: c.name, photos: c.photos, note: c.note })),
      beats: board.reference.beats.map(b => ({ id: b.id, start: b.start, end: b.end, label: b.label, original_text: b.originalText, text: b.text,
        cast: (b.recast?.cast ?? []).map(id => board.reference!.cast?.find(c => c.id === id)?.name ?? id), prompt: b.recast?.prompt ?? "", model: b.recast?.modelId ?? null,
        generations: b.recast?.jobs.length ?? 0, footage: b.candidates.find(c => c.id === b.selectedId)?.source ?? null })) } : null,
    script: (() => { const doc = readScriptDocument(board); return { text: doc.markdown, sections: doc.marks.map(m => ({ id: m.id, label: m.label, start: m.start, end: m.end, text: m.quote, needs_review: !!m.needsReview, visuals: m.visuals ?? [] })) }; })(),
    // Moments the creator marked, with what should happen at each, and the canvas joining them to effects and text.
    canvas: canvasGraph(board, source => assets.find(a => a.source === source)?.name ?? source.split("/").pop() ?? source),
    can_undo: snapshot.canUndo,
  };
}

/**
 * Agent draft of a Follow-reference recast plan: the reference video split into beats, the cast who replace
 * its people, and who appears in each beat. Saved as one revision-checked storyboard Undo step; it never
 * generates, charges or touches the timeline. Beats keep their chosen footage when their range is unchanged.
 */
export const storyboardReferenceDraftSchema = z.object({
  revision: z.number().int().nonnegative().describe("Storyboard revision from storyboard_get; a changed board is refused rather than overwritten"),
  source: z.string().min(1).describe("The reference video to follow, a ready project video from storyboard_get sources[].source"),
  title: z.string().trim().min(1).max(240).optional().describe("Name for the reference, e.g. 'Dangerous tour opening'"),
  cast: z.array(z.object({
    name: z.string().trim().min(1).max(100).describe("Who this is, as the creator would say it, e.g. 'Lead singer'"),
    photos: z.array(z.string().min(1)).min(1).max(4).describe("Project photos of this person from storyboard_get sources[] (kind image); the first is the main face"),
    note: z.string().max(500).default("").describe("Wardrobe or look to keep, if any"),
  }).strict()).max(20).default([]).describe("People who replace those in the reference"),
  recast_model: z.enum(["h3-max-recast", "wan-2.2-replace", "kling-o1-edit", "seedance-2-reference", "seedance-2.5-reference"]).default("h3-max-recast").describe("Default model: h3-max-recast keeps the shot and swaps up to four people; wan-2.2-replace one person, cheapest; kling-o1-edit prompt edits of 3–10 s; seedance reference models regenerate the shot copying its camera and action"),
  beats: z.array(z.object({
    start: seconds.describe("Beat start in seconds on the reference's clock"),
    end: seconds.describe("Beat end in seconds on the reference's clock"),
    label: z.string().trim().min(1).max(240).describe("Short beat name the creator scans, e.g. 'Frozen stance'"),
    original_text: z.string().max(1000).default("").describe("What the reference shows or says here"),
    text: z.string().max(500).default("").describe("Our on-screen text or lyric for this beat, if any"),
    cast: z.array(z.string().min(1)).max(4).default([]).describe("Names from cast, left to right as they appear on screen"),
    prompt: z.string().max(2500).default("").describe("What else to keep or change in this beat"),
    model: z.enum(["h3-max-recast", "wan-2.2-replace", "kling-o1-edit", "seedance-2-reference", "seedance-2.5-reference"]).optional().describe("Override the default model for this beat"),
  }).strict()).max(100).optional().describe("Beats in order without overlaps. Omit to split the reference at its shot cuts"),
  max_beat_seconds: z.number().min(1).max(30).default(15).describe("When splitting at cuts, longer shots are split evenly to this length"),
}).strict();
export type StoryboardReferenceDraft = z.infer<typeof storyboardReferenceDraftSchema>;

/** Pure: the board after a reference draft. `cuts` supplies beats when the draft omits them. */
export function applyStoryboardReferenceDraft(content: StoryboardContent, draft: StoryboardReferenceDraft, assets: StoryboardAsset[], cuts: { start: number; end: number }[] | null, id: () => string = () => crypto.randomUUID()): StoryboardContent {
  const bySource = new Map(assets.map(a => [a.source, a]));
  const reference = bySource.get(draft.source);
  if (!reference || reference.kind !== "video") throw new StoryboardDraftError(`Unknown reference video ${draft.source}. Use a video from storyboard_get.`);
  if (!reference.ready || !reference.duration) throw new StoryboardDraftError(`${reference.name} is still preparing; poll media_readiness first.`);
  const names = new Map<string, string>();
  const cast = draft.cast.map((member, i) => {
    if (names.has(member.name)) throw new StoryboardDraftError(`Cast ${i + 1}: ${member.name} is listed twice.`);
    for (const photo of member.photos) if (bySource.get(photo)?.kind !== "image") throw new StoryboardDraftError(`Cast ${member.name}: ${photo} is not a project photo.`);
    const castId = id(); names.set(member.name, castId);
    return { id: castId, name: member.name, photos: member.photos, note: member.note };
  });
  const planned = draft.beats ?? cuts?.map((c, i) => ({ ...c, label: `Shot ${i + 1}`, original_text: "", text: "", cast: [] as string[], prompt: "" }));
  if (!planned?.length) throw new StoryboardDraftError("Add beats, or omit them to split the reference at its cuts.");
  const previous = content.reference?.source === draft.source ? content.reference.beats : [];
  const beats = planned.map((b, i) => {
    if (b.end - b.start < 1 / 30) throw new StoryboardDraftError(`Beat ${i + 1}: end must be at least one frame after start.`);
    if (b.end > reference.duration! + 1e-3) throw new StoryboardDraftError(`Beat ${i + 1}: ends at ${b.end}s but the reference is ${reference.duration!.toFixed(2)}s.`);
    if (i && b.start < planned[i - 1].end - 1e-4) throw new StoryboardDraftError(`Beat ${i + 1} overlaps the beat before it.`);
    for (const name of b.cast) if (!names.has(name)) throw new StoryboardDraftError(`Beat ${i + 1}: ${name} is not in the cast.`);
    const kept = previous.find(p => Math.abs(p.start - b.start) < 1e-3 && Math.abs(p.end - b.end) < 1e-3);
    return { id: kept?.id ?? id(), label: b.label, start: b.start, end: b.end, originalText: b.original_text, text: b.text, note: kept?.note ?? "",
      candidates: kept?.candidates ?? [], ...(kept?.selectedId ? { selectedId: kept.selectedId } : {}), reviewed: false,
      recast: { cast: b.cast.map(n => names.get(n)!), prompt: b.prompt, ...("model" in b && b.model ? { modelId: b.model } : {}), jobs: kept?.recast?.jobs ?? [] } };
  });
  const photos = cast.flatMap(c => c.photos);
  return storyboardContentSchema.parse({ ...content, mode: "reference",
    sources: [...new Set([...content.sources, draft.source, ...photos, ...beats.flatMap(b => b.candidates.map(c => c.source))])],
    reference: { source: draft.source, title: draft.title ?? content.reference?.title ?? reference.name, sourceHash: reference.sourceHash, captions: content.reference?.captions ?? false, beats, cast, recastModel: draft.recast_model } });
}
