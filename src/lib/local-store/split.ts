import type { TimelineElement } from "@/components/studio/timeline/types";
import { findElement, newId, newRowTimestamps, type TimelineFile } from "@/lib/local-store/store";
import { rebaseKeyframesForSplitRight } from "@/lib/timeline/keyframes";
import { isPlaybackReversed, resolveSpeedStepSegments, speedAtTimelineTime, timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";

// JS port of the Postgres RPC `timeline_split_element_atomic`
// (supabase/migrations/20260408054755_fix_timeline_split_rpc_voice_clip_column.sql).
// Mutates the timeline in place; the caller persists it.

export type SplitResult =
  | { ok: true; updated: TimelineElement; inserted: TimelineElement }
  | { ok: false; errorCode: "ELEMENT_NOT_FOUND" | "ELEMENT_LOCKED" | "INVALID_SPLIT_RANGE" };

export function splitElementAtomic(
  timeline: TimelineFile,
  projectId: string,
  elementId: string,
  splitAt: number,
  visualFps: number,
  minVisualFrames: number,
): SplitResult {
  const existing = findElement(timeline, elementId);
  if (!existing || existing.removed_at != null) {
    return { ok: false, errorCode: "ELEMENT_NOT_FOUND" };
  }
  if (existing.position_locked) {
    return { ok: false, errorCode: "ELEMENT_LOCKED" };
  }

  const isVisual = existing.type === "still" || existing.type === "video_clip";
  const minSeconds = Math.max(1, minVisualFrames) / Math.max(1, visualFps);
  const start = existing.timeline_start ?? 0;
  const duration = Math.max(minSeconds, existing.duration ?? 0);
  const end = start + duration;

  let leftStart: number;
  let leftDuration: number;
  let rightStart: number;
  let rightDuration: number;

  if (isVisual) {
    const startFrame = Math.round(start * visualFps);
    const endFrame = Math.round(end * visualFps);
    const splitFrame = Math.round(Math.max(start, Math.min(splitAt, end)) * visualFps);
    const leftFrames = splitFrame - startFrame;
    const rightFrames = endFrame - splitFrame;
    if (leftFrames < minVisualFrames || rightFrames < minVisualFrames) {
      return { ok: false, errorCode: "INVALID_SPLIT_RANGE" };
    }
    leftStart = startFrame / visualFps;
    leftDuration = leftFrames / visualFps;
    rightStart = splitFrame / visualFps;
    rightDuration = rightFrames / visualFps;
  } else {
    leftStart = start;
    leftDuration = splitAt - start;
    rightStart = splitAt;
    rightDuration = end - splitAt;
    if (leftDuration < minSeconds || rightDuration < minSeconds) {
      return { ok: false, errorCode: "INVALID_SPLIT_RANGE" };
    }
  }

  const splitFromProps = { ...(existing.props ?? {}), split_from_id: existing.id };
  const playbackRate =
    existing.playback_rate == null || existing.playback_rate <= 0 ? 1 : existing.playback_rate;

  const existingTrimStart = Math.max(0, existing.trim_start ?? 0);
  const existingTrimEnd = Math.max(0, existing.trim_end ?? 0);
  const trimEndIsNull = existing.trim_end == null;

  let leftTrimStart = existingTrimStart;
  let rightTrimStart = existingTrimStart + leftDuration * playbackRate;

  // trim_end is modeled as tail trim seconds, so after a split the left side
  // must trim away the source duration now owned by the right segment.
  let leftTrimEnd = existingTrimEnd + rightDuration * playbackRate;
  let rightTrimEnd = existingTrimEnd;
  // A reversed clip shows its source end first, so the left half owns the end of the used window.
  const reversed = isPlaybackReversed(existing);
  if (reversed) {
    leftTrimStart = existingTrimStart + rightDuration * playbackRate;
    leftTrimEnd = existingTrimEnd;
    rightTrimStart = existingTrimStart;
    rightTrimEnd = existingTrimEnd + leftDuration * playbackRate;
  }
  const steppedSpeed = resolveSpeedStepSegments(existing).length > 1;
  const rightPlaybackRate = steppedSpeed ? speedAtTimelineTime(existing, leftDuration) : existing.playback_rate;
  if (steppedSpeed) {
    rightTrimStart = timelineTimeToSourceTime(existing, leftDuration);
    leftTrimEnd = existingTrimEnd + timelineTimeToSourceTime(existing, duration) - rightTrimStart;
  }

  const hasSourceTimeline =
    existing.type === "video_clip"
    || existing.type === "music"
    || existing.type === "sound_effect"
    || existing.type === "vo_segment"
    || existing.type === "vo_full";

  if (existing.type === "video_clip") {
    leftTrimStart = Math.round(leftTrimStart * visualFps) / visualFps;
    rightTrimStart = Math.round(rightTrimStart * visualFps) / visualFps;
    leftTrimEnd = Math.round(leftTrimEnd * visualFps) / visualFps;
    if (!trimEndIsNull || reversed) {
      rightTrimEnd = Math.round(rightTrimEnd * visualFps) / visualFps;
    }
  }

  // Snapshot fields the inserted row inherits BEFORE mutating the left side
  // (the SQL reads them from v_existing, the pre-update row).
  const originalFadeOut = existing.fade_out;
  const originalTrimStart = existing.trim_start;
  const originalTrimEnd = existing.trim_end;

  existing.timeline_start = leftStart;
  existing.duration = leftDuration;
  if (hasSourceTimeline) {
    existing.trim_start = leftTrimStart;
    existing.trim_end = leftTrimEnd;
  }
  existing.fade_out = 0;
  existing.props = splitFromProps;
  existing.updated_at = new Date().toISOString();

  const inserted: TimelineElement = {
    id: newId(),
    project_id: projectId,
    type: existing.type,
    source_url: existing.source_url,
    // Keyframe times are clip-local; the right half's clock restarts at zero, so
    // its curves must shift by the left duration or every animated property pops
    // back to the curve's start at the cut. The left half keeps the original map
    // untouched — it never samples past its shortened duration.
    props: rebaseKeyframesForSplitRight(splitFromProps, leftDuration),
    beat_id: existing.beat_id ?? null,
    voice_clip_id: existing.voice_clip_id ?? null,
    character_id: existing.character_id ?? null,
    timeline_start: rightStart,
    duration: rightDuration,
    lane_key: existing.lane_key,
    lane_index: existing.lane_index,
    trim_start: hasSourceTimeline ? rightTrimStart : originalTrimStart,
    trim_end:
      hasSourceTimeline
        ? trimEndIsNull && !reversed
          ? null
          : rightTrimEnd
        : originalTrimEnd,
    volume: existing.volume,
    fade_in: 0,
    fade_out: originalFadeOut,
    playback_rate: rightPlaybackRate,
    position_locked: existing.position_locked,
    removed_at: null,
    removed_reason: null,
    ...newRowTimestamps(),
  };
  timeline.elements.push(inserted);

  return { ok: true, updated: existing, inserted };
}
