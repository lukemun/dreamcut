import { NextResponse } from "next/server";
import { toolErrorResponse } from "@/lib/agent/tool-error";
import { assertProject } from "@/lib/local-store/store";
import { referenceMatch } from "@/lib/media-analysis/reference-match";
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try { const { projectId } = await params; assertProject(projectId); return NextResponse.json(await referenceMatch(projectId, await request.json())); }
  catch (error) { return toolErrorResponse(error); }
}
