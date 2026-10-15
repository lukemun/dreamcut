import { NextResponse } from "next/server";

import { conditionalJsonResponse } from "@/lib/conditional-json-response";

import { assertProject, getRevision, latestProjectHistorySnapshot } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

/** Polled by the editor page: external_rev changes whenever timeline.json is
 *  modified by something other than this server (e.g. Claude Code editing the
 *  file directly), which triggers a full editor reload. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const { rev, externalRev } = getRevision(projectId);
    return conditionalJsonResponse(request, { rev, external_rev: externalRev, history: latestProjectHistorySnapshot(projectId) });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read revision" },
      { status },
    );
  }
}
