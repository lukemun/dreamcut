import {currentFrameRate} from "@/lib/timeline/frame-rate-scope";
import type { TimelineElement } from "@/components/studio/timeline/types";
import type { TimelineElementPatch } from "@/lib/timeline/contracts";
import {
  computePlaybackRateTimelineDuration,
  derivePlaybackRateVideoProps,
  supportsOverflowHold,
  supportsPlaybackRate,
  WAVEFORM_SUPPORTED_TYPES,
} from "@/lib/timeline/media";
import { stripStillVideoWrapperMetadata } from "@/lib/timeline/visual-asset-metadata";
import {
  isVisualElementType,
  COMPOSITION_FPS,
  minTimelineDurationSeconds,
  quantizeVisualFrameSpan,
  quantizeVisualTrimValue,
} from "@/lib/timeline/frame-quantization";
import { adjustEnvelopeForDuration, normalizeVolumeEnvelope, type EnvelopePoint } from "@/lib/timeline/volume-envelope";
import { assertActiveWordTimingPatch } from "@/lib/timeline/caption-timing-validation";
import { assertLaneCompatibleWithElementType } from "@/lib/timeline/lanes";
import { stripRuntimePreviewProps } from "@/lib/timeline/runtime-preview-props";

/** Shared mutation semantics for single and batch routes. Mutates `element`, never persists. */
/** `fps` is the project frame rate; picture timing snaps to its grid. */
export function applyElementPatch(element: TimelineElement, input: TimelineElementPatch, { fps = currentFrameRate() }: { fps?: number } = {}): TimelineElement {
  if (element.removed_at != null) throw Object.assign(new Error("Timeline element not found"), { status: 404 });
  if (element.props?.outline_parent_id) {
    const clockFields = ["timeline_start", "duration", "trim_start", "trim_end", "playback_rate", "source_url", "type"] as const;
    const geometryFields = ["media_scale", "media_offset_x", "media_offset_y", "keyframes", "semantic_layout", "mask_inset", "playback_reverse"];
    if (clockFields.some((field) => input[field] !== undefined && input[field] !== element[field])
      || geometryFields.some((field) => input.props?.[field] !== undefined && JSON.stringify(input.props[field]) !== JSON.stringify(element.props?.[field]))) {
      throw Object.assign(new Error("This outline follows its subject. Edit timing and position on the subject layer."), { status: 400 });
    }
  }
  const changesDirection = input.props !== undefined && (input.props?.playback_reverse === true) !== (element.props?.playback_reverse === true);
  if (element.position_locked && (changesDirection || [input.timeline_start, input.duration, input.trim_start, input.trim_end, input.playback_rate].some((value) => value !== undefined))) {
    throw Object.assign(new Error("This clip is locked. Unlock it before editing timing."), { status: 400 });
  }
  const patch = { ...input };
  const nextType = patch.type ?? element.type;
  if (patch.type !== undefined || patch.lane_key !== undefined) {
    assertLaneCompatibleWithElementType(nextType, patch.lane_key ?? element.lane_key);
  }
  if (patch.playback_rate !== undefined && patch.duration === undefined && supportsPlaybackRate(nextType) && element.playback_rate > 0 && patch.playback_rate !== element.playback_rate) {
    patch.duration = computePlaybackRateTimelineDuration({
      type: nextType, duration: element.duration, trim_start: element.trim_start, trim_end: element.trim_end,
      playback_rate: element.playback_rate, props: (element.props ?? {}) as Record<string, unknown>,
    }, patch.playback_rate, { minDuration: minTimelineDurationSeconds(fps) });
  }
  if (patch.playback_rate !== undefined && patch.playback_rate !== element.playback_rate && supportsOverflowHold(nextType)) {
    const mergedProps = { ...((element.props ?? {}) as Record<string, unknown>), ...((patch.props ?? {}) as Record<string, unknown>) };
    patch.props = derivePlaybackRateVideoProps({
      type: nextType,
      duration: patch.duration ?? element.duration,
      trim_start: patch.trim_start ?? element.trim_start,
      trim_end: patch.trim_end !== undefined ? patch.trim_end : element.trim_end,
      playback_rate: element.playback_rate,
      props: mergedProps,
    }, patch.playback_rate, { minDuration: minTimelineDurationSeconds(fps) }) ?? mergedProps;
  }
  const touchesTiming = [patch.timeline_start, patch.duration, patch.playback_rate, patch.trim_start, patch.trim_end].some((value) => value !== undefined);
  if (patch.duration !== undefined) patch.duration = Math.max(minTimelineDurationSeconds(fps), patch.duration);
  if (isVisualElementType(nextType) && touchesTiming) {
    const span = quantizeVisualFrameSpan(patch.timeline_start ?? element.timeline_start, patch.duration ?? element.duration, { fps });
    patch.timeline_start = span.timeline_start;
    patch.duration = span.duration;
  }
  if (nextType === "video_clip") {
    if (patch.props) patch.props = stripStillVideoWrapperMetadata(patch.props);
    if (patch.trim_start !== undefined) patch.trim_start = quantizeVisualTrimValue(Math.max(0, patch.trim_start), fps);
    if (patch.trim_end != null) patch.trim_end = quantizeVisualTrimValue(Math.max(0, patch.trim_end), fps);
  }
  if (WAVEFORM_SUPPORTED_TYPES.has(nextType)) {
    const finalDuration = patch.duration ?? element.duration;
    const durationChanged = patch.duration !== undefined && patch.duration !== element.duration;
    const existingProps = (element.props ?? {}) as Record<string, unknown>;
    const patchProps = (patch.props ?? {}) as Record<string, unknown>;
    const patchEnvelope = patchProps.volume_envelope as EnvelopePoint[] | undefined;
    const existingEnvelope = existingProps.volume_envelope as EnvelopePoint[] | undefined;
    if (Array.isArray(patchEnvelope)) {
      patch.props = { ...existingProps, ...patchProps, volume_envelope: durationChanged ? adjustEnvelopeForDuration(patchEnvelope, finalDuration) : normalizeVolumeEnvelope(patchEnvelope, finalDuration) };
    } else if (durationChanged && Array.isArray(existingEnvelope)) {
      patch.props = { ...existingProps, volume_envelope: adjustEnvelopeForDuration(existingEnvelope, finalDuration) };
    }
  } else if (patch.props) {
    const props = {
      ...((element.props ?? {}) as Record<string, unknown>),
      ...patch.props,
    };
    delete props.volume_envelope;
    patch.props = props;
  }
  assertActiveWordTimingPatch(element, patch);
  if (element.type === "caption_text"
    && ((patch.timeline_start !== undefined && patch.timeline_start !== element.timeline_start)
      || (patch.duration !== undefined && patch.duration !== element.duration))) {
    // A deliberate cue edit establishes a new timing baseline. Automatic audio
    // projection writes its draft directly and therefore retains its source handles.
    patch.props = { ...(element.props ?? {}), ...patch.props, caption_audio_binding: null };
  }
  if (element.type === "caption_text" && patch.props
    && patch.props.text !== undefined && patch.props.text !== element.props?.text) {
    patch.props = { ...patch.props, caption_audio_binding: null };
  }
  if (patch.props) patch.props = stripRuntimePreviewProps(patch.props);
  Object.assign(element, patch, { updated_at: new Date().toISOString() });
  return element;
}
