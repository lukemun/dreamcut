import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { applyTimelineCompaction } from "@/lib/local-store/timeline-compaction";
import { withProjectLock } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

/**
 * Compacts the live timeline under the same in-process mutation lock as every
 * editing route. Reads remain safe because the final timeline swap is atomic.
 */
export const POST = withEditRequestActor(async function POST(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const receipt = await withProjectLock(projectId, () =>
      applyTimelineCompaction(projectId)
    );
    return NextResponse.json({ receipt });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compact timeline" },
      { status },
    );
  }
});
