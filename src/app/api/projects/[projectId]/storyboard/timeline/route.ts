import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readStoryboard, storyboardAssets } from "@/lib/local-store/storyboard";
import { readMetadata, readTimeline, withProjectLock, writeTimeline, writeTimelineAndMetadata } from "@/lib/local-store/store";
import { deriveProposalTimeline } from "@/lib/agent/timeline-editor-agent-apply";
import { storyboardOutputShots, validateStoryboardAssets } from "@/lib/storyboard/model";
import { compileStoryboard } from "@/lib/storyboard/compile";

/**
 * Build timeline: the creator's own action that lays the storyboard onto the timeline as a
 * first assembly. A whole video is not a one-off tweak, so it is written directly (one Undo
 * step in the editor's history) rather than reviewed as a proposal. Clips already on the
 * timeline are kept; the storyboard goes after them, and only once the creator confirms.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params, input = await request.json() as { revision?: number; append?: boolean };
    const result = await withProjectLock(projectId, () => {
      const board = readStoryboard(projectId), assets = storyboardAssets(projectId);
      if (input.revision !== board.revision) throw new Error("Storyboard changed. Reload before building the timeline.");
      validateStoryboardAssets(board.content, assets);
      if (!storyboardOutputShots(board.content).length) throw new Error("Add shots to the story before building the timeline.");
      const timeline = readTimeline(projectId), live = timeline.elements.filter(e => !e.removed_at);
      if (live.length && !input.append) return { status: 409 as const, body: { error: "The timeline already has clips.", needs_confirmation: true, clips: live.length } };
      const offset = Math.max(0, ...live.map(e => e.timeline_start + e.duration));
      const operations = compileStoryboard(board.content, assets, offset).map(op => ({ ...op, element_id: randomUUID() }));
      const derived = deriveProposalTimeline(timeline, operations, projectId);
      if (derived.laneOrderKeys) writeTimelineAndMetadata(projectId, derived.timeline, { ...readMetadata(projectId), lane_order_keys: derived.laneOrderKeys }, "storyboard_build");
      else writeTimeline(projectId, derived.timeline, "storyboard_build");
      return { status: 201 as const, body: { clips: operations.length, start_seconds: offset } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build the timeline" }, { status: 400 }); }
}
