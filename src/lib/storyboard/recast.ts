/**
 * Recast on the Follow-reference storyboard: each beat of the reference is sent to a recast model with the
 * cast's photos, and a chosen result becomes that beat's footage. Pure: no files, network or credits.
 */
import { assetDraftSchema, type AssetDraft } from "../generation/assets";
import { getAssetModel, modelTask, roleLimit } from "../generation/asset-models";
import type { CastMember, ReferenceBeat, StoryboardReference, StoryboardShot } from "./model";

export const DEFAULT_RECAST_MODEL = "h3-max-recast";
/** Models a beat can recast with, in the order the storyboard offers them. */
export const RECAST_MODELS = ["h3-max-recast", "wan-2.2-replace", "kling-o1-edit", "seedance-2-reference", "seedance-2.5-reference"] as const;

/** Shortest and longest reference window each model accepts. */
export function recastWindowBounds(modelId: string): { min: number; max: number } {
  switch (getAssetModel(assetDraftSchema.parse({ route: "fal", modelId })).adapter) {
    case "recast": return { min: 5, max: 30 };
    case "wan-replace": return { min: 2, max: 30 };
    case "o1-edit": return { min: 3, max: 10 };
    case "seedance-ref": return { min: 2, max: modelId === "seedance-2-reference" ? 15 : 30 };
    default: throw new Error(`${modelId} cannot recast a beat.`);
  }
}

/**
 * The window sent for a beat: the beat itself, padded evenly to the model's minimum (short concert cuts are
 * often two seconds) and kept inside the reference. The result is trimmed back to the beat when chosen.
 */
export function recastWindow(beat: Pick<ReferenceBeat, "start" | "end">, referenceSeconds: number, modelId: string) {
  const { min, max } = recastWindowBounds(modelId);
  const length = beat.end - beat.start;
  if (length > max + 1e-6) throw new Error(`This beat is ${length.toFixed(1)}s; this model takes at most ${max}s. Split the beat first.`);
  if (referenceSeconds < min) throw new Error(`The reference is shorter than this model's ${min}s minimum.`);
  const pad = Math.max(0, min - length) / 2;
  let start = beat.start - pad, end = beat.end + pad;
  if (start < 0) { end -= start; start = 0; }
  if (end > referenceSeconds) { start -= end - referenceSeconds; end = referenceSeconds; }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { start: round(Math.max(0, start)), end: round(Math.min(referenceSeconds, end)) };
}

const subjectPhotos = (cast: CastMember[], ids: string[]) => ids.flatMap(id => cast.find(c => c.id === id) ?? []);

/** The generation request for one beat. Throws a plain message when the beat is not ready to recast. */
export function beatRecastDraft(reference: StoryboardReference, beat: ReferenceBeat, referenceSeconds: number): { draft: AssetDraft; window: { start: number; end: number } } {
  const modelId = beat.recast?.modelId ?? reference.recastModel ?? DEFAULT_RECAST_MODEL;
  const model = getAssetModel(assetDraftSchema.parse({ route: "fal", modelId }));
  const people = subjectPhotos(reference.cast ?? [], beat.recast?.cast ?? []);
  if (!people.length && model.required.includes("subject")) throw new Error("Choose who appears in this beat.");
  const window = recastWindow(beat, referenceSeconds, modelId);
  const names = people.map(p => p.name);
  const seedance = model.adapter === "seedance-ref";
  const photos = (seedance ? people.flatMap(p => p.photos) : people.map(p => p.photos[0])).slice(0, roleLimit(model, "subject"));
  const tokens = seedance || model.adapter === "o1-edit";
  const who = names.length ? tokens
    ? `Replace the people with ${names.map((n, i) => `${n} (@Image${seedance ? people.slice(0, i).reduce((sum, p) => sum + p.photos.length, 0) + 1 : i + 1})`).join(", ")}`
    : `Left to right: ${names.join(", ")}` : "";
  const direction = beat.recast?.prompt.trim() || beat.note.trim();
  const prompt = [seedance ? "Recreate @Video1 shot for shot: same camera move, framing, timing and action." : "", who, direction].filter(Boolean).join(". ").slice(0, 2500);
  const references: AssetDraft["references"] = [
    { role: seedance ? "motion" : "source", source: reference.source, label: `${reference.title} · ${beat.label}`, window },
    ...photos.map(photo => ({ role: "subject" as const, source: photo, label: people.find(p => p.photos.includes(photo))?.name ?? "Cast" })),
  ];
  let draft = assetDraftSchema.parse({ route: "fal", modelId, prompt, aspect: "16:9", references,
    ...(seedance ? { duration: Math.min(model.durations.at(-1)!, Math.max(model.durations[0], Math.ceil(window.end - window.start))), resolution: "720p" } : {}) });
  draft = { ...draft, task: modelTask(draft), audio: model.adapter === "o1-edit" };
  return { draft, window };
}

/** The candidate shot for a chosen result: the generated clip trimmed back to the beat inside the padded window. */
export function recastCandidate(beat: ReferenceBeat, window: { start: number; end: number }, source: string, label: string): StoryboardShot {
  const start = Math.max(0, Math.round((beat.start - window.start) * 1e6) / 1e6);
  return { id: crypto.randomUUID(), source, start, duration: Math.round((beat.end - beat.start) * 1e6) / 1e6, label, note: "", text: "" };
}
