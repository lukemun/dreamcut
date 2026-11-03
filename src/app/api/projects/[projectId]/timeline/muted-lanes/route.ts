import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import { sanitizeLaneOrderKeys } from "@/lib/timeline/metadata";
import {
  captureProjectHistorySnapshot,
  latestProjectHistorySnapshot,
  readMetadata,
  withProjectLock,
  writeMetadata,
} from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

// Lane mute and hide are separate: muted lanes are silent in preview and export
// (their pictures still draw); hidden lanes draw no pictures or text (their sound
// still plays unless also muted). Either set, or both, may be replaced in one undoable write.
const laneVisibilityPatchSchema = z.object({
  muted_lane_keys: z.array(z.string()).optional(),
  hidden_lane_keys: z.array(z.string()).optional(),
}).refine(
  (value) => value.muted_lane_keys !== undefined || value.hidden_lane_keys !== undefined,
  "Provide muted_lane_keys, hidden_lane_keys, or both",
);

export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const parsed = laneVisibilityPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" }, { status: 400 });
    }
    const op = parsed.data.muted_lane_keys === undefined ? "hidden_lanes" : "muted_lanes";

    return await withProjectLock(projectId, async () => {
      const before = captureProjectHistorySnapshot(projectId, `${op}_before`);
      const metadata = readMetadata(projectId);
      if (parsed.data.muted_lane_keys !== undefined) metadata.muted_lane_keys = sanitizeLaneOrderKeys(parsed.data.muted_lane_keys);
      if (parsed.data.hidden_lane_keys !== undefined) metadata.hidden_lane_keys = sanitizeLaneOrderKeys(parsed.data.hidden_lane_keys);
      writeMetadata(projectId, metadata, op);
      const after = latestProjectHistorySnapshot(projectId);
      return NextResponse.json({
        muted_lane_keys: metadata.muted_lane_keys,
        hidden_lane_keys: metadata.hidden_lane_keys,
        history: after ? { before, after } : null,
      });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save lane mute and visibility" },
      { status },
    );
  }
});
