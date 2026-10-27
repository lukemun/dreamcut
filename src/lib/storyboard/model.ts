import { z } from "zod";
import { scriptPassageSchema, scriptDocumentSchema } from "./script";
import { storyboardCanvasSchema } from "./canvas";

const seconds = z.number().finite().min(0);
export const storyboardMarkSchema = z.object({
  id: z.string().uuid(), source: z.string().min(1), label: z.string().max(240),
  start: seconds, end: seconds.nullable(),
  /** What should happen at this moment: the creator's edit description. */
  note: z.string().max(2000).optional(),
}).passthrough().refine(m => m.end === null || m.end > m.start, "Range end must follow its start");
/** Most visuals one shot can carry; a talking point rarely needs more cutaways. */
export const MAX_SHOT_VISUALS = 20;
/**
 * A cutaway shown over a shot (screenshot, mockup, B-roll or motion graphic). `at` is seconds
 * from the shot's start on the shot clock; `start` is the in-point on a video source's clock
 * (photos use 0). The shot's own picture and sound keep running underneath, so speech is
 * never cut by a visual. The source window ends at start + duration (normal speed).
 */
export const storyboardVisualSchema = z.object({
  id: z.string().uuid(), source: z.string().min(1), start: seconds.default(0), at: seconds,
  duration: z.number().finite().min(1 / 30).max(3600),
  label: z.string().max(240), note: z.string().max(2000).default(""),
  /** Float: a card that rises in beside the speaker. Full: covers the frame. Absent reads as float. */
  placement: z.enum(["float", "full"]).optional(),
}).passthrough();
/** How a visual sits over its shot; boards saved before placement existed float. */
export const visualPlacement = (visual: { placement?: "float" | "full" }) => visual.placement ?? "float";
export type StoryboardVisual = z.infer<typeof storyboardVisualSchema>;
export const storyboardShotSchema = z.object({
  id: z.string().uuid(), source: z.string().min(1), markId: z.string().uuid().optional(),
  start: seconds, duration: z.number().finite().min(1 / 30).max(86400),
  transitionNote: z.string().max(2000).optional(),
  label: z.string().max(240), note: z.string().max(2000).default(""),
  text: z.string().max(1000).default(""), groupId: z.string().uuid().optional(),
  /** Absent on boards saved before visuals existed; read as none. Kept in time order. */
  visuals: z.array(storyboardVisualSchema).max(MAX_SHOT_VISUALS).optional(),
}).passthrough().superRefine((shot, ctx) => shotVisualIssues(shot).forEach(message => ctx.addIssue({ code: "custom", path: ["visuals"], message })));

/** Visuals sit inside their shot, in time order, without overlapping (one overlay lane). */
export function shotVisualIssues(shot: { duration: number; visuals?: { at: number; duration: number }[] }): string[] {
  const issues: string[] = [], visuals = shot.visuals ?? [];
  visuals.forEach((v, i) => {
    if (v.at + v.duration > shot.duration + 1e-4) issues.push(`Visual ${i + 1} runs past the end of its shot`);
    const previous = visuals[i - 1];
    if (previous && v.at < previous.at + previous.duration - 1e-4) issues.push(`Visual ${i + 1} overlaps the visual before it`);
  });
  return issues;
}
/** Someone who appears in a recast: a name the creator scans and up to four photos (first is the main one). */
export const castMemberSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100),
  photos: z.array(z.string().min(1)).min(1).max(4), note: z.string().max(500).default(""),
}).passthrough();
export type CastMember = z.infer<typeof castMemberSchema>;
/**
 * A beat's recast plan: who replaces the people on screen (left to right), what else to change, and the
 * generations made for it. Generated results become candidates only when the creator chooses one.
 */
export const beatRecastSchema = z.object({
  cast: z.array(z.string().uuid()).max(4).default([]),
  prompt: z.string().max(2500).default(""),
  modelId: z.string().max(80).optional(),
  jobs: z.array(z.object({
    id: z.string().uuid(),
    /** The reference window sent: the beat padded to the model's shortest input. */
    window: z.object({ start: seconds, end: seconds }).passthrough(),
  }).passthrough()).max(20).default([]),
}).passthrough();
export type BeatRecast = z.infer<typeof beatRecastSchema>;
export const referenceBeatSchema = z.object({
  id: z.string().uuid(), label: z.string().max(240), start: seconds, end: seconds,
  originalText: z.string().max(1000).default(""), text: z.string().max(500).default(""),
  note: z.string().max(2000).default(""), candidates: z.array(storyboardShotSchema).max(100),
  selectedId: z.string().uuid().optional(), reviewed: z.boolean().default(false),
  recast: beatRecastSchema.optional(),
}).passthrough().superRefine((beat, ctx) => {
  if (beat.end - beat.start < 1 / 30) ctx.addIssue({ code: "custom", message: "A reference beat must last at least one frame" });
  if (new Set(beat.candidates.map(s => s.id)).size !== beat.candidates.length) ctx.addIssue({ code: "custom", message: "Duplicate candidate" });
  if (beat.selectedId && !beat.candidates.some(s => s.id === beat.selectedId)) ctx.addIssue({ code: "custom", message: "Selected candidate is unavailable" });
});
export const storyboardReferenceSchema = z.object({
  independentStory: z.boolean().optional(),
  source: z.string().min(1), title: z.string().max(240), sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  beats: z.array(referenceBeatSchema).max(100), captions: z.boolean().default(false),
  /** Recast: the people who replace those in the reference, and the model new beats use by default. */
  cast: z.array(castMemberSchema).max(20).optional(),
  recastModel: z.string().max(80).optional(),
}).passthrough().superRefine((ref, ctx) => {
  if (new Set(ref.beats.map(b => b.id)).size !== ref.beats.length) ctx.addIssue({ code: "custom", message: "Duplicate reference beat" });
  const cast = new Set((ref.cast ?? []).map(c => c.id));
  if (cast.size !== (ref.cast ?? []).length) ctx.addIssue({ code: "custom", message: "Duplicate cast member" });
  if (ref.beats.some(b => b.recast?.cast.some(id => !cast.has(id)))) ctx.addIssue({ code: "custom", message: "A beat names someone who is not in the cast" });
  ref.beats.forEach((b, i) => { if (i && b.start < ref.beats[i - 1].end - .0001) ctx.addIssue({ code: "custom", message: "Reference beats must be ordered without overlaps" }); });
});
export type ReferenceBeat = z.infer<typeof referenceBeatSchema>;
export type StoryboardReference = z.infer<typeof storyboardReferenceSchema>;
export const storyboardContentSchema = z.object({
  scriptDocument: scriptDocumentSchema.optional(),
  script: z.array(scriptPassageSchema).max(500).optional(),
  mode: z.enum(["freeform", "reference"]).optional(),
  reference: storyboardReferenceSchema.optional(),
  sources: z.array(z.string().min(1)).max(10000),
  marks: z.array(storyboardMarkSchema).max(10000),
  shots: z.array(storyboardShotSchema).max(1000),
  groups: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(240) }).passthrough()).max(1000),
  canvas: storyboardCanvasSchema.optional(),
}).passthrough().superRefine((board, ctx) => {
  if (new Set(board.script?.map(p => p.id)).size !== (board.script?.length ?? 0)) ctx.addIssue({ code: "custom", message: "Duplicate script passage" });
  const candidateIds = board.reference?.beats.flatMap(b => b.candidates.map(c => c.id)) ?? [];
  if (new Set(candidateIds).size !== candidateIds.length) ctx.addIssue({ code: "custom", message: "Candidate identities must be unique across reference beats" });
  const sources = new Set(board.sources), groups = new Set(board.groups.map(g => g.id));
  const visuals = [...board.shots, ...(board.reference?.beats.flatMap(b => b.candidates) ?? [])].flatMap(s => s.visuals ?? []);
  for (const values of [board.sources, board.marks.map(m => m.id), [...board.shots.map(s => s.id), ...visuals.map(v => v.id)], board.groups.map(g => g.id)]) {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: "Duplicate storyboard identity" });
  }
  // Marks belong to any project media (validateStoryboardAssets checks it exists); the story uses only Visuals.
  for (const item of [...board.shots, ...(board.reference?.beats.flatMap(b => b.candidates) ?? []), ...visuals]) if (!sources.has(item.source)) ctx.addIssue({ code: "custom", message: "Load footage before using it" });
  if (board.canvas) {
    const marks = new Set(board.marks.map(m => m.id)), nodes = new Set(board.canvas.nodes.map(n => n.id));
    if (nodes.size !== board.canvas.nodes.length || new Set(board.canvas.edges.map(e => e.id)).size !== board.canvas.edges.length) ctx.addIssue({ code: "custom", message: "Duplicate canvas identity" });
    const momentMarks = board.canvas.nodes.flatMap(n => n.kind === "moment" && n.markId ? [n.markId] : []);
    if (momentMarks.some(id => !marks.has(id))) ctx.addIssue({ code: "custom", message: "A moment card's mark is missing" });
    if (new Set(momentMarks).size !== momentMarks.length) ctx.addIssue({ code: "custom", message: "A mark has two moment cards" });
    if (board.canvas.edges.some(e => !nodes.has(e.from) || !nodes.has(e.to))) ctx.addIssue({ code: "custom", message: "A line joins a card that is no longer on the canvas" });
  }
  if (board.reference && !sources.has(board.reference.source)) ctx.addIssue({ code: "custom", message: "Load the reference video first" });
  if (board.reference?.cast?.some(c => c.photos.some(p => !sources.has(p)))) ctx.addIssue({ code: "custom", message: "Load cast photos before using them" });
  for (const shot of board.shots) if (shot.groupId && !groups.has(shot.groupId)) ctx.addIssue({ code: "custom", message: "Unknown beat" });
  for (const group of board.groups) {
    const indices = board.shots.flatMap((s, i) => s.groupId === group.id ? [i] : []);
    if (indices.length && indices.at(-1)! - indices[0] + 1 !== indices.length) ctx.addIssue({ code: "custom", message: "Shots in a beat must stay together" });
  }
});
export type StoryboardContent = z.infer<typeof storyboardContentSchema>;
export type StoryboardMark = z.infer<typeof storyboardMarkSchema>;
export type StoryboardShot = z.infer<typeof storyboardShotSchema>;
export type StoryboardAsset = {
  source: string; name: string; kind: "image" | "video" | "audio"; assetId?: string; sourceHash?: string; cataloged?: boolean; url: string;
  preview?: string; previewReady?: boolean; preparationState?: "preparing" | "ready" | "failed"; preparationStage?: "queued" | "preview" | "full_quality"; duration?: number; ready: boolean; generated: boolean;
  capturedAt?: string; importedAt?: string; error?: string;
};
export const emptyStoryboard = (): StoryboardContent => ({ sources: [], marks: [], shots: [], groups: [] });
/** Selection in Footage is set membership; adding an included source is a no-op. */
export function insertStoryboardShot(board: StoryboardContent, shot: StoryboardShot, beforeId?: string, uniqueSource = false): StoryboardContent {
  if (uniqueSource && board.shots.some(s => s.source === shot.source)) return board;
  const target = board.shots.find(s => s.id === beforeId);
  const index = target ? board.shots.findIndex(s => target.groupId ? s.groupId === target.groupId : s.id === target.id) : board.shots.length;
  const shots = [...board.shots]; shots.splice(index, 0, shot);
  return { ...board, shots };
}
/** Takes a source out of the story: its shots, and its visuals over other shots. */
export function deselectStoryboardSource(board: StoryboardContent, source: string): StoryboardContent {
  const kept = board.shots.filter(s => s.source !== source);
  const shots = kept.map(s => s.visuals?.some(v => v.source === source) ? { ...s, visuals: s.visuals.filter(v => v.source !== source) } : s);
  if (kept.length === board.shots.length && shots.every((s, i) => s === kept[i])) return board;
  return { ...board, shots, groups: board.groups.filter(g => shots.some(s => s.groupId === g.id)) };
}
export type StoryboardSnapshot = { selection?: {source:string|null;sources?:string[];selected_at:string} | null; revision: number; content: StoryboardContent; canUndo: boolean; canRedo: boolean };

export function validateStoryboardAssets(board: StoryboardContent, assets: StoryboardAsset[]) {
  const bySource = new Map(assets.map(a => [a.source, a]));
  for (const source of board.sources) if (!bySource.has(source)) throw new Error(`Footage unavailable: ${source}`);
  if (board.reference) {
    const ref = bySource.get(board.reference.source);
    if (!ref || ref.kind !== "video" || !ref.ready || !ref.duration) throw new Error("Prepare the reference video first");
    if (board.reference.sourceHash && ref.sourceHash !== board.reference.sourceHash) throw new Error("Reference source changed. Choose the reference again before building");
    if (board.reference.beats.some(b => b.end > ref.duration! + .0001)) throw new Error("Reference beat exceeds the video");
  }
  for (const item of [...board.marks, ...board.shots, ...(board.reference?.beats.flatMap(b => b.candidates) ?? [])]) {
    const asset = bySource.get(item.source);
    if (!asset) throw new Error(`Footage unavailable: ${item.source}`);
    if (asset.kind === "audio" && "duration" in item) throw new Error("Audio stays in the media workspace until an audio edit is proposed");
    if (asset.kind === "image") {
      if (item.start !== 0 || ("end" in item && item.end !== null)) throw new Error("Photos have a single moment");
    } else {
      // Shots carry a duration, marks an end; unknown fields from newer versions don't change which.
      const duration = (item as { duration?: unknown }).duration;
      const end = typeof duration === "number" ? item.start + duration : (item as { end?: number | null }).end ?? item.start;
      if (!(asset.ready || (!("duration" in item) && asset.previewReady)) || !asset.duration || end > asset.duration + 0.0001) throw new Error(`Source range unavailable: ${asset.name}`);
    }
  }
  for (const photo of board.reference?.cast?.flatMap(c => c.photos) ?? []) if (bySource.get(photo)?.kind !== "image") throw new Error("Cast members need photos");
  for (const visual of [...board.shots, ...(board.reference?.beats.flatMap(b => b.candidates) ?? [])].flatMap(s => s.visuals ?? [])) {
    const asset = bySource.get(visual.source)!;
    if (asset.kind === "audio") throw new Error("A visual over a shot must be a photo or video");
    if (asset.kind === "image" ? visual.start !== 0 : !asset.ready || !asset.duration || visual.start + visual.duration > asset.duration + 0.0001) throw new Error(asset.kind === "image" ? "Photos have a single moment" : `Visual range unavailable: ${asset.name}`);
  }
}

/** Swap a visual with its neighbour in time while keeping the pair's outer bounds and gap. */
export function moveShotVisual(visuals: StoryboardVisual[], id: string, delta: -1 | 1): StoryboardVisual[] {
  const i = visuals.findIndex(v => v.id === id), j = i + delta;
  if (i < 0 || j < 0 || j >= visuals.length) return visuals;
  const [a, b] = i < j ? [visuals[i], visuals[j]] : [visuals[j], visuals[i]];
  const next = [...visuals], lo = Math.min(i, j);
  next[lo] = { ...b, at: a.at };
  next[lo + 1] = { ...a, at: +(b.at + b.duration - a.duration).toFixed(6) };
  return next;
}
/** Visuals are stored in time order. */
export const sortShotVisuals = (visuals: StoryboardVisual[]) => [...visuals].sort((a, b) => a.at - b.at);

export function storyboardUnits(board: StoryboardContent) {
  const units: StoryboardShot[][] = [];
  for (const shot of board.shots) {
    const last = units.at(-1);
    if (shot.groupId && last?.[0].groupId === shot.groupId) last.push(shot);
    else units.push([shot]);
  }
  return units;
}

/** Reordering a grouped shot moves its complete beat. Drop targets are before a unit. */
export function moveStoryboardShot(board: StoryboardContent, id: string, beforeId?: string): StoryboardContent {
  const units = storyboardUnits(board), from = units.findIndex(u => u.some(s => s.id === id));
  if (from < 0) return board;
  const moving = units[from];
  if (moving.some(s => s.id === beforeId)) return board;
  const rest = units.filter((_, i) => i !== from);
  const target = beforeId ? rest.findIndex(u => u.some(s => s.id === beforeId)) : rest.length;
  rest.splice(target < 0 ? rest.length : target, 0, moving);
  return { ...board, shots: rest.flat() };
}

export function groupStoryboardShots(board: StoryboardContent, ids: string[], name: string, id: string): StoryboardContent {
  const indices = board.shots.flatMap((s, i) => ids.includes(s.id) ? [i] : []);
  if (indices.length < 2 || indices.at(-1)! - indices[0] + 1 !== indices.length) throw new Error("Select adjacent shots to group into a beat");
  const shots = board.shots.map(s => ids.includes(s.id) ? { ...s, groupId: id } : s);
  return storyboardContentSchema.parse({ ...board, shots, groups: [...board.groups.filter(g => shots.some(s => s.groupId === g.id)), { id, name }] });
}

/** Reference footage is never implicitly compiled into the output. */
export function storyboardOutputShots(board: StoryboardContent): StoryboardShot[] {
  if (board.mode !== "reference" || board.reference?.independentStory) return board.shots;
  if (!board.reference?.beats.length) throw new Error("Add reference beats before building");
  return board.reference.beats.map((beat, i) => {
    const shot = beat.candidates.find(s => s.id === beat.selectedId);
    if (!shot) throw new Error(`Beat ${i + 1} needs footage`);
    if (shot.source === board.reference!.source) throw new Error("Choose replacement footage, not the reference video");
    return { ...shot, label: beat.label, text: beat.text, note: beat.note };
  });
}
