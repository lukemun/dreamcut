export const VISUAL_LANE_PREFIX = "visual_";
export const AUDIO_LANE_NARRATOR = "audio_narrator";
export const AUDIO_LANE_CHARACTER_PREFIX = "audio_character_";
export const MUSIC_LANE_KEY = "music_0";
export const SOUND_EFFECT_LANE_KEY = "sound_effect_0";
export const CAPTIONS_LANE_KEY = "captions_0";
const AUDIO_STACK_DELIMITER = ":";

export function visualLaneKey(index: number) {
  return `${VISUAL_LANE_PREFIX}${Math.max(0, Math.trunc(index))}`;
}

export function audioLaneKey(characterId: string | null | undefined) {
  const trimmed = (characterId ?? "").trim();
  return trimmed.length > 0 ? `${AUDIO_LANE_CHARACTER_PREFIX}${trimmed}` : AUDIO_LANE_NARRATOR;
}

export function isAudioLane(laneKey: string) {
  return laneKey.startsWith("audio_");
}

export function isMusicLane(laneKey: string) {
  return /^music_\d+$/.test(laneKey);
}

export function isSoundEffectLane(laneKey: string) {
  return /^sound_effect_\d+$/.test(laneKey);
}

export function isCaptionsLane(laneKey: string) {
  return /^captions_\d+$/.test(laneKey);
}

export function isLaneCompatibleWithElementType(type: string, laneKey: string) {
  if (typeof laneKey !== "string") return false;
  if (type === "video_clip" || type === "still" || type === "shape") return isVisualLane(laneKey);
  if (type === "vo_segment" || type === "vo_full") return isAudioLane(laneKey);
  if (type === "music") return isMusicLane(laneKey);
  if (type === "sound_effect") return isSoundEffectLane(laneKey);
  if (type === "caption_text") return isCaptionsLane(laneKey);
  return false;
}

export function assertLaneCompatibleWithElementType(type: string, laneKey: string) {
  if (isLaneCompatibleWithElementType(type, laneKey)) return;
  throw Object.assign(
    new Error(`Lane "${laneKey}" is not visible/editable for element type "${type}"`),
    { status: 400 },
  );
}

/** Every live actor must belong to an editor-visible, type-compatible lane. */
export function assertTimelineLanes(elements: readonly { type: string; lane_key: string; removed_at?: unknown }[]) {
  for (const element of elements) {
    if (element.removed_at == null) assertLaneCompatibleWithElementType(element.type, element.lane_key);
  }
}

export function laneStackIndex(laneKey: string) {
  if (laneKey.startsWith(VISUAL_LANE_PREFIX)) {
    const raw = Number.parseInt(laneKey.slice(VISUAL_LANE_PREFIX.length), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }
  if (laneKey === AUDIO_LANE_NARRATOR) return 0;
  if (laneKey.startsWith(`${AUDIO_LANE_NARRATOR}${AUDIO_STACK_DELIMITER}`)) {
    const raw = Number.parseInt(laneKey.slice(`${AUDIO_LANE_NARRATOR}${AUDIO_STACK_DELIMITER}`.length), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }
  if (laneKey.startsWith(AUDIO_LANE_CHARACTER_PREFIX)) {
    const delimiterIndex = laneKey.lastIndexOf(AUDIO_STACK_DELIMITER);
    if (delimiterIndex > AUDIO_LANE_CHARACTER_PREFIX.length) {
      const raw = Number.parseInt(laneKey.slice(delimiterIndex + 1), 10);
      return Number.isFinite(raw) && raw >= 0 ? raw : 0;
    }
    return 0;
  }
  if (isMusicLane(laneKey)) {
    const raw = Number.parseInt(laneKey.slice("music_".length), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }
  if (isSoundEffectLane(laneKey)) {
    const raw = Number.parseInt(laneKey.slice("sound_effect_".length), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }
  if (isCaptionsLane(laneKey)) {
    const raw = Number.parseInt(laneKey.slice("captions_".length), 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }
  return 0;
}

export function laneFamilyKey(laneKey: string) {
  if (laneKey.startsWith(VISUAL_LANE_PREFIX)) return laneKey;
  if (laneKey === AUDIO_LANE_NARRATOR || laneKey.startsWith(`${AUDIO_LANE_NARRATOR}${AUDIO_STACK_DELIMITER}`)) {
    return AUDIO_LANE_NARRATOR;
  }
  if (laneKey.startsWith(AUDIO_LANE_CHARACTER_PREFIX)) {
    const delimiterIndex = laneKey.lastIndexOf(AUDIO_STACK_DELIMITER);
    return delimiterIndex > AUDIO_LANE_CHARACTER_PREFIX.length ? laneKey.slice(0, delimiterIndex) : laneKey;
  }
  if (isMusicLane(laneKey)) return "music";
  if (isSoundEffectLane(laneKey)) return "sound_effect";
  if (isCaptionsLane(laneKey)) return "captions";
  return laneKey;
}

export function stackedLaneKey(baseLaneKey: string, stackIndex: number) {
  const nextIndex = Math.max(0, Math.trunc(stackIndex));
  if (isVisualLane(baseLaneKey)) return visualLaneKey(nextIndex);
  if (baseLaneKey === AUDIO_LANE_NARRATOR || baseLaneKey.startsWith(`${AUDIO_LANE_NARRATOR}${AUDIO_STACK_DELIMITER}`)) {
    return nextIndex === 0 ? AUDIO_LANE_NARRATOR : `${AUDIO_LANE_NARRATOR}${AUDIO_STACK_DELIMITER}${nextIndex}`;
  }
  if (baseLaneKey.startsWith(AUDIO_LANE_CHARACTER_PREFIX)) {
    const familyKey = laneFamilyKey(baseLaneKey);
    return nextIndex === 0 ? familyKey : `${familyKey}${AUDIO_STACK_DELIMITER}${nextIndex}`;
  }
  if (isMusicLane(baseLaneKey)) return `music_${nextIndex}`;
  if (isSoundEffectLane(baseLaneKey)) return `sound_effect_${nextIndex}`;
  if (isCaptionsLane(baseLaneKey)) return `captions_${nextIndex}`;
  return baseLaneKey;
}

export function laneIndexFromKey(laneKey: string) {
  if (isVisualLane(laneKey)) return laneStackIndex(laneKey);
  if (isMusicLane(laneKey)) return laneStackIndex(laneKey);
  if (isSoundEffectLane(laneKey)) return laneStackIndex(laneKey);
  if (isCaptionsLane(laneKey)) return laneStackIndex(laneKey);
  if (laneKey === AUDIO_LANE_NARRATOR || laneKey.startsWith(`${AUDIO_LANE_NARRATOR}${AUDIO_STACK_DELIMITER}`)) {
    return laneStackIndex(laneKey);
  }
  if (laneKey.startsWith(AUDIO_LANE_CHARACTER_PREFIX)) return laneStackIndex(laneKey);
  return 0;
}

export function isVisualLane(laneKey: string) {
  return laneKey.startsWith(VISUAL_LANE_PREFIX);
}
