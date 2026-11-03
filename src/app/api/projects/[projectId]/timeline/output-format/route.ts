import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";
import { TIMELINE_ASPECT_RATIO_VALUES } from "@/lib/aspect-ratios";

import {
  captureProjectHistorySnapshot,
  latestProjectHistorySnapshot,
  readMetadata,
  readTimeline,
  withProjectLock,
  writeMetadata,
  writeTimelineAndMetadata,
} from "@/lib/local-store/store";
import { projectFrameRate } from "@/lib/timeline/frame-quantization";
import { requantizeTimelineForFrameRate } from "@/lib/timeline/frame-rate-change";
import { CAPTION_SAFE_AREA_MODES, DELIVERY_TARGETS } from "@/lib/qc/standards";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const metadata = readMetadata(projectId);
    return NextResponse.json({
      aspect_ratio: metadata.output_aspect_ratio,
      frame_rate: projectFrameRate(metadata),
      delivery_target: metadata.delivery_target,
      caption_safe_area_mode: metadata.caption_safe_area_mode,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load output format" },
      { status },
    );
  }
}

const patchSchema = z.object({
  aspect_ratio: z.enum(TIMELINE_ASPECT_RATIO_VALUES).optional(),
  frame_rate: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).optional(),
  delivery_target: z.enum(DELIVERY_TARGETS).optional(),
  caption_safe_area_mode: z.enum(CAPTION_SAFE_AREA_MODES).optional(),
}).refine((value) => value.aspect_ratio != null || value.frame_rate != null || value.delivery_target != null || value.caption_safe_area_mode != null, {
  message: "At least one output-format field is required",
});

export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const before = captureProjectHistorySnapshot(projectId, "output_format_before");
      const metadata = readMetadata(projectId);
      if (parsed.data.aspect_ratio) metadata.output_aspect_ratio = parsed.data.aspect_ratio;
      if (parsed.data.delivery_target) metadata.delivery_target = parsed.data.delivery_target;
      if (parsed.data.caption_safe_area_mode) metadata.caption_safe_area_mode = parsed.data.caption_safe_area_mode;
      const rateChanged = parsed.data.frame_rate != null && parsed.data.frame_rate !== projectFrameRate(metadata);
      if (parsed.data.frame_rate != null) metadata.frame_rate = parsed.data.frame_rate;
      if (rateChanged) {
        // Picture spans live on the frame grid; move them onto the new one in the same step.
        const timeline = readTimeline(projectId);
        writeTimelineAndMetadata(projectId, { ...timeline, elements: requantizeTimelineForFrameRate(timeline.elements, metadata.frame_rate!) }, metadata, "output_format");
      } else {
        writeMetadata(projectId, metadata, "output_format");
      }
      const after = latestProjectHistorySnapshot(projectId);
      return NextResponse.json({
        aspect_ratio: metadata.output_aspect_ratio,
        frame_rate: projectFrameRate(metadata),
        delivery_target: metadata.delivery_target,
        caption_safe_area_mode: metadata.caption_safe_area_mode,
        history: after ? { before, after } : null,
      });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save output format" },
      { status },
    );
  }
});
