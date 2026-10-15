import { createHash } from "node:crypto";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { captionAudioSourceId, captionFollowsAudio } from "@/lib/timeline/caption-audio-link";
import { captionTextMatchesWordTimings, normalizeWordTimings, type CaptionWordTiming } from "@/lib/timeline/active-word-captions";
import {
  getSpeedSourceWindow,
  sourceTimeToTimelineTime,
  speedAtTimelineTime,
  timelineTimeToSourceTime,
} from "@/lib/timeline/speed-steps";
import { readTimelineTombstoneArchive } from "./timeline-compaction";

const CLOCK = ["timeline_start", "duration", "trim_start", "trim_end", "playback_rate", "removed_at"] as const;
const EPS = 0.0015;
const seconds = (value: number) => Number(value.toFixed(9));
type Binding = { version: 1; start: number; end: number; text: string; words: CaptionWordTiming[] };
const reason = (id: string) => `caption_follow_audio:${id}`;
const rateOf = (e: TimelineElement) => Math.max(0.001, e.playback_rate || 1);
const clock = (e: TimelineElement, t: number) => timelineTimeToSourceTime(e, t - e.timeline_start);
const speedClock = (e: TimelineElement) => JSON.stringify((e.props?.keyframes && (e.props.keyframes as Record<string, unknown>).playback_rate) ?? null);
const clockChanged = (before: TimelineElement, after: TimelineElement) => (
  CLOCK.some((field) => before[field] !== after[field]) || speedClock(before) !== speedClock(after)
);
function fail(message: string): never { throw Object.assign(new Error(message), { status: 400 }); }

function bindingFor(caption: TimelineElement, source: TimelineElement): Binding {
  const props = caption.props ?? {};
  const stored = props.caption_audio_binding as Binding | undefined;
  if (stored != null && (stored.version !== 1 || !Number.isFinite(stored.start) || !Number.isFinite(stored.end)
    || stored.end <= stored.start || typeof stored.text !== "string" || !Array.isArray(stored.words)
    || normalizeWordTimings(stored.words).length !== stored.words.length)) fail("Caption audio binding is invalid. Unlink and relink the caption before retiming speech.");
  if (stored?.version === 1 && Number.isFinite(stored.start) && Number.isFinite(stored.end)
    && stored.end > stored.start && typeof stored.text === "string" && Array.isArray(stored.words)) return structuredClone(stored);
  const words = normalizeWordTimings(props.wordTimings);
  const text = typeof props.text === "string" ? props.text : "";
  const start = clock(source, caption.timeline_start);
  const end = clock(source, caption.timeline_start + caption.duration);
  return { version: 1, start, end, text,
    words: captionTextMatchesWordTimings(text, words) ? words.map((word) => ({
      ...word,
      start: clock(source, caption.timeline_start + word.start),
      end: clock(source, caption.timeline_start + word.end),
    })) : [] };
}

function retainedWindow(source: TimelineElement): [number, number] {
  const window = getSpeedSourceWindow(source);
  const visibleEnd = timelineTimeToSourceTime(source, source.duration);
  return [window.start, Math.min(window.end ?? Infinity, visibleEnd)];
}

function project(caption: TimelineElement, source: TimelineElement, binding: Binding) {
  const [sourceStart, sourceEnd] = retainedWindow(source);
  const start = Math.max(binding.start, sourceStart);
  const end = Math.min(binding.end, sourceEnd);
  const props = { ...(caption.props ?? {}), caption_source_element_id: source.id, caption_audio_binding: binding };
  caption.props = props;
  if (source.removed_at != null || end <= start + EPS) {
    caption.removed_at = source.removed_at ?? source.updated_at;
    caption.removed_reason = reason(source.id);
    return;
  }
  const partial = start > binding.start + EPS || end < binding.end - EPS;
  if (partial && binding.words.length === 0) fail("This caption has no word alignment for that cut. Unlink it from audio or generate aligned captions first.");
  if (binding.words.some((word) => (word.start < start - EPS && word.end > start + EPS)
    || (word.start < end - EPS && word.end > end + EPS))) {
    fail("That cut crosses a caption word. Cut between aligned words, or unlink the caption from audio first.");
  }
  const words = binding.words.filter((word) => word.start >= start - EPS && word.end <= end + EPS);
  if (binding.words.length && !words.length) {
    caption.removed_at = source.updated_at;
    caption.removed_reason = reason(source.id);
    return;
  }
  const displayStart = partial && words.length ? Math.max(start, words[0]!.start) : start;
  const localStart = sourceTimeToTimelineTime(source, displayStart);
  const localEnd = sourceTimeToTimelineTime(source, end);
  caption.timeline_start = source.timeline_start + localStart;
  caption.duration = localEnd - localStart;
  caption.removed_at = null;
  caption.removed_reason = null;
  caption.props = { ...props,
    text: words.length === binding.words.length ? binding.text : words.map((word) => word.text).join(" "),
    caption_source_start_seconds: displayStart,
    caption_source_end_seconds: words.at(-1)?.end ?? end,
    caption_hold_until_source_seconds: end,
    caption_source_playback_rate: speedAtTimelineTime(source, localStart),
    ...(binding.words.length ? { wordTimings: words.map((word) => ({ ...word,
      start: seconds(Math.max(0, sourceTimeToTimelineTime(source, word.start) - localStart)),
      end: seconds(Math.min(caption.duration, sourceTimeToTimelineTime(source, word.end) - localStart)),
    })) } : {}),
  };
}

/** Mutates only a draft. Used before persistence AND in proposal preview/approval. */
export function reconcileCaptionFollowers(before: TimelineElement[], after: TimelineElement[], projectId?: string): string[] {
  const afterById = new Map(after.map((row) => [row.id, row]));
  const changedSources = new Set(before.filter((row) => {
    const next = afterById.get(row.id);
    return ["vo_segment", "vo_full", "video_clip"].includes(row.type) && next
      && clockChanged(row, next);
  }).map((row) => row.id));
  if (!changedSources.size) return [];
  if (projectId && changedSources.size) {
    const known = new Set(before.map((row) => row.id));
    const archived = readTimelineTombstoneArchive(projectId).elements.filter((row) => {
      const sourceId = captionAudioSourceId(row);
      return !known.has(row.id) && sourceId && changedSources.has(sourceId)
        && captionFollowsAudio(row) && row.removed_reason === reason(sourceId);
    });
    before = [...before, ...structuredClone(archived)];
    for (const row of archived) if (!after.some((entry) => entry.id === row.id)) after.push(structuredClone(row));
  }
  const touched = new Set<string>();
  const beforeIds = new Set(before.map((row) => row.id));
  for (const sourceBefore of before) {
    if (!changedSources.has(sourceBefore.id)) continue;
    const sourceAfter = afterById.get(sourceBefore.id);
    if (!sourceAfter || !clockChanged(sourceBefore, sourceAfter)) continue;
    const isChild = (row: TimelineElement) => {
      if (row.props?.caption_split_source_element_id === sourceBefore.id) return true;
      const seen = new Set<string>();
      let parent = row.props?.split_from_id;
      while (typeof parent === "string" && !seen.has(parent)) {
        if (parent === sourceBefore.id) return true;
        if (beforeIds.has(parent)) return false;
        seen.add(parent);
        parent = after.find((entry) => entry.id === parent)?.props?.split_from_id;
      }
      return false;
    };
    const children = after.filter((row) => !beforeIds.has(row.id) && row.type === sourceBefore.type
      && row.removed_at == null && row.source_url === sourceBefore.source_url
      && row.props?.intentional_visual_overlay !== true && isChild(row));
    for (const original of before) {
      if (!captionFollowsAudio(original) || captionAudioSourceId(original) !== sourceBefore.id) continue;
      if (original.removed_at != null && original.removed_reason !== reason(sourceBefore.id)) continue;
      const caption = after.find((row) => row.id === original.id);
      // Explicit caption replacement/deletion/unlinking wins over automatic follow.
      if (!caption || !captionFollowsAudio(caption)
        || (caption.removed_at != null && caption.removed_reason !== reason(sourceBefore.id))) continue;
      if (caption.position_locked) fail("A linked caption is locked. Unlock it or unlink it from audio before editing the speech.");
      const binding = bindingFor(original, sourceBefore);
      // Text corrections invalidate the cached lexical map; never resurrect old wording.
      if (caption.props?.text !== original.props?.text) fail("Edit the caption text separately from its audio timing.");
      if (children.length) {
        for (const child of children) {
          const [start, end] = retainedWindow(child);
          if (binding.end <= start + EPS || binding.start >= end - EPS) continue;
          const hash = createHash("sha256").update(`${original.id}:${child.id}`).digest("hex");
          const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
          const copy = structuredClone(original);
          copy.id = id;
          copy.voice_clip_id = original.voice_clip_id === sourceBefore.id ? child.id : original.voice_clip_id;
          project(copy, child, binding);
          if (copy.removed_at != null) continue;
          // Partition ownership permanently: extending either half must not duplicate the other half's words.
          copy.props = { ...copy.props, caption_audio_binding: { ...binding, start: Math.max(start, binding.start), end: Math.min(end, binding.end),
            text: copy.props?.text, words: binding.words.filter((word) => word.start >= start - EPS && word.end <= end + EPS) } };
          after.push(copy);
          touched.add(copy.id);
        }
      }
      project(caption, sourceAfter, binding);
      if (children.length) {
        if (caption.removed_at != null) {
          // This cue now belongs only to a later segment (or the removed middle).
          // Extending the left segment must not resurrect a duplicate of it.
          caption.removed_reason = "caption_split_rebound";
          caption.props = { ...caption.props, caption_audio_binding: null };
          touched.add(caption.id);
          continue;
        }
        const [, end] = retainedWindow(sourceAfter);
        caption.props = { ...caption.props, caption_audio_binding: { ...binding, end: Math.min(end, binding.end),
          text: caption.props?.text, words: binding.words.filter((word) => word.end <= end + EPS) } };
      }
      caption.updated_at = sourceAfter.updated_at;
      touched.add(caption.id);
    }
  }
  return [...touched];
}
