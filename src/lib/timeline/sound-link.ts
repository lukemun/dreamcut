import type { TimelineElement } from "@/components/studio/timeline/types";
import { quantizeVisualTrimValue } from "./frame-quantization";

/**
 * A sound clip linked to a picture clip (for example a motion graphic's whooshes and hits)
 * keeps a fixed offset from that clip's start. Stored on the sound as `props.follows_visual`.
 * Unlinking removes the prop; the sound then edits on its own.
 */
export const SOUND_LINK_PROP = "follows_visual";
export type SoundLink = { element_id: string; offset_seconds: number; cue?: string };

export function soundLink(element: Pick<TimelineElement, "props">): SoundLink | null {
  const link = element.props?.[SOUND_LINK_PROP] as Partial<SoundLink> | undefined;
  return link && typeof link.element_id === "string" && typeof link.offset_seconds === "number" && Number.isFinite(link.offset_seconds)
    ? { element_id: link.element_id, offset_seconds: link.offset_seconds, ...(typeof link.cue === "string" ? { cue: link.cue } : {}) } : null;
}

/** Seconds into the picture where a linked sound's anchor falls: a named cue of a motion graphic, or the clip start. */
function anchorSeconds(picture: TimelineElement, link: SoundLink): number {
  if (!link.cue) return 0;
  const cues = (picture.props?.motion_timing as { cues?: Record<string, number> } | undefined)?.cues;
  return typeof cues?.[link.cue] === "number" ? cues[link.cue] : 0;
}

const round = (seconds: number) => Math.round(seconds * 1e6) / 1e6;
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * Keep linked sounds with their picture after an edit. Mutates `after` and returns the ids it changed.
 * - A new linked sound, or one whose anchor moved (the picture moved, or its cue moved because a
 *   timing knob changed the render), starts at the anchor plus its offset.
 * - A linked sound moved on its own stays linked at its new offset from the anchor.
 * A sound whose picture is missing or removed, or that is locked, is left where it is.
 */
export function reconcileSoundLinks(before: readonly TimelineElement[], after: TimelineElement[]): string[] {
  const prior = new Map(before.map(element => [element.id, element]));
  const live = new Map(after.filter(element => element.removed_at == null).map(element => [element.id, element]));
  const changed: string[] = [];
  for (const sound of after) {
    // A locked sound stays put; it is moved deliberately or unlocked first.
    if (sound.removed_at != null || sound.position_locked) continue;
    const link = soundLink(sound);
    if (!link) continue;
    const picture = live.get(link.element_id);
    if (!picture) continue;
    const priorSound = prior.get(sound.id), priorPicture = prior.get(link.element_id);
    const anchor = picture.timeline_start + anchorSeconds(picture, link);
    const pictureMoved = !priorPicture || !same(priorPicture.timeline_start + anchorSeconds(priorPicture, link), anchor);
    const soundMoved = !!priorSound && !same(priorSound.timeline_start, sound.timeline_start);
    if (soundMoved && !pictureMoved) {
      const offset = round(sound.timeline_start - anchor);
      if (!same(offset, link.offset_seconds)) { sound.props = { ...sound.props, [SOUND_LINK_PROP]: { ...link, offset_seconds: offset } }; changed.push(sound.id); }
      continue;
    }
    const start = round(Math.max(0, anchor + link.offset_seconds));
    if (!same(start, sound.timeline_start)) { sound.timeline_start = start; changed.push(sound.id); }
  }
  return changed;
}

type Timing = { duration: number; cues: Record<string, number>; canvasTrack?: unknown };
/**
 * A motion-graphic clip whose render changed takes the render's timing: `props.motion_timing` (its
 * cue times, which linked sounds anchor to) and, when it showed the whole render, its length. A clip
 * marked `ripple_after` (an inserted opener) pushes everything after it by the change in length,
 * except the sounds linked to it, which follow their cues. Mutates `elements`; returns changed ids.
 */
export function refreshMotionTiming(elements: TimelineElement[], ids: Iterable<string>, timingFor: (sourceUrl: string | null) => Timing | null, existingIds?: ReadonlySet<string>): string[] {
  const changed = new Set<string>();
  for (const id of ids) {
    const clip = elements.find(element => element.id === id && element.removed_at == null && element.type === "video_clip");
    const timing = clip ? timingFor(clip.source_url) : null;
    if (!clip || !timing) continue;
    // The render's crop window (where its picture sits on the canvas) follows the render, or clears for a whole-frame one.
    const { canvasTrack, ...cueTiming } = timing;
    if (JSON.stringify(clip.props?.source_canvas_track ?? null) !== JSON.stringify(canvasTrack ?? null)) {
      const { source_canvas_track: _dropped, ...rest } = clip.props ?? {};
      clip.props = canvasTrack ? { ...rest, source_canvas_track: canvasTrack } : rest;
      changed.add(clip.id);
    }
    const prior = clip.props?.motion_timing as Timing | undefined;
    // A clip just created plays its whole render; an existing one follows only if it showed the whole previous render.
    const created = existingIds ? !existingIds.has(clip.id) : false;
    // Render lengths are on the render's own clock; a sped-up clip spends 1/rate of that on the timeline.
    const rate = clip.playback_rate > 0 ? clip.playback_rate : 1;
    const previousLength = prior?.duration ?? (created ? clip.duration * rate : Number(clip.props?.source_duration_seconds));
    const whole = (clip.trim_start ?? 0) === 0 && Number.isFinite(previousLength) && Math.abs(clip.duration - previousLength / rate) < 1 / 30 + 1e-6;
    if (JSON.stringify(prior) !== JSON.stringify(cueTiming) || !same(Number(clip.props?.source_duration_seconds), timing.duration)) {
      clip.props = { ...clip.props, motion_timing: cueTiming, source_duration_seconds: timing.duration };
      changed.add(clip.id);
    }
    // On the frame grid, like every placed picture: a render length summed from holds (52.367 s) is not
    // a whole number of frames, and would run a fraction of a frame into the next clip.
    const length = quantizeVisualTrimValue(timing.duration / rate);
    if (!whole || same(clip.duration, length)) continue;
    const oldEnd = clip.timeline_start + clip.duration, delta = length - clip.duration;
    clip.duration = length;
    clip.trim_end = 0;
    clip.props = { ...clip.props, source_start_seconds: 0, source_end_seconds: timing.duration,
      ...(clip.props?.source_interval ? { source_interval: { start_seconds: 0, duration_seconds: timing.duration } } : {}) };
    changed.add(clip.id);
    if (clip.props?.ripple_after !== true) continue;
    for (const other of elements) {
      if (other.id === clip.id || other.removed_at != null || other.timeline_start < oldEnd - 1e-6) continue;
      if (soundLink(other)?.element_id === clip.id) continue;
      other.timeline_start = round(other.timeline_start + delta);
      changed.add(other.id);
    }
  }
  return [...changed];
}
