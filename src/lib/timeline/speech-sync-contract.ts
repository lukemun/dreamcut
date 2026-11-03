import type { TimelineElement } from "@/components/studio/timeline/types";
import type { TimelineElementPatch } from "@/lib/timeline/contracts";
import { quantizeVisualFrameSpan, quantizeVisualTrimValue } from "@/lib/timeline/frame-quantization";
import { captionAudioSourceId, captionFollowsAudio } from "./caption-audio-link";
import {
  getSpeedSourceWindow,
  sourceTimeToTimelineTime,
  speedAtTimelineTime,
  timelineTimeToSourceTime,
} from "./speed-steps";

const TIMING_FIELDS = ["timeline_start", "duration", "trim_start", "trim_end", "playback_rate"] as const;
const EPSILON = 0.0015;

export function touchesTimelineTiming(patch: TimelineElementPatch | Record<string, unknown>) {
  return TIMING_FIELDS.some((field) => patch[field] !== undefined);
}

function objectProp(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finiteProp(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sourceClockAt(source: TimelineElement, timelineSeconds: number) {
  return timelineTimeToSourceTime(source, timelineSeconds - source.timeline_start);
}

export function speechClockDependentIds(elements: TimelineElement[], sourceElementId: string) {
  return elements.filter((candidate) => {
    if (candidate.id === sourceElementId || candidate.removed_at != null) return false;
    if (candidate.type === "caption_text") return captionFollowsAudio(candidate) && captionAudioSourceId(candidate) === sourceElementId;
    const props = candidate.props as Record<string, unknown> | null;
    const sync = objectProp(props?.speech_sync_binding);
    return candidate.voice_clip_id === sourceElementId
      || sync?.source_element_id === sourceElementId
      || props?.caption_source_element_id === sourceElementId;
  }).map((candidate) => candidate.id);
}

function dependentSourceWindow(candidate: TimelineElement, sourceBefore: TimelineElement) {
  const props = candidate.props as Record<string, unknown> | null;
  const binding = objectProp(props?.speech_sync_binding);
  const boundStart = finiteProp(binding, "source_start_seconds");
  const boundEnd = finiteProp(binding, "source_end_seconds");
  if (binding?.source_element_id === sourceBefore.id && boundStart != null && boundEnd != null) {
    return { start: boundStart, end: boundEnd, displayEnd: boundEnd, kind: "visual" as const };
  }
  const captionStart = finiteProp(props, "caption_source_start_seconds");
  const captionEnd = finiteProp(props, "caption_source_end_seconds");
  if (props?.caption_source_element_id === sourceBefore.id && captionStart != null && captionEnd != null) {
    return {
      start: captionStart,
      end: captionEnd,
      displayEnd: finiteProp(props, "caption_hold_until_source_seconds") ?? captionEnd,
      kind: "caption" as const,
    };
  }
  if (candidate.voice_clip_id !== sourceBefore.id) return null;
  return {
    start: sourceClockAt(sourceBefore, candidate.timeline_start),
    end: sourceClockAt(sourceBefore, candidate.timeline_start + candidate.duration),
    displayEnd: sourceClockAt(sourceBefore, candidate.timeline_start + candidate.duration),
    kind: candidate.type === "caption_text" ? "caption" as const : "linked" as const,
  };
}

/** Re-project every dependent onto a changed speech clock without changing its source-word/source-frame bounds. */
export function deriveSpeechClockDependentPatches(elements: TimelineElement[], sourceBefore: TimelineElement, sourceAfter: TimelineElement, includeCaptions = true) {
  const patches = new Map<string, TimelineElementPatch>();
  const rate = Math.max(0.001, sourceAfter.playback_rate || 1);
  const sourceProps = sourceAfter.props as Record<string, unknown> | null;
  const sourceDuration = finiteProp(sourceProps, "source_duration_seconds")
    ?? sourceAfter.trim_start + sourceAfter.duration * rate + (sourceAfter.trim_end ?? 0);
  const retainedEnd = getSpeedSourceWindow({ ...sourceAfter, props: {
    ...(sourceAfter.props ?? {}),
    source_duration_seconds: sourceDuration,
  } }).end ?? sourceDuration - (sourceAfter.trim_end ?? 0);
  for (const candidate of elements) {
    if (candidate.id === sourceBefore.id || candidate.removed_at != null) continue;
    if (candidate.type === "caption_text" && (!includeCaptions || !captionFollowsAudio(candidate))) continue;
    const window = dependentSourceWindow(candidate, sourceBefore);
    if (!window) continue;
    const localStart = sourceTimeToTimelineTime(sourceAfter, window.start);
    const localEnd = sourceTimeToTimelineTime(sourceAfter, window.displayEnd);
    const rawStart = sourceAfter.timeline_start + localStart;
    const rawDuration = localEnd - localStart;
    const localRate = speedAtTimelineTime(sourceAfter, localStart);
    if (
      rawStart < -EPSILON
      || rawDuration <= 0
      || window.start < sourceAfter.trim_start - EPSILON
      || window.displayEnd > retainedEnd + EPSILON
    ) {
      throw Object.assign(new Error("The timing edit would move a linked picture or caption outside the retained speech window."), { status: 400 });
    }
    if (candidate.type === "video_clip" && window.kind === "visual") {
      const props = candidate.props as Record<string, unknown> | null;
      const binding = objectProp(props?.speech_sync_binding)!;
      const receipt = objectProp(props?.custom_cutout_receipt);
      const interval = receipt?.source_interval_seconds;
      const derivativeDuration = finiteProp(props, "source_duration_seconds");
      if (!Array.isArray(interval) || typeof interval[0] !== "number" || derivativeDuration == null) {
        throw Object.assign(new Error("The linked presenter view is missing its source receipt."), { status: 400 });
      }
      const span = quantizeVisualFrameSpan(rawStart, rawDuration);
      const trimStart = quantizeVisualTrimValue(Math.max(0, window.start - interval[0]));
      const trimEnd = quantizeVisualTrimValue(Math.max(0, derivativeDuration - trimStart - span.duration * rate));
      patches.set(candidate.id, {
        timeline_start: span.timeline_start, duration: span.duration, trim_start: trimStart, trim_end: trimEnd, playback_rate: rate,
        props: { ...(props ?? {}), speech_sync_binding: { ...binding, source_playback_rate: rate } },
      });
      continue;
    }
    const props = candidate.props as Record<string, unknown> | null;
    patches.set(candidate.id, {
      timeline_start: Number(Math.max(0, rawStart).toFixed(3)), duration: Number(rawDuration.toFixed(3)),
      ...(window.kind === "caption" ? { props: { ...(props ?? {}), caption_source_playback_rate: localRate } } : {}),
    });
  }
  return patches;
}

function sameNumber(left: number | null | undefined, right: number | null | undefined) {
  if (left == null || right == null) return left === right;
  return Math.abs(left - right) <= EPSILON;
}

function assertMatchesPatch(element: TimelineElement, expected: TimelineElementPatch) {
  for (const field of TIMING_FIELDS) {
    if (expected[field] !== undefined && !sameNumber(element[field], expected[field])) {
      throw Object.assign(new Error("A linked picture or caption was included without being synchronized to the edited speech clock."), { status: 400 });
    }
  }
  const expectedProps = objectProp(expected.props);
  if (expectedProps?.speech_sync_binding) {
    const actual = objectProp((element.props as Record<string, unknown> | null)?.speech_sync_binding);
    const expectedBinding = objectProp(expectedProps.speech_sync_binding);
    if (!actual || !expectedBinding || !sameNumber(finiteProp(actual, "source_playback_rate"), finiteProp(expectedBinding, "source_playback_rate"))) {
      throw Object.assign(new Error("A linked presenter view has stale speech timing evidence."), { status: 400 });
    }
  }
  if (expectedProps?.caption_source_playback_rate !== undefined) {
    const actualProps = element.props as Record<string, unknown> | null;
    if (!sameNumber(finiteProp(actualProps, "caption_source_playback_rate"), finiteProp(expectedProps, "caption_source_playback_rate"))) {
      throw Object.assign(new Error("A linked caption has stale speech timing evidence."), { status: 400 });
    }
  }
}

/** Validate the final atomic state, not merely the presence of IDs in a batch. */
export function assertSpeechSynchronizationAfterMutation(input: { before: TimelineElement[]; after: TimelineElement[]; touchedElementIds: Set<string> }) {
  const afterById = new Map(input.after.map((element) => [element.id, element]));
  for (const beforeElement of input.before) {
    const afterElement = afterById.get(beforeElement.id);
    if (!afterElement || !input.touchedElementIds.has(beforeElement.id)) continue;
    const timingChanged = TIMING_FIELDS.some((field) => !sameNumber(beforeElement[field], afterElement[field]));
    if (!timingChanged) continue;

    const dependentPatches = deriveSpeechClockDependentPatches(input.before, beforeElement, afterElement, false);
    for (const [dependentId, expected] of dependentPatches) {
      if (!input.touchedElementIds.has(dependentId)) {
        throw Object.assign(new Error("Move the linked picture and captions together to preserve synchronization."), { status: 400 });
      }
      const dependent = afterById.get(dependentId);
      if (!dependent) throw Object.assign(new Error("A linked picture or caption is missing."), { status: 400 });
      assertMatchesPatch(dependent, expected);
    }

    const binding = objectProp((beforeElement.props as Record<string, unknown> | null)?.speech_sync_binding);
    const sourceId = typeof binding?.source_element_id === "string" ? binding.source_element_id : null;
    if (sourceId) {
      const sourceBefore = input.before.find((candidate) => candidate.id === sourceId);
      const sourceAfter = afterById.get(sourceId);
      if (sourceBefore && sourceAfter) {
        const expected = deriveSpeechClockDependentPatches(input.before, sourceBefore, sourceAfter).get(beforeElement.id);
        if (expected) assertMatchesPatch(afterElement, expected);
      }
    }
  }
}

export function assertSpeechBoundVisualTimingPatch(element: TimelineElement, patch: TimelineElementPatch) {
  if (!touchesTimelineTiming(patch)) return;
  const existingBinding = objectProp((element.props as Record<string, unknown> | null)?.speech_sync_binding);
  if (!existingBinding) return;
  const nextBinding = objectProp((patch.props as Record<string, unknown> | undefined)?.speech_sync_binding);
  if (!nextBinding) throw Object.assign(new Error("This presenter view is linked to speech. Move or trim it through the linked source controls so picture, audio, and captions stay synchronized."), { status: 400 });
}

export function assertSpeechClockMutationIsBundled(input: { elements: TimelineElement[]; element: TimelineElement; patch: TimelineElementPatch; bundledElementIds?: Set<string> }) {
  if (!touchesTimelineTiming(input.patch)) return;
  // Captions are derived by the server in the same transaction; only pictures need explicit bundling.
  const dependentIds = speechClockDependentIds(input.elements, input.element.id)
    .filter((id) => input.elements.find((row) => row.id === id)?.type !== "caption_text");
  if (dependentIds.length === 0) return;
  const missing = dependentIds.filter((id) => !input.bundledElementIds?.has(id));
  if (missing.length > 0) {
    throw Object.assign(new Error(`The timing edit is missing ${missing.length} linked picture/caption ${missing.length === 1 ? "view" : "views"}.`), { status: 400 });
  }
}
