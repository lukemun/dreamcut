import { z } from "zod";
import { referenceTypographySchema } from "./reference-typography";

const frame = z.number().int().nonnegative();
const interval = z.tuple([frame, frame]).refine(([a, b]) => b > a, "Use a positive half-open interval");
const unit = z.number().finite().min(0).max(1);
const bounds = z.tuple([unit, unit, unit, unit]).refine(([l,t,r,b]) => r > l && b > t, "Bounds need positive area");
const evidence = z.array(z.string().min(1)).min(1);
// Unknown measurements are explicit and explained; guessed values are not required.
const observation = z.object({
  value: z.string().min(1).nullable(),
  basis: z.enum(["measured", "observed", "inferred", "unknown"]),
  evidence, limitations: z.array(z.string().min(1)),
}).strict().refine(x => x.basis === "unknown" ? x.value === null && x.limitations.length > 0 : x.value !== null,
  "Unknowns require null and a reason; observations require a value");
const source = referenceTypographySchema.shape.source.extend({
  frame_count: z.number().int().positive(), duration_seconds: z.number().finite().positive(),
});
const coverage = z.object({
  inspected_intervals: z.array(interval), continuous_playback: z.boolean(), audio_listened: z.boolean(),
  limitations: z.array(z.string()),
}).strict();
const occurrence = z.object({
  id: z.string().min(1), interval, effect_id: z.string().min(1),
  layer_ids: z.array(z.string()), role: z.string().min(1), evidence,
}).strict();
const effect = z.object({
  id: z.string().min(1), name: z.string().min(1),
  // Component steps belong to one perceived effect, not one catalog item per primitive.
  components: z.array(z.string().min(1)).min(1),
  interval, evidence, coverage,
  layers: z.array(z.object({
    id: z.string().min(1), role: z.string().min(1), z_order: z.number().int().nullable(),
    states: z.array(z.object({
      interval, bounds: bounds.nullable(), geometry: observation,
      crop_and_mask: observation, opacity_and_color: observation,
      motion: observation, blur: observation, easing: observation, evidence,
    }).strict()).min(1),
  }).strict()).min(1),
  cues: z.array(z.object({
    frame, pts: z.number().finite().nonnegative(), event: z.string().min(1),
    relation: observation,
  }).strict()),
  transitions: z.array(z.object({ interval, direction: observation, overlap: observation, treatment: observation }).strict()),
  sound: z.array(z.object({ interval, description: observation, isolation: z.enum(["isolated", "mixed", "unknown"]) }).strict()),
  text_presence: z.enum(["present", "absent", "uninspected"]),
  typography: referenceTypographySchema.nullable(),
  limitations: z.array(z.string()),
}).strict();

/** Whole-video structure and individual effects share source identity and measurements. */
export const referenceAnalysisSchema = z.object({
  schema_version: z.literal(1), scope: z.enum(["effect", "video"]), source,
  analysis_interval: interval, coverage,
  sections: z.array(z.object({
    id: z.string().min(1), interval, purpose: z.string().min(1),
    status: z.enum(["inspected", "partial", "uninspected"]),
    pacing: observation, shot_order: z.array(z.string()),
    text: observation, audio: observation, evidence,
  }).strict()).min(1),
  shots: z.array(z.object({ id: z.string().min(1), interval, description: observation }).strict()),
  text_presence: z.enum(["present", "absent", "uninspected"]),
  typography: referenceTypographySchema.nullable(),
  effects: z.array(effect), occurrences: z.array(occurrence),
  adaptation: z.object({
    revision: z.number().int().positive(), direction_refs: z.array(z.string()),
    decisions: z.array(z.string()), intentional_differences: z.array(z.string()), unresolved: z.array(z.string()),
  }).strict(),
}).strict().superRefine((record, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const [start,end] = record.analysis_interval;
  if (end > record.source.frame_count) issue("Analysis exceeds source frame count");
  if (record.scope === "video" && (start !== 0 || end !== record.source.frame_count)) issue("Video scope must account for the entire source");
  let cursor = start;
  const ids = new Set<string>();
  for (const section of record.sections) {
    if (ids.has(section.id)) issue("Duplicate section ID");
    ids.add(section.id);
    if (section.interval[0] !== cursor) issue("Sections must partition the analysis interval without gaps or overlap");
    cursor = section.interval[1];
  }
  if (cursor !== end) issue("Sections must reach the end of the analysis interval");
  const inside = (span: [number,number], parent: [number,number]) => span[0] >= parent[0] && span[1] <= parent[1];
  for (const span of record.coverage.inspected_intervals) if (!inside(span, record.analysis_interval)) issue("Coverage exceeds analysis interval");
  const shots = new Map(record.shots.map(shot => [shot.id, shot]));
  if (shots.size !== record.shots.length) issue("Duplicate shot ID");
  let shotEnd = start;
  for (const shot of record.shots) {
    if (!inside(shot.interval, record.analysis_interval) || shot.interval[0] < shotEnd) issue("Shots must be ordered, non-overlapping and within analysis");
    shotEnd = shot.interval[1];
  }
  for (const section of record.sections) for (const id of section.shot_order) {
    const shot = shots.get(id);
    if (!shot || shot.interval[1] <= section.interval[0] || shot.interval[0] >= section.interval[1]) issue("Section shot references must overlap that section");
  }
  if (record.text_presence === "present" && !record.typography) issue("Reference text requires a typography record, including text outside effects");
  if (record.text_presence !== "present" && record.typography) issue("Typography requires present text");
  if (record.typography && record.typography.source.sha256 !== record.source.sha256) issue("Reference typography must describe the same source");
  const effects = new Map(record.effects.map(e => [e.id,e]));
  if (effects.size !== record.effects.length) issue("Duplicate effect ID");
  for (const e of record.effects) {
    if (!inside(e.interval,record.analysis_interval)) issue("Effect exceeds analysis interval");
    if (e.text_presence === "present" && !e.typography) issue("Visible text requires measured typography or explicit unknown fields in a typography record");
    if (e.text_presence !== "present" && e.typography) issue("Typography requires present text");
    if (e.typography && (e.typography.source.sha256 !== record.source.sha256 || e.typography.source.width !== record.source.width || e.typography.source.height !== record.source.height)) issue("Typography must describe the same source");
    const layerIds = new Set(e.layers.map(l => l.id));
    if (layerIds.size !== e.layers.length) issue("Duplicate layer ID");
    for (const l of e.layers) {
      let previous = e.interval[0];
      for (const state of l.states) {
        if (!inside(state.interval,e.interval) || state.interval[0] < previous) issue("Layer states must be ordered, non-overlapping and inside the effect");
        previous = state.interval[1];
      }
    }
    for (const span of [...e.coverage.inspected_intervals, ...e.transitions.map(t=>t.interval), ...e.sound.map(s=>s.interval)]) if (!inside(span,e.interval)) issue("Effect evidence exceeds its interval");
    for (const cue of e.cues) if (cue.frame < e.interval[0] || cue.frame >= e.interval[1] || cue.pts >= record.source.duration_seconds) issue("Cue exceeds source/effect interval");
  }
  const occurrences = new Set<string>();
  for (const o of record.occurrences) {
    if (occurrences.has(o.id)) issue("Duplicate occurrence ID");
    occurrences.add(o.id);
    const e = effects.get(o.effect_id);
    if (!e) issue("Occurrence refers to an unknown effect");
    if (!inside(o.interval,record.analysis_interval)) issue("Occurrence exceeds analysis interval");
    if (e && o.layer_ids.some(id=>!e.layers.some(l=>l.id===id))) issue("Occurrence refers to an unknown layer");
  }
});
export type ReferenceAnalysis = z.infer<typeof referenceAnalysisSchema>;
