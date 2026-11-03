import { NextRequest, NextResponse } from "next/server";

import { listCoverLayoutProposals } from "@/lib/layout-proposals/cover-layout";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    return NextResponse.json({ layouts: listCoverLayoutProposals(projectId) });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list layout proposals" },
      { status },
    );
  }
}
