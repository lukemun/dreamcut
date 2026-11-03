import { NextResponse } from "next/server";
import { safeParseJson } from "@/lib/api-helpers";
import { proposalWork } from "@/lib/observability/proposal-work";
import { readProposal } from "@/lib/local-store/proposals";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = await safeParseJson(request);
    if (body?.action === "saved" && typeof body.proposal_id === "string") readProposal(projectId, body.proposal_id);
    return NextResponse.json(proposalWork(projectId, body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid work event" }, { status: 400 });
  }
}
