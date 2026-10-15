import { withEditRequestActor } from "@/lib/local-store/edit-attribution";

import { NextResponse } from "next/server";
import { preparedPlacement } from "@/lib/local-store/media-preparation";
import { z } from "zod";
import { zodIssuesToMessage } from "@/lib/api-helpers";

import { composeCaptionProps } from "@/lib/timeline/captions";
import {
  isVisualElementType,
  minTimelineDurationSeconds,
  quantizeVisualFrameSpan,
  quantizeVisualTrimValue,
} from "@/lib/timeline/frame-quantization";
import { assertLaneCompatibleWithElementType } from "@/lib/timeline/lanes";
import { TIMELINE_ELEMENT_TYPES } from "@/lib/timeline/contracts";
import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  findElement,
  newId,
  newRowTimestamps,
  readMetadata,
  readTimeline,
  withProjectLock,
  writeTimeline, readProjectFrameRate } from "@/lib/local-store/store";
import { assertCaptionTimingState } from "@/lib/timeline/caption-timing-validation";
import { MAX_ABS_GAIN } from "@/lib/timeline/audio-gain";
import { getOrMeasureLufs } from "@/lib/local-store/audio-loudness";
import { resolveMediaPath } from "@/lib/local-store/media";

type Params = { params: Promise<{ projectId: string }> };

/** Element types whose loudness is referenced by the volume fader. */
const REFERENCED_AUDIO_TYPES = new Set(["vo_segment", "vo_full", "music", "sound_effect"]);

/** Extract the decoded relative media path from a project-local source URL, else null. */
function localMediaRelPath(sourceUrl: string, projectId: string): string | null {
  const prefix = `/api/projects/${projectId}/media/`;
  if (!sourceUrl.startsWith(prefix)) return null;
  try {
    return sourceUrl.slice(prefix.length).split("/").map((seg) => decodeURIComponent(seg)).join("/");
  } catch {
    return null;
  }
}

// Local fork: source_url is either an absolute URL or a local media route path.
const relativeLocalPathSchema = z
  .string()
  .trim()
  .regex(
    /^\/api\/(?:projects\/.+\/media|music-catalog\/media|sfx-catalog\/media|image-catalog\/media|visual-catalog\/media)\/.+/,
    "Must be an absolute URL or a local media API path",
  );
const timelineSourceUrlSchema = z.union([z.string().url(), relativeLocalPathSchema]);

const createSchema = z.object({
  type: z.enum(TIMELINE_ELEMENT_TYPES),
  source_url: timelineSourceUrlSchema.nullable().optional(),
  beat_id: z.string().uuid().nullable().optional(),
  voice_clip_id: z.string().uuid().nullable().optional(),
  character_id: z.string().uuid().nullable().optional(),
  timeline_start: z.number().finite().min(0),
  duration: z.number().finite().gt(0),
  lane_key: z.string().trim().min(1).max(128).regex(/^[a-z0-9_:-]+$/),
  lane_index: z.number().int().min(0),
  // Loudness-referenced placement can normalize a quiet source well past unity, so the
  // gain ceiling is MAX_ABS_GAIN, not 2. True-peak clipping is caught post-render.
  volume: z.number().finite().min(0).max(MAX_ABS_GAIN).optional().default(1),
  trim_start: z.number().finite().min(0).optional().default(0),
  trim_end: z.number().finite().min(0).nullable().optional().default(null),
  fade_in: z.number().finite().min(0).optional().default(0),
  fade_out: z.number().finite().min(0).optional().default(0),
  playback_rate: z.number().finite().gt(0).max(4).optional().default(1),
  props: z.record(z.string(), z.unknown()).optional().default({}),
});

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid request body: ${zodIssuesToMessage(parsed.error)}`, issues: parsed.error.issues },
        { status: 400 },
      );
    }
    assertLaneCompatibleWithElementType(parsed.data.type, parsed.data.lane_key);
    if (parsed.data.type === "video_clip") {
      if (!parsed.data.source_url) return NextResponse.json({ error: "A prepared video source is required" }, { status: 409 });
      const prepared = preparedPlacement(projectId, parsed.data.source_url, parsed.data.props);
      parsed.data.source_url = prepared.source_url;
      parsed.data.props = prepared.props;
    }

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const metadata = readMetadata(projectId);

      const pastedFromId = typeof parsed.data.props.pasted_from_id === "string"
        ? parsed.data.props.pasted_from_id
        : null;
      if (pastedFromId) {
        const source = findElement(timeline, pastedFromId);
        if (!source || source.removed_at != null) {
          return NextResponse.json({ error: "Paste source not found" }, { status: 404 });
        }
        if (source.position_locked) {
          return NextResponse.json({ error: "Locked clips cannot be pasted" }, { status: 400 });
        }
      }

      const laneStyleRaw =
        parsed.data.type === "caption_text"
        && metadata.lane_defaults[parsed.data.lane_key]
        && typeof metadata.lane_defaults[parsed.data.lane_key] === "object"
          ? metadata.lane_defaults[parsed.data.lane_key]
          : null;
      const nextProps =
        parsed.data.type === "caption_text"
          ? {
              ...(parsed.data.props ?? {}),
              ...composeCaptionProps(
                typeof parsed.data.props.text === "string" ? parsed.data.props.text : "",
                {
                  ...(laneStyleRaw ?? {}),
                  ...(parsed.data.props ?? {}),
                },
              ),
            }
          : parsed.data.props;

      // A placed audio clip lands at the gain the client sent (unity = 0 dB, as-is) —
      // never silently re-leveled. We only MEASURE the source loudness once (cached) and
      // record it, so the inspector's LUFS readout works and the deliberate Normalize
      // action has a value to level against. Leveling is an explicit user act, not a
      // side effect of dropping a clip.
      const placementVolume = parsed.data.volume;
      if (!pastedFromId && REFERENCED_AUDIO_TYPES.has(parsed.data.type) && typeof parsed.data.source_url === "string") {
        const relPath = localMediaRelPath(parsed.data.source_url, projectId);
        const absPath = relPath ? resolveMediaPath(projectId, relPath.split("/")) : null;
        if (relPath && absPath) {
          const sourceLufs = getOrMeasureLufs(projectId, absPath, relPath);
          if (sourceLufs != null) {
            (nextProps as Record<string, unknown>).source_lufs = sourceLufs;
          }
        }
      }

      const fps = readProjectFrameRate(projectId);
      const clampedDuration = Math.max(minTimelineDurationSeconds(fps), parsed.data.duration);
      const normalizedSpan = isVisualElementType(parsed.data.type)
        ? quantizeVisualFrameSpan(parsed.data.timeline_start, clampedDuration, {fps})
        : {
          timeline_start: parsed.data.timeline_start,
          duration: clampedDuration,
        };
      const normalizedTrimStart = parsed.data.type === "video_clip"
        ? quantizeVisualTrimValue(parsed.data.trim_start, fps)
        : parsed.data.trim_start;
      const normalizedTrimEnd = parsed.data.type === "video_clip" && parsed.data.trim_end != null
        ? quantizeVisualTrimValue(parsed.data.trim_end, fps)
        : parsed.data.trim_end;

      const element: TimelineElement = {
        id: newId(),
        project_id: projectId,
        type: parsed.data.type,
        source_url: parsed.data.source_url ?? null,
        props: nextProps,
        beat_id: parsed.data.beat_id ?? null,
        voice_clip_id: parsed.data.voice_clip_id ?? null,
        character_id: parsed.data.character_id ?? null,
        timeline_start: normalizedSpan.timeline_start,
        duration: normalizedSpan.duration,
        lane_key: parsed.data.lane_key,
        lane_index: parsed.data.lane_index,
        trim_start: normalizedTrimStart,
        trim_end: normalizedTrimEnd,
        volume: placementVolume,
        fade_in: parsed.data.fade_in,
        fade_out: parsed.data.fade_out,
        playback_rate: parsed.data.playback_rate,
        position_locked: false,
        removed_at: null,
        removed_reason: null,
        ...newRowTimestamps(),
      };
      assertCaptionTimingState(element);
      timeline.elements.push(element);
      writeTimeline(projectId, timeline, "element_create");

      return NextResponse.json({ element });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create element" },
      { status },
    );
  }
});
