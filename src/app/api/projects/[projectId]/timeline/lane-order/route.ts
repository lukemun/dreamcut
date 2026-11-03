import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import { sanitizeLaneOrderKeys } from "@/lib/timeline/metadata";
import { readMetadata, withProjectLock, writeMetadata } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

const patchSchema = z.object({
  lane_order_keys: z.array(z.string()),
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
      const metadata = readMetadata(projectId);
      metadata.lane_order_keys = sanitizeLaneOrderKeys(parsed.data.lane_order_keys);
      writeMetadata(projectId, metadata, "lane_order");
      return NextResponse.json({ lane_order_keys: metadata.lane_order_keys });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save lane order" },
      { status },
    );
  }
});
