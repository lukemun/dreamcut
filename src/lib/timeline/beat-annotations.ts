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
const seconds = z.number().nonnegative().finite();
/** Bar starts under an assumed constant 4/4; `confidence` is how clearly one bar phase beat the others. */
const downbeatsSchema = z.object({ meter: z.literal(4), seconds: z.array(seconds).max(25000), confidence: z.number().min(0).max(1).finite() });
/** A bar start where the bass (or the whole mix) is much louder over the next two bars than the previous two. */
const dropSchema = z.object({ time_seconds: seconds, bass_rise_db: z.number().finite(), level_rise_db: z.number().finite() });
export type MusicalDownbeats = z.infer<typeof downbeatsSchema>;
export type MusicalDrop = z.infer<typeof dropSchema>;
const ordered = (times: number[], end: number, strict = true) => times.every((time, i) => time < end && (i === 0 || (strict ? time > times[i - 1]! : time >= times[i - 1]!)));
export const beatAnnotationSchema = z.discriminatedUnion("schema_version", [
  z.object({ schema_version: z.literal(1), ...beatAnnotationBase }),
  z.object({ schema_version: z.literal(2), ...beatAnnotationBase, hits: z.array(hitSchema).max(200000) }),
  z.object({ schema_version: z.literal(3), ...beatAnnotationBase, hits: z.array(hitSchema).max(200000),
    downbeats: z.union([z.literal("unknown"), downbeatsSchema]), drops: z.array(dropSchema).max(64),
    // The tempo a person or the music's maker stated; a fixed grid near it replaces tracked beats only when it fits better.
    tempo_hint_bpm: z.number().min(40).max(240).nullable(), beat_source: z.enum(["tracker", "fixed_tempo_fit"]),
    grid_strength: z.number().min(0).max(1).finite() }),
]).refine(value => ordered(value.beats_seconds, value.source_duration_seconds)
  && (value.schema_version === 1 || (ordered(value.hits.map(hit => hit.time_seconds), value.source_duration_seconds, false) && new Set(value.hits.map(hit => `${hit.time_seconds}:${hit.kind}`)).size === value.hits.length))
  && (value.schema_version !== 3 || ((value.downbeats === "unknown" || ordered(value.downbeats.seconds, value.source_duration_seconds)) && ordered(value.drops.map(drop => drop.time_seconds), value.source_duration_seconds))), "Beat, downbeat, drop and hit times must be ordered and within the source");
export type BeatAnnotation = z.infer<typeof beatAnnotationSchema>;
export type MusicalMarkerKind = "beat" | MusicalHitKind;
export type MusicalBeat = { time: number; source_time: number; index: number; kind: "beat"; confidence: 1; strength: 1 };
export type MusicalHit = { time: number; source_time: number; index: number; kind: MusicalHitKind; confidence: number; strength: number };
/** Source seconds to timeline seconds through the clip's own clock; times outside the playable window are dropped. */
function projectSourceTimes(media: Parameters<typeof resolveMediaTiming>[0], annotation: BeatAnnotation, times: number[]) {
  const timed = { ...media, _source_duration: annotation.source_duration_seconds };
  const timing = resolveMediaTiming(timed);
  const sourceEnd = annotation.source_duration_seconds - (media.trim_end ?? 0);
  return times.flatMap((source_time, index) => {
    if (source_time < timing.trimStart || source_time >= sourceEnd) return [];
    const local = sourceTimeToTimelineTime(timed, source_time);
    if (local >= timing.visiblePlayableTimelineDuration) return [];
    return [{ source_time, index, time: timing.timelineStart + timing.leadingHoldDuration + local }];
  });
}

export function projectBeatAnnotation(media: Parameters<typeof resolveMediaTiming>[0], annotation: BeatAnnotation): MusicalBeat[] {
  return projectSourceTimes(media, annotation, annotation.beats_seconds).map(beat => ({ ...beat, kind: "beat" as const, confidence: 1 as const, strength: 1 as const }));
}

/** Bar starts on the timeline; `bar` counts from the source's first detected downbeat. */
export function projectDownbeats(media: Parameters<typeof resolveMediaTiming>[0], annotation: BeatAnnotation) {
  if (annotation.schema_version !== 3 || annotation.downbeats === "unknown") return [];
  return projectSourceTimes(media, annotation, annotation.downbeats.seconds).map(({ index, ...time }) => ({ ...time, bar: index }));
}

export function projectDrops(media: Parameters<typeof resolveMediaTiming>[0], annotation: BeatAnnotation) {
  if (annotation.schema_version !== 3) return [];
  return projectSourceTimes(media, annotation, annotation.drops.map(drop => drop.time_seconds)).map(({ index, ...time }) => ({ ...time, ...annotation.drops[index]! }));
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
