import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import { restoreProjectHistorySnapshot, withProjectLock } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

const schema = z.object({ snapshot_id: z.string().min(1).max(255) }).strict();

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid history restore request" }, { status: 400 });
    return await withProjectLock(projectId, async () => {
      const restored = restoreProjectHistorySnapshot(projectId, parsed.data.snapshot_id, "history_restore");
      return NextResponse.json({
        ok: true,
        timeline_changed: restored.timelineChanged,
        restored_snapshot_id: parsed.data.snapshot_id,
        history_snapshot_id: restored.restoredSnapshotId,
        restored_proposal_ids: restored.restoredProposalIds,
      });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to restore history snapshot" }, { status });
  }
});
