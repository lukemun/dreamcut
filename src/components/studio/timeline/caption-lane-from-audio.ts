"use client";

import { composeCaptionProps } from "@/lib/timeline/captions";
import { bindGeneratedCaption } from "@/lib/timeline/caption-audio-link";
import { isCaptionsLane, laneIndexFromKey } from "@/lib/timeline/lanes";
import type { TimelineElement } from "./types";

export type VoiceClipRecord = {
  id: string;
  beat_id: string | null;
  character_id: string | null;
  script_line_text: string | null;
};

export type CaptionElementPayload = {
  type: "caption_text";
  source_url: null;
  beat_id: string | null;
  voice_clip_id: string | null;
  character_id: string | null;
  timeline_start: number;
  duration: number;
  lane_key: string;
  lane_index: number;
  props: Record<string, unknown>;
};

export function nextCaptionsLaneKey(existingKeys: Iterable<string>) {
  const taken = new Set<number>();
  for (const key of existingKeys) {
    if (!isCaptionsLane(key)) continue;
    taken.add(laneIndexFromKey(key));
  }

  let index = 0;
  while (taken.has(index)) index += 1;
  return `captions_${index}`;
}

export function insertLaneBefore(laneKeys: string[], targetLaneKey: string, insertedLaneKey: string) {
  const nextKeys = laneKeys.filter((key) => key !== insertedLaneKey);
  const targetIndex = nextKeys.indexOf(targetLaneKey);
  if (targetIndex < 0) return [...nextKeys, insertedLaneKey];
  nextKeys.splice(targetIndex, 0, insertedLaneKey);
  return nextKeys;
}

export function buildCaptionPayloadsFromAudioLane(args: {
  audioElements: TimelineElement[];
  captionLaneKey: string;
  voiceClipsById: Map<string, VoiceClipRecord>;
}) {
  const payloads: CaptionElementPayload[] = [];

  for (const element of args.audioElements) {
    const linkedVoiceClipId = element.voice_clip_id ?? null;
    if ((element.type !== "vo_segment" && element.type !== "vo_full") || !linkedVoiceClipId) {
      continue;
    }
    const clip = args.voiceClipsById.get(linkedVoiceClipId);
    const text = clip?.script_line_text?.trim() ?? "";
    if (text.length === 0) continue;

    const payload: CaptionElementPayload = {
      type: "caption_text",
      source_url: null,
      beat_id: element.beat_id,
      voice_clip_id: linkedVoiceClipId,
      character_id: element.character_id,
      timeline_start: element.timeline_start,
      duration: element.duration,
      lane_key: args.captionLaneKey,
      lane_index: 0,
      props: {
        intent_key: `caption_voice:${linkedVoiceClipId}`,
        source_audio_lane_key: element.lane_key,
        source_audio_element_id: element.id,
        ...composeCaptionProps(text),
      },
    };
    bindGeneratedCaption(payload, element);
    payloads.push(payload);
  }

  return payloads;
}
