import { NextResponse } from "next/server";
import { readJob, retryJob } from "@/lib/local-store/media-analysis";

type Params = { params: Promise<{ projectId: string }> };
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const { job_id: jobId } = await request.json() as { job_id?: unknown };
    if (typeof jobId !== "string") throw new Error("job_id is required");
    if (readJob(jobId)?.project_id !== projectId) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({ job: retryJob(jobId) }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to retry job" }, { status: 400 });
  }
}
