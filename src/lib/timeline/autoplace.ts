import {
  audioLaneKey,
  CAPTIONS_LANE_KEY,
  isVisualLane,
  laneIndexFromKey,
  MUSIC_LANE_KEY,
  visualLaneKey,
} from "@/lib/timeline/lanes";
import { composeCaptionProps } from "@/lib/timeline/captions";
import {
  minTimelineDurationSeconds,
  quantizeVisualFrameSpan,
} from "@/lib/timeline/frame-quantization";
import { writeVideoClipTimingMetadata } from "@/lib/timeline/video-clip-metadata";
import { writeVisualAssetMetadata } from "@/lib/timeline/visual-asset-metadata";

const DEFAULT_STILL_DURATION_SECONDS = 5;
const DEFAULT_VIDEO_DURATION_SECONDS = 5;
const DEFAULT_EMPTY_BEAT_GAP_SECONDS = 1;

type ExistingElement = {
  id: string;
  type: string;
  beat_id: string | null;
  voice_clip_id?: string | null;
  music_track_id?: string | null;
  timeline_start: number;
  duration: number;
  lane_key: string;
  lane_index: number;
  props: Record<string, unknown> | null;
  removed_at?: string | null;
  removed_reason?: string | null;
};

type SlotVisual = {
  slotId: string;
  type: "video_clip" | "still";
  sourceUrl: string;
  stillVideoUrl?: string | null;
  stillVideoDurationSeconds?: number | null;
  endStillVideoUrl?: string | null;
  endStillVideoDurationSeconds?: number | null;
  durationSeconds?: number | null;
};

type BeatInput = {
  id: string;
  sort_order: number;
  captionText: string | null;
  durationSeconds: number | null;
  visuals: SlotVisual[];
};

type VoiceClipInput = {
  id: string;
  beat_id: string;
  character_id: string | null;
  duration: number | null;
  sourceUrl: string;
};

type MusicTrackInput = {
  id: string;
  duration_seconds: number | null;
  url: string;
} | null;

type TimelineInsert = {
  project_id: string;
  type: string;
  source_url: string | null;
  props: Record<string, unknown>;
  beat_id: string | null;
  voice_clip_id: string | null;
  character_id: string | null;
  timeline_start: number;
  duration: number;
  lane_key: string;
  lane_index: number;
  volume?: number;
};

type AutoplaceInput = {
  projectId: string;
  beats: BeatInput[];
  selectedVoiceClips: VoiceClipInput[];
  selectedMusicTrack: MusicTrackInput;
  existingActiveElements: ExistingElement[];
  removedElements: ExistingElement[];
};

type AutoplaceWarning = {
  code: "VISUAL_CONFLICT";
  message: string;
  beatId: string;
  laneKey: string;
};

export type AutoplaceResult = {
  inserts: TimelineInsert[];
  warnings: AutoplaceWarning[];
};

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function getIntentKeyFromProps(props: Record<string, unknown> | null | undefined) {
  if (!props || typeof props !== "object") return null;
  const value = props.intent_key;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function findIntentElement(elements: ExistingElement[], intentKey: string) {
  return elements.find((element) => getIntentKeyFromProps(element.props) === intentKey) ?? null;
}

function hasIntentSuppressedByUser(elements: ExistingElement[], intentKey: string) {
  return elements.some(
    (element) =>
      getIntentKeyFromProps(element.props) === intentKey
      && element.removed_reason === "user"
      && element.removed_at,
  );
}

function findLegacyVisualForBeat(elements: ExistingElement[], beatId: string) {
  return elements.find(
    (element) =>
      element.beat_id === beatId
      && isVisualLane(element.lane_key)
      && (element.type === "video_clip" || element.type === "still"),
  ) ?? null;
}

function nextAvailableVisualLaneKey(
  start: number,
  duration: number,
  occupied: Array<{ laneKey: string; start: number; end: number }>,
) {
  const end = start + duration;
  let lane = 0;
  while (lane < 32) {
    const key = visualLaneKey(lane);
    const conflicts = occupied.some(
      (segment) => segment.laneKey === key && overlap(start, end, segment.start, segment.end),
    );
    if (!conflicts) return key;
    lane += 1;
  }
  return visualLaneKey(31);
}

function resolveVideoDuration(visual: SlotVisual, existingElement?: ExistingElement | null) {
  const existingDuration = Number(existingElement?.duration);
  if (Number.isFinite(existingDuration) && existingDuration > 0) {
    return existingDuration;
  }

  const requested = Number(visual.durationSeconds);
  if (Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  return DEFAULT_VIDEO_DURATION_SECONDS;
}

function resolveStillDuration(
  beat: BeatInput,
  placeableStillCount: number,
  existingElement?: ExistingElement | null,
) {
  const existingDuration = Number(existingElement?.duration);
  if (Number.isFinite(existingDuration) && existingDuration > 0) {
    return existingDuration;
  }

  const beatDuration = Number(beat.durationSeconds);
  if (Number.isFinite(beatDuration) && beatDuration > 0 && placeableStillCount > 0) {
    return beatDuration / placeableStillCount;
  }

  return DEFAULT_STILL_DURATION_SECONDS;
}

export function buildAutoplace(input: AutoplaceInput): AutoplaceResult {
  const inserts: TimelineInsert[] = [];
  const warnings: AutoplaceWarning[] = [];

  const beats = [...input.beats].sort((a, b) => a.sort_order - b.sort_order);

  const occupiedVisualSegments: Array<{ laneKey: string; start: number; end: number }> = input.existingActiveElements
    .filter((element) => isVisualLane(element.lane_key) && (element.type === "video_clip" || element.type === "still"))
    .map((element) => ({
      laneKey: element.lane_key,
      start: Number(element.timeline_start) || 0,
      end: (Number(element.timeline_start) || 0) + Math.max(0.001, Number(element.duration) || 0),
    }));

  const beatStartById = new Map<string, number>();
  const beatEndById = new Map<string, number>();
  let beatCursor = 0;

  for (const beat of beats) {
    beatStartById.set(beat.id, round3(beatCursor));

    let advancedThisBeat = false;
    const allowLegacyBeatIntentCompatibility = beat.visuals.length === 1;
    const placeableStillCount = beat.visuals.filter((visual) => {
      if (visual.type !== "still") return false;
      const intentKey = `visual:${visual.slotId}`;
      const suppressed =
        hasIntentSuppressedByUser(input.removedElements, intentKey)
        || (allowLegacyBeatIntentCompatibility && hasIntentSuppressedByUser(input.removedElements, `visual:${beat.id}`));
      return !suppressed;
    }).length;

    for (const visual of beat.visuals) {
      const intentKey = `visual:${visual.slotId}`;
      const existingSlotVisual = findIntentElement(input.existingActiveElements, intentKey);
      const legacyBeatVisual = allowLegacyBeatIntentCompatibility
        ? findIntentElement(input.existingActiveElements, `visual:${beat.id}`) ?? findLegacyVisualForBeat(input.existingActiveElements, beat.id)
        : null;
      const suppressed =
        hasIntentSuppressedByUser(input.removedElements, intentKey)
        || (allowLegacyBeatIntentCompatibility && hasIntentSuppressedByUser(input.removedElements, `visual:${beat.id}`));

      if (suppressed) {
        continue;
      }

      const anchoredVisual = existingSlotVisual ?? legacyBeatVisual;
      const visualDuration = Math.max(
        minTimelineDurationSeconds(),
        visual.type === "video_clip"
          ? resolveVideoDuration(visual, anchoredVisual)
          : resolveStillDuration(beat, placeableStillCount, anchoredVisual),
      );

      if (anchoredVisual) {
        beatCursor += visualDuration;
        advancedThisBeat = true;
        continue;
      }

      const laneKey = nextAvailableVisualLaneKey(beatCursor, visualDuration, occupiedVisualSegments);
      if (laneKey !== visualLaneKey(0)) {
        warnings.push({
          code: "VISUAL_CONFLICT",
          message: "Visual overlap detected during auto-place; placed in a secondary visual lane.",
          beatId: beat.id,
          laneKey,
        });
      }

      const quantizedSpan = quantizeVisualFrameSpan(beatCursor, visualDuration);
      let props: Record<string, unknown> = {
        intent_key: intentKey,
        autoplaced: true,
        autoplaced_at: new Date().toISOString(),
        slot_id: visual.slotId,
      };
      if (visual.type === "video_clip" && typeof visual.durationSeconds === "number" && Number.isFinite(visual.durationSeconds)) {
        props = writeVideoClipTimingMetadata(props, {
          sourceDurationSeconds: visual.durationSeconds,
        });
      }
      if (visual.type === "video_clip" && typeof visual.endStillVideoUrl === "string" && visual.endStillVideoUrl.length > 0) {
        props = writeVisualAssetMetadata(props, {
          overflowHoldStillVideoUrl: visual.endStillVideoUrl,
          overflowHoldStillVideoDurationSeconds:
            typeof visual.endStillVideoDurationSeconds === "number" && Number.isFinite(visual.endStillVideoDurationSeconds)
              ? visual.endStillVideoDurationSeconds
              : null,
        });
      }
      if (visual.type === "still" && typeof visual.stillVideoUrl === "string" && visual.stillVideoUrl.length > 0) {
        props = writeVisualAssetMetadata(props, {
          renderAssetType: "still_video",
          sourceStillVideoUrl: visual.stillVideoUrl,
          sourceStillVideoDurationSeconds:
            typeof visual.stillVideoDurationSeconds === "number" && Number.isFinite(visual.stillVideoDurationSeconds)
              ? visual.stillVideoDurationSeconds
              : null,
        });
      }
      inserts.push({
        project_id: input.projectId,
        type: visual.type,
        source_url: visual.sourceUrl,
        props,
        beat_id: beat.id,
        voice_clip_id: null,
        character_id: null,
        timeline_start: quantizedSpan.timeline_start,
        duration: quantizedSpan.duration,
        lane_key: laneKey,
        lane_index: laneIndexFromKey(laneKey),
        volume: 1,
      });

      occupiedVisualSegments.push({
        laneKey,
        start: quantizedSpan.timeline_start,
        end: quantizedSpan.timeline_start + quantizedSpan.duration,
      });
      beatCursor = quantizedSpan.timeline_start + quantizedSpan.duration;
      advancedThisBeat = true;
    }

    if (!advancedThisBeat) {
      beatCursor += DEFAULT_EMPTY_BEAT_GAP_SECONDS;
    }

    beatEndById.set(beat.id, round3(beatCursor));
  }

  const voiceClips = [...input.selectedVoiceClips].sort((a, b) => {
    const beatA = beatStartById.get(a.beat_id) ?? Number.MAX_SAFE_INTEGER;
    const beatB = beatStartById.get(b.beat_id) ?? Number.MAX_SAFE_INTEGER;
    if (beatA !== beatB) return beatA - beatB;
    return a.id.localeCompare(b.id);
  });

  const audioCursorByLane = new Map<string, number>();
  for (const clip of voiceClips) {
    const intentKey = `voice:${clip.id}`;
    const hasExisting = Boolean(findIntentElement(input.existingActiveElements, intentKey))
      || input.existingActiveElements.some((element) => element.voice_clip_id === clip.id);
    const suppressed = hasIntentSuppressedByUser(input.removedElements, intentKey);
    if (hasExisting || suppressed) continue;

    const laneKey = audioLaneKey(clip.character_id);
    const beatStart = beatStartById.get(clip.beat_id) ?? 0;
    const laneCursor = audioCursorByLane.get(laneKey) ?? beatStart;
    const start = Math.max(beatStart, laneCursor);
    const duration = Math.max(minTimelineDurationSeconds(), clip.duration ?? 1.5);

    inserts.push({
      project_id: input.projectId,
      type: "vo_segment",
      source_url: clip.sourceUrl,
      props: {
        intent_key: intentKey,
        autoplaced: true,
        autoplaced_at: new Date().toISOString(),
      },
      beat_id: clip.beat_id,
      voice_clip_id: clip.id,
      character_id: clip.character_id,
      timeline_start: round3(start),
      duration: round3(Math.max(minTimelineDurationSeconds(), duration)),
      lane_key: laneKey,
      lane_index: laneIndexFromKey(laneKey),
      volume: 1,
    });

    audioCursorByLane.set(laneKey, start + duration);
  }

  for (const beat of beats) {
    const captionText = beat.captionText?.trim() ?? "";
    if (captionText.length === 0) continue;

    const intentKey = `caption:${beat.id}`;
    const hasExisting = Boolean(findIntentElement(input.existingActiveElements, intentKey))
      || input.existingActiveElements.some(
        (element) => element.type === "caption_text" && element.beat_id === beat.id,
      );
    const suppressed = hasIntentSuppressedByUser(input.removedElements, intentKey);
    if (hasExisting || suppressed) continue;

    const beatStart = beatStartById.get(beat.id) ?? 0;
    const beatEnd = beatEndById.get(beat.id)
      ?? (beatStart + Math.max(minTimelineDurationSeconds(), beat.durationSeconds ?? DEFAULT_EMPTY_BEAT_GAP_SECONDS));
    const duration = Math.max(minTimelineDurationSeconds(), beatEnd - beatStart, beat.durationSeconds ?? 0);

    inserts.push({
      project_id: input.projectId,
      type: "caption_text",
      source_url: null,
      props: {
        intent_key: intentKey,
        autoplaced: true,
        autoplaced_at: new Date().toISOString(),
        ...composeCaptionProps(captionText),
      },
      beat_id: beat.id,
      voice_clip_id: null,
      character_id: null,
      timeline_start: round3(beatStart),
      duration: round3(duration),
      lane_key: CAPTIONS_LANE_KEY,
      lane_index: laneIndexFromKey(CAPTIONS_LANE_KEY),
      volume: 1,
    });
  }

  const totalAssembledDuration = Math.max(
    beatCursor,
    ...occupiedVisualSegments.map((segment) => segment.end),
    ...Array.from(audioCursorByLane.values()),
  );

  if (input.selectedMusicTrack) {
    const intentKey = `music:${input.selectedMusicTrack.id}`;
    const hasExisting = Boolean(findIntentElement(input.existingActiveElements, intentKey))
      || input.existingActiveElements.some((element) => element.lane_key === MUSIC_LANE_KEY && element.type === "music");
    const suppressed = hasIntentSuppressedByUser(input.removedElements, intentKey);

    if (!hasExisting && !suppressed) {
      const musicDuration = input.selectedMusicTrack.duration_seconds ?? totalAssembledDuration ?? 1;
      inserts.push({
        project_id: input.projectId,
        type: "music",
        source_url: input.selectedMusicTrack.url,
        props: {
          intent_key: intentKey,
          autoplaced: true,
          autoplaced_at: new Date().toISOString(),
        },
        beat_id: null,
        voice_clip_id: null,
        character_id: null,
        timeline_start: 0,
        duration: round3(Math.max(1, musicDuration)),
        lane_key: MUSIC_LANE_KEY,
        lane_index: laneIndexFromKey(MUSIC_LANE_KEY),
        volume: 0.7,
      });
    }
  }

  return { inserts, warnings };
}
