import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import {
  MIN_VISUAL_FRAMES,
} from "@/lib/timeline/frame-quantization";
import {
  resolveMediaTiming,
  supportsOverflowHold,
  WAVEFORM_SUPPORTED_TYPES,
} from "@/lib/timeline/media";
import {
  splitEnvelope,
  writeVolumeEnvelopePatch,
  type EnvelopePoint,
} from "@/lib/timeline/volume-envelope";
import {
  activeTransitions,
  findElement,
  readTimeline,
  withProjectLock,
  readProjectFrameRate,
} from "@/lib/local-store/store";
import { splitElementAtomic } from "@/lib/local-store/split";
import {
  cloneOutgoingTransitionsForSplit,
  syncTransitionsForElements,
} from "@/lib/local-store/transition-sync";
import { splitActiveWordCaptionProps } from "@/lib/timeline/active-word-captions";
import { writeWithCaptionFollowers } from "@/lib/local-store/write-caption-followers";

type Params = { params: Promise<{ projectId: string; elementId: string }> };

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;
    const body = (await request.json().catch(() => ({}))) as { split_at?: unknown };
    const splitAt = typeof body.split_at === "number" && Number.isFinite(body.split_at) ? body.split_at : null;
    if (splitAt == null) {
      return NextResponse.json({ error: "split_at is required" }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const fps = readProjectFrameRate(projectId);
      const beforeElements = structuredClone(timeline.elements);
      const preElement = findElement(timeline, elementId);
      if (preElement && preElement.removed_at == null && supportsOverflowHold(preElement.type)) {
        const timing = resolveMediaTiming({
          type: preElement.type,
          timeline_start: preElement.timeline_start,
          duration: preElement.duration,
          trim_start: preElement.trim_start,
          trim_end: preElement.trim_end,
          playback_rate: preElement.playback_rate,
          props: (preElement.props ?? {}) as Record<string, unknown>,
        });
        const playableStart = preElement.timeline_start + timing.leadingHoldDuration;
        const playableEnd = playableStart + timing.visiblePlayableTimelineDuration;
        const splitFallsInOverflow = splitAt <= playableStart || splitAt >= playableEnd;
        if (splitFallsInOverflow) {
          return NextResponse.json(
            { error: "Remove the clip extension before splitting. Splits must land inside the real playable video." },
            { status: 400 },
          );
        }
      }

      const originalEnvelope = (() => {
        if (!preElement || !WAVEFORM_SUPPORTED_TYPES.has(preElement.type)) return null;
        const props = (preElement.props ?? {}) as Record<string, unknown>;
        const env = props.volume_envelope;
        return Array.isArray(env) && env.length >= 2 ? (env as EnvelopePoint[]) : null;
      })();

      const hasWordTiming = preElement?.type === "caption_text"
        && (preElement.props?.timingMode === "active_word" || preElement.props?.timingMode === "single_word");
      const activeWordSplit = hasWordTiming
        ? splitActiveWordCaptionProps(
          preElement.props,
          preElement.duration,
          splitAt - preElement.timeline_start,
          fps,
        )
        : null;
      if (hasWordTiming && !activeWordSplit) {
        return NextResponse.json({ error: "Word-timed captions can only be split at an aligned word boundary." }, { status: 400 });
      }

      const result = splitElementAtomic(
        timeline,
        projectId,
        elementId,
        splitAt,
        fps,
        MIN_VISUAL_FRAMES,
      );
      if (!result.ok) {
        switch (result.errorCode) {
          case "ELEMENT_NOT_FOUND":
            return NextResponse.json({ error: "Timeline element not found" }, { status: 404 });
          case "ELEMENT_LOCKED":
            return NextResponse.json(
              { error: "This clip is locked. Unlock it before splitting." },
              { status: 400 },
            );
          case "INVALID_SPLIT_RANGE":
            return NextResponse.json(
              { error: "Split point must leave enough duration on both sides" },
              { status: 400 },
            );
          default:
            throw new Error("Failed to split element");
        }
      }

      const { updated, inserted } = result;

      if (activeWordSplit) {
        updated.props = { ...activeWordSplit.left, split_from_id: updated.id };
        inserted.props = { ...activeWordSplit.right, split_from_id: updated.id };
      }
      if (updated.type === "caption_text") {
        updated.props = { ...updated.props, caption_audio_binding: null };
        inserted.props = { ...inserted.props, caption_audio_binding: null };
      }

      // Post-split envelope splitting (in-memory: no rollback dance needed —
      // nothing was persisted yet).
      if (originalEnvelope) {
        const { left, right } = splitEnvelope(originalEnvelope, updated.duration, inserted.duration);
        const updatedVolumePatch = writeVolumeEnvelopePatch(
          { props: (updated.props ?? {}) as Record<string, unknown> },
          left,
          updated.duration,
        );
        updated.volume = updatedVolumePatch.volume;
        updated.props = updatedVolumePatch.props;
        const insertedVolumePatch = writeVolumeEnvelopePatch(
          { props: (inserted.props ?? {}) as Record<string, unknown> },
          right,
          inserted.duration,
        );
        inserted.volume = insertedVolumePatch.volume;
        inserted.props = insertedVolumePatch.props;
      }

      // Sync transitions: the original element is now shorter (left segment),
      // so clone any outgoing transition onto the right segment and let sync
      // clamp or invalidate whichever side no longer fits.
      cloneOutgoingTransitionsForSplit(timeline, projectId, elementId, inserted.id);
      syncTransitionsForElements(timeline, [elementId, inserted.id]);
      const followers = writeWithCaptionFollowers(projectId, beforeElements, timeline, "element_split");

      return NextResponse.json({
        ...followers,
        updated,
        inserted,
        transitions: activeTransitions(timeline),
      });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to split element" },
      { status },
    );
  }
});
