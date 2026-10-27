import { withEditRequestActor } from "@/lib/local-store/edit-attribution";

import { NextResponse } from "next/server";

import {
  isVisualElementType,
  minTimelineDurationSeconds,
  quantizeVisualFrameSpan,
  quantizeVisualTrimValue,
  toVisualFrame,
  fromVisualFrame,
} from "@/lib/timeline/frame-quantization";
import { WAVEFORM_SUPPORTED_TYPES } from "@/lib/timeline/media";
import {
  normalizeVolumeEnvelope,
  type EnvelopePoint,
} from "@/lib/timeline/volume-envelope";
import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  findElement,
  newId,
  newRowTimestamps,
  readTimeline,
  withProjectLock,
  writeTimeline,
  readProjectFrameRate,
} from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string; elementId: string }> };

export const POST = withEditRequestActor(async function POST(_request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const existing = findElement(timeline, elementId);
      if (!existing || existing.removed_at != null) {
        return NextResponse.json({ error: "Timeline element not found" }, { status: 404 });
      }
      if (existing.position_locked) {
        return NextResponse.json({ error: "Locked clips cannot be duplicated" }, { status: 400 });
      }

      const fps = readProjectFrameRate(projectId);
      const requestedStart = existing.timeline_start + existing.duration;
      const requestedDuration = Math.max(minTimelineDurationSeconds(fps), existing.duration);
      const normalizedSpan = isVisualElementType(existing.type)
        ? quantizeVisualFrameSpan(
          // Shared end-frame boundary for flush duplicate joins.
          fromVisualFrame(toVisualFrame(requestedStart, fps), fps),
          requestedDuration,
          {fps},
        )
        : {
          timeline_start: requestedStart,
          duration: requestedDuration,
        };
      const normalizedTrimStart = existing.type === "video_clip"
        ? quantizeVisualTrimValue(Math.max(0, existing.trim_start), fps)
        : existing.trim_start;
      const normalizedTrimEnd = existing.type === "video_clip" && existing.trim_end != null
        ? quantizeVisualTrimValue(Math.max(0, existing.trim_end), fps)
        : existing.trim_end;

      // Normalize envelope for the duplicated clip's duration, strip on unsupported types
      const duplicateProps: Record<string, unknown> = {
        ...(existing.props ?? {}),
        duplicated_from_id: existing.id,
      };
      if (WAVEFORM_SUPPORTED_TYPES.has(existing.type)) {
        const envelope = duplicateProps.volume_envelope;
        if (Array.isArray(envelope) && envelope.length >= 2) {
          duplicateProps.volume_envelope = normalizeVolumeEnvelope(
            envelope as EnvelopePoint[],
            normalizedSpan.duration,
          );
        }
      } else {
        delete duplicateProps.volume_envelope;
      }

      const inserted: TimelineElement = {
        id: newId(),
        project_id: existing.project_id,
        type: existing.type,
        source_url: existing.source_url,
        props: duplicateProps,
        beat_id: existing.beat_id,
        voice_clip_id: existing.voice_clip_id,
        character_id: existing.character_id,
        timeline_start: normalizedSpan.timeline_start,
        duration: normalizedSpan.duration,
        lane_key: existing.lane_key,
        lane_index: existing.lane_index,
        trim_start: normalizedTrimStart,
        trim_end: normalizedTrimEnd,
        volume: existing.volume,
        fade_in: existing.fade_in,
        fade_out: existing.fade_out,
        playback_rate: existing.playback_rate,
        position_locked: false,
        removed_at: null,
        removed_reason: null,
        ...newRowTimestamps(),
      };
      timeline.elements.push(inserted);
      writeTimeline(projectId, timeline, "element_duplicate");

      return NextResponse.json({ element: inserted });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to duplicate element" },
      { status },
    );
  }
});
