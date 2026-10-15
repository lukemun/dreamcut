import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import {
  isVisualElementType,
  quantizeVisualFrameSpan,
  quantizeVisualTrimValue,
} from "@/lib/timeline/frame-quantization";
import { WAVEFORM_SUPPORTED_TYPES } from "@/lib/timeline/media";
import {
  normalizeVolumeEnvelope,
  type EnvelopePoint,
} from "@/lib/timeline/volume-envelope";
import {
  activeTransitions,
  findElement,
  readTimeline,
  withProjectLock,
  readProjectFrameRate,
} from "@/lib/local-store/store";
import {
  restoreTransitionsForElement,
  syncTransitionsForElements,
} from "@/lib/local-store/transition-sync";
import { rehydrateArchivedElement } from "@/lib/local-store/timeline-compaction";
import { writeWithCaptionFollowers } from "@/lib/local-store/write-caption-followers";

type Params = { params: Promise<{ projectId: string; elementId: string }> };

export const POST = withEditRequestActor(async function POST(_request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const existing = findElement(timeline, elementId)
        ?? rehydrateArchivedElement(projectId, timeline, elementId);
      const beforeElements = structuredClone(timeline.elements);
      if (!existing || existing.removed_at == null) {
        return NextResponse.json({ error: "Deleted timeline element not found" }, { status: 404 });
      }

      const fps = readProjectFrameRate(projectId);
      const isVisual = isVisualElementType(existing.type);
      if (isVisual) {
        const normalizedSpan = quantizeVisualFrameSpan(existing.timeline_start, existing.duration, { fps });
        existing.timeline_start = normalizedSpan.timeline_start;
        existing.duration = normalizedSpan.duration;
      }
      if (existing.type === "video_clip") {
        existing.trim_start = quantizeVisualTrimValue(Math.max(0, existing.trim_start), fps);
        if (existing.trim_end != null) {
          existing.trim_end = quantizeVisualTrimValue(Math.max(0, existing.trim_end), fps);
        }
      }

      // Normalize envelope on restore if element has one
      if (WAVEFORM_SUPPORTED_TYPES.has(existing.type)) {
        const existingProps = (existing.props ?? {}) as Record<string, unknown>;
        const envelope = existingProps.volume_envelope;
        if (Array.isArray(envelope) && envelope.length >= 2) {
          existing.props = {
            ...existingProps,
            volume_envelope: normalizeVolumeEnvelope(envelope as EnvelopePoint[], existing.duration),
          };
        }
      }

      existing.removed_at = null;
      existing.removed_reason = null;
      existing.updated_at = new Date().toISOString();

      restoreTransitionsForElement(timeline, elementId);
      syncTransitionsForElements(timeline);
      const followers = writeWithCaptionFollowers(projectId, beforeElements, timeline, "element_restore");

      return NextResponse.json({ ...followers, element: existing, transitions: activeTransitions(timeline) });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to restore timeline element" },
      { status },
    );
  }
});
