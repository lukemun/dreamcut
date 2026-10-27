import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import { composeCaptionProps, sanitizeCaptionStyleProps } from "@/lib/timeline/captions";
import { isTimelineLaneKey } from "@/lib/timeline/metadata";
import {
  readMetadata,
  readTimeline,
  withProjectLock,
  writeMetadata,
  writeTimeline,
} from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

const bodySchema = z.object({
  lane_key: z.string().trim().min(1),
  style_props: z.record(z.string(), z.unknown()),
});

/** PATCH: save a lane's caption style as the default for future captions. */
export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success || !isTimelineLaneKey(parsed.data.lane_key)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const metadata = readMetadata(projectId);
      metadata.lane_defaults = {
        ...metadata.lane_defaults,
        [parsed.data.lane_key]: sanitizeCaptionStyleProps(parsed.data.style_props),
      };
      writeMetadata(projectId, metadata, "lane_defaults_patch");
      return NextResponse.json({ lane_defaults: metadata.lane_defaults });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save lane defaults" },
      { status },
    );
  }
});

/** POST: retroactively re-style every active caption in the lane. */
export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success || !isTimelineLaneKey(parsed.data.lane_key)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      const style = sanitizeCaptionStyleProps(parsed.data.style_props);

      let updatedCount = 0;
      for (const element of timeline.elements) {
        if (element.removed_at != null) continue;
        if (element.type !== "caption_text") continue;
        if (element.lane_key !== parsed.data.lane_key) continue;
        const props = (element.props ?? {}) as Record<string, unknown>;
        const text = typeof props.text === "string" ? props.text : "";
        element.props = { ...props, ...composeCaptionProps(text, { ...props, ...style }) };
        element.updated_at = new Date().toISOString();
        updatedCount += 1;
      }

      if (updatedCount > 0) {
        writeTimeline(projectId, timeline, "lane_defaults_apply");
      }
      return NextResponse.json({ updated_count: updatedCount });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply lane defaults" },
      { status },
    );
  }
});
