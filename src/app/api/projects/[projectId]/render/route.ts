import { NextResponse } from "next/server";
import { z } from "zod";

import { startRender } from "@/lib/local-store/render-jobs";
import { activeElements, assertProject, readTimeline } from "@/lib/local-store/store";
import { captionTimingFindings } from "@/lib/timeline/caption-timing-validation";
import { editorRequestOrigin } from "@/lib/render/capture-origin";
import { hdrExportWarning } from "@/lib/render/dynamic-range";

type Params = { params: Promise<{ projectId: string }> };

const bodySchema = z.object({
  backend: z.enum(["standard", "rust", "gpu"]).optional().default("standard"),
  muted_lane_keys: z.array(z.string()).optional().default([]),
  // Omitted by callers that predate the mute/hide split: the project's hidden lanes apply.
  hidden_lane_keys: z.array(z.string()).optional(),
  resolution: z.union([z.literal(480), z.literal(720), z.literal(1080), z.literal(1440), z.literal(2160)]).optional().default(1080),
  dynamic_range: z.enum(["sdr", "hdr"]).optional().default("sdr"),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);

    const active = activeElements(readTimeline(projectId));
    const invalidCaption = active
      .map((element) => ({ element, findings: captionTimingFindings(element) }))
      .find((entry) => entry.findings.length > 0);
    if (invalidCaption) {
      return NextResponse.json({
        error: `Active-word caption timing is invalid: ${invalidCaption.findings[0]!.message}`,
        element_id: invalidCaption.element.id,
        finding: invalidCaption.findings[0],
      }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // The headless renderer loads /render-frame and media from this origin.
    const origin = editorRequestOrigin(request);
    const result = startRender(projectId, parsed.data.muted_lane_keys, origin, {backend:parsed.data.backend, resolution:parsed.data.resolution, dynamicRange:parsed.data.dynamic_range, ...(parsed.data.hidden_lane_keys ? { hiddenLaneKeys: parsed.data.hidden_lane_keys } : {})});
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    // HDR still exports when asked; a mostly-SDR timeline gets the same warning the Export dialog shows.
    const warning = parsed.data.dynamic_range === "hdr" ? hdrExportWarning(active) : null;
    return NextResponse.json({
      job_id: result.job.id,
      status: result.job.status,
      already_in_progress: result.alreadyInProgress,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start render" },
      { status },
    );
  }
}
