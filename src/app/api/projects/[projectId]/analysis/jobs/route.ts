import { NextResponse } from "next/server";
import { listJobs } from "@/lib/local-store/media-analysis";
import { assertProject } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    return NextResponse.json({ jobs: listJobs(projectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to read jobs" }, { status: (error as Error & { status?: number }).status ?? 500 });
  }
}
