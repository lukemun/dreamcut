import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextRequest, NextResponse } from "next/server";

import {
  readCoverLayoutProposal,
  saveCoverLayoutProposal,
} from "@/lib/layout-proposals/cover-layout";
import { withProjectLock } from "@/lib/local-store/store";

function errorResponse(error: unknown) {
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: unknown }).status) || 500
    : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Layout proposal request failed" },
    { status },
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; layoutId: string }> },
) {
  try {
    const { projectId, layoutId } = await context.params;
    return NextResponse.json(readCoverLayoutProposal(projectId, layoutId));
  } catch (error) {
    return errorResponse(error);
  }
}

export const PUT = withEditRequestActor(async function PUT(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; layoutId: string }> },
) {
  try {
    const { projectId, layoutId } = await context.params;
    const body = await request.json();
    const { proposal, history } = await withProjectLock(projectId, () =>
      saveCoverLayoutProposal(projectId, layoutId, body)
    );
    // The proposal stays the response body; history rides on a namespaced key.
    return NextResponse.json({ ...proposal, mutation_history: history });
  } catch (error) {
    return errorResponse(error);
  }
});
