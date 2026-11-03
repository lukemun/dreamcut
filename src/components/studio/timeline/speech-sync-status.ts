import type { TimelineElement } from "./types";

export type SpeechSyncStatus = {
  state: "synced" | "drifted" | "missing";
  audioElementId: string | null;
  audioLaneKey: string | null;
  offsetSeconds: number | null;
  explicit: boolean;
};

const FRAME_TOLERANCE_SECONDS = 1 / 30 + 0.005;

function sourceClockAt(element: TimelineElement, timelineSeconds: number) {
  const rate = Math.max(0.001, element.playback_rate || 1);
  const receipt = (element.props as Record<string, unknown> | null)?.custom_cutout_receipt;
  const interval = receipt && typeof receipt === "object" && !Array.isArray(receipt)
    ? (receipt as Record<string, unknown>).source_interval_seconds
    : null;
  const derivativeSourceOffset = Array.isArray(interval) && typeof interval[0] === "number"
    ? interval[0]
    : 0;
  return derivativeSourceOffset + element.trim_start + (timelineSeconds - element.timeline_start) * rate;
}

/** Only persisted speech timing relationships confer speech-linked status. */
export function resolveSpeechSyncStatus(
  selected: TimelineElement | null,
  elements: TimelineElement[],
): SpeechSyncStatus | null {
  if (!selected || selected.type !== "video_clip" || selected.removed_at != null) return null;
  const explicitId = speechLinkSourceId(selected);
  if (!explicitId) return null;
  const audio = elements.find(element => element.id === explicitId && element.removed_at == null);
  if (!audio) return { state: "missing", audioElementId: explicitId, audioLaneKey: null, offsetSeconds: null, explicit: true };

  const reference = Math.max(selected.timeline_start, audio.timeline_start);
  const offsetSeconds = sourceClockAt(selected, reference) - sourceClockAt(audio, reference);
  return {
    state: Math.abs(offsetSeconds) <= FRAME_TOLERANCE_SECONDS ? "synced" : "drifted",
    audioElementId: audio.id,
    audioLaneKey: audio.lane_key,
    offsetSeconds,
    explicit: true,
  };
}

/** Disconnect only this picture. Existing media, source windows and audio stay intact. */
export function disconnectSpeechPatch(element: TimelineElement) {
  return {
    voice_clip_id: null,
    props: { ...element.props, speech_sync_binding: null, detached_audio_element_id: null },
  };
}

export function speechLinkSourceId(element: TimelineElement): string | null {
  const props = element.props ?? {};
  const binding = props.speech_sync_binding;
  const bindingSourceId = binding && typeof binding === "object"
    ? (binding as Record<string, unknown>).source_element_id
    : null;
  const explicitId = typeof bindingSourceId === "string"
    ? bindingSourceId
    : typeof element.voice_clip_id === "string"
      ? element.voice_clip_id
      : null;
  return explicitId;
}
