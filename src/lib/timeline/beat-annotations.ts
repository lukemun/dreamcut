import { toVisualFrame } from "./frame-quantization";
import { z } from "zod";
import { resolveMediaTiming } from "./media";
import { sourceTimeToTimelineTime } from "./speed-steps";

const beatAnnotationBase = {
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  recipe: z.string().min(1),
  analyzed_at: z.string(),
  source_duration_seconds: z.number().positive().finite(),
  tempo_bpm: z.number().nonnegative().finite(),
  tempo_confirmed: z.literal(false),
  beats_seconds: z.array(z.number().nonnegative().finite()).max(100000),
  downbeats: z.literal("unknown"),
};
export const musicalHitKindSchema = z.enum(["drum", "synth", "other", "bass", "accompaniment", "vocal"]);
export type MusicalHitKind = z.infer<typeof musicalHitKindSchema>;
const hitSchema = z.object({
  time_seconds: z.number().nonnegative().finite(),
  kind: musicalHitKindSchema,
  confidence: z.number().min(0).max(1).finite(),
  strength: z.number().min(0).max(1).finite(),
});
export const beatAnnotationSchema = z.discriminatedUnion("schema_version", [
  z.object({ schema_version: z.literal(1), ...beatAnnotationBase }),
  z.object({ schema_version: z.literal(2), ...beatAnnotationBase, hits: z.array(hitSchema).max(200000) }),
]).refine(value => value.beats_seconds.every((time, i, beats) => time < value.source_duration_seconds && (i === 0 || time > beats[i - 1]!))
  && (value.schema_version === 1 || (value.hits.every((hit, i, hits) => hit.time_seconds < value.source_duration_seconds && (i === 0 || hit.time_seconds >= hits[i - 1]!.time_seconds)) && new Set(value.hits.map(hit => `${hit.time_seconds}:${hit.kind}`)).size === value.hits.length)), "Beat and hit times must be ordered and within the source");
export type BeatAnnotation = z.infer<typeof beatAnnotationSchema>;
export type MusicalMarkerKind = "beat" | MusicalHitKind;
export type MusicalBeat = { time: number; source_time: number; index: number; kind: "beat"; confidence: 1; strength: 1 };
export type MusicalHit = { time: number; source_time: number; index: number; kind: MusicalHitKind; confidence: number; strength: number };
export function projectBeatAnnotation(media: Parameters<typeof resolveMediaTiming>[0], annotation: BeatAnnotation): MusicalBeat[] {
  const timed = { ...media, _source_duration: annotation.source_duration_seconds };
  const timing = resolveMediaTiming(timed);
  const sourceEnd = annotation.source_duration_seconds - (media.trim_end ?? 0);
  return annotation.beats_seconds.flatMap((source_time, index) => {
    if (source_time < timing.trimStart || source_time >= sourceEnd) return [];
    const local = sourceTimeToTimelineTime(timed, source_time);
    if (local >= timing.visiblePlayableTimelineDuration) return [];
    return [{ source_time, index, time: timing.timelineStart + timing.leadingHoldDuration + local, kind: "beat" as const, confidence: 1 as const, strength: 1 as const }];
  });
}

export function projectHitAnnotation(media: Parameters<typeof resolveMediaTiming>[0], annotation: BeatAnnotation): MusicalHit[] {
  if (annotation.schema_version === 1) return [];
  const timed = { ...media, _source_duration: annotation.source_duration_seconds };
  const timing = resolveMediaTiming(timed);
  const sourceEnd = annotation.source_duration_seconds - (media.trim_end ?? 0);
  return annotation.hits.flatMap((hit, index) => {
    if (hit.time_seconds < timing.trimStart || hit.time_seconds >= sourceEnd) return [];
    const local = sourceTimeToTimelineTime(timed, hit.time_seconds);
    if (local >= timing.visiblePlayableTimelineDuration) return [];
    return [{ ...hit, source_time: hit.time_seconds, index, time: timing.timelineStart + timing.leadingHoldDuration + local }];
  });
}

/** The player seeks to frames; raw floating-point comparisons can repeatedly select the same beat. */
export function adjacentMusicalBeats<T extends { time: number }>(beats: T[], playhead: number): { previous: T | undefined; next: T | undefined } {
  const frame = toVisualFrame(playhead);
  return {
    previous: beats.findLast(beat => toVisualFrame(beat.time) < frame),
    next: beats.find(beat => toVisualFrame(beat.time) > frame),
  };
}
