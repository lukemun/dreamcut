import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { safeParseJson } from "@/lib/api-helpers";
import { resolveProposalBatch } from "@/lib/agent/proposal-batch";
import { previewEditorAgentProposalBatch } from "@/lib/agent/timeline-editor-agent-apply";
import { reviewOption } from "@/lib/agent/proposal-review";
import { readTimeline } from "@/lib/local-store/store";
import { assessProjectSpatial } from "@/lib/local-store/spatial-assessment";
import { resolveProposalPlaybackRange, proposalPlaybackLeadInSeconds } from "@/lib/timeline/audition-playback";
import { timelinePayload } from "@/lib/local-store/timeline-payload";

type Params = { params: Promise<{ projectId: string }> };

/** Preview several independently selectable proposals on one shared draft. */
export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await safeParseJson(request);
    const batch = resolveProposalBatch(projectId, body?.selections);
    const preview = previewEditorAgentProposalBatch(projectId, batch.items.map((item) => item.option));
    const liveTimeline = readTimeline(projectId);
    const rows = batch.items.flatMap((item) => reviewOption(liveTimeline, item.option).rows);
    const contextRanges = batch.items.some(item => item.option.preview_range)
      ? batch.items.flatMap(item => {
          const review = reviewOption(liveTimeline, item.option);
          const range = resolveProposalPlaybackRange(item.option.operations.map(op => op.element_id), preview.timeline.elements, liveTimeline.elements, review);
          return range ? [{ start_seconds: Math.max(0, range.startSeconds - proposalPlaybackLeadInSeconds(review)), end_seconds: range.endSeconds }] : [];
        }) : [];
    return NextResponse.json({
      proposal_id: "batch",
      status: "pending",
      option_id: "selected-edits",
      stale: false,
      touched_element_ids: preview.touched,
      review: {
        ...(contextRanges.length ? { preview_range: { start_seconds: Math.min(...contextRanges.map(range => range.start_seconds)), end_seconds: Math.max(...contextRanges.map(range => range.end_seconds)) } } : {}),
        option_id: "selected-edits",
        label: `Selected edits (${batch.items.length})`,
        recommended: true,
        summary: "Preview the selected edits together on one composite timeline.",
        requested_mutations: batch.items.reduce((sum, item) => sum + item.option.requested_mutations, 0),
        impact: `${batch.items.length} selected edits`,
        rows,
      },
      spatial_assessment: assessProjectSpatial(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat),
      timeline: timelinePayload(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat, preview.mutedLaneKeys),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to preview selected edits" }, { status });
  }
});
