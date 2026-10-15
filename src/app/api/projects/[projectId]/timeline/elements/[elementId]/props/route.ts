import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { z } from "zod";

import { timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import { findElement, readTimeline, withProjectLock, writeTimeline, readProjectFrameRate } from "@/lib/local-store/store";
import { syncTransitionsForElements } from "@/lib/local-store/transition-sync";
import { assertActiveWordTimingPatch } from "@/lib/timeline/caption-timing-validation";
import { applyPreparedElementPatch as applyElementPatch } from "@/lib/local-store/cutout-effects";

type Params = { params: Promise<{ projectId: string; elementId: string }> };

const schema = z.object({
  props: z.record(z.string(), z.unknown()),
  // Optional optimistic-concurrency guard, same semantics as the proposal apply:
  // a sha256 of timeline.json from when the caller read state. Mismatch → 409.
  // The in-process lock can't see a CLI script or a hand-edit; this can.
  expected_revision: z.string().length(64).regex(/^[0-9a-f]+$/).optional(),
}).strict();

/** Safe read-modify-write endpoint. Unlike the legacy element PATCH, props are merged. */
export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId, elementId } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid props patch" }, { status: 400 });
    return await withProjectLock(projectId, async () => {
      if (parsed.data.expected_revision && timelineRevision(projectId) !== parsed.data.expected_revision) {
        return NextResponse.json({ error: "Timeline revision changed since it was read; re-read and retry" }, { status: 409 });
      }
      const timeline = readTimeline(projectId);
      const element = findElement(timeline, elementId);
      if (!element || element.removed_at != null) return NextResponse.json({ error: "Timeline element not found" }, { status: 404 });
      const nextProps = { ...((element.props ?? {}) as Record<string, unknown>), ...parsed.data.props };
      assertActiveWordTimingPatch(element, { props: nextProps });
      applyElementPatch(element, { props: nextProps }, { fps: readProjectFrameRate(projectId) });
      element.updated_at = new Date().toISOString();
      syncTransitionsForElements(timeline, [elementId]);
      writeTimeline(projectId, timeline, "element_props_patch");
      return NextResponse.json({ element });
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to patch props" }, { status });
  }
});
