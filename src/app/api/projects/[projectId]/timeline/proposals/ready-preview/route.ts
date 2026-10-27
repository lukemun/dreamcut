import { NextResponse } from "next/server";
import { z } from "zod";

import { isLocalEditorRequest, localEditorOrigin } from "@/lib/local-request";
import { proposalNumericOverridesSchema } from "@/lib/agent/proposal-overrides";
import { proposalReadyPreview } from "@/lib/local-store/proposal-ready-preview";
import { assertProject } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

const schema = z.object({
  selections: z.array(z.object({ proposal_id: z.string().min(1), option_id: z.string().min(1).optional(), overrides: proposalNumericOverridesSchema.optional() })).min(1).max(32),
  /** Begin flattening when no preview exists yet. */
  start: z.boolean().optional(),
});

/**
 * POST: the flattened preview of these selected options (same tuning, current timeline revision):
 * its state and, once ready, its video URL and the frame range it covers. Nothing is written to the timeline.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    if (!isLocalEditorRequest(request)) return NextResponse.json({ error: "Proposal previews are prepared for the local editor only." }, { status: 403 });
    const { projectId } = await params;
    assertProject(projectId);
    const body = schema.parse(await request.json());
    const items = body.selections.map((selection) => ({ proposalId: selection.proposal_id, optionId: selection.option_id, overrides: selection.overrides }));
    return NextResponse.json(await proposalReadyPreview(projectId, items, { start: body.start, origin: localEditorOrigin(request) }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Proposal preview is unavailable" }, { status });
  }
}
