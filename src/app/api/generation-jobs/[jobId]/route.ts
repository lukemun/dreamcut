import { NextResponse } from "next/server";

import { getJob, stopRender } from "@/lib/local-store/render-jobs";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      statusLabel: job.statusLabel,
      progress: job.progress,
      targetType: job.targetType,
      targetId: job.projectId,
      provider: "local_render",
      outputUrl: null,
      imageUrls: [],
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      projectId: job.projectId,
      // Render jobs belong to their project; the editor's job tracker filters by this scope.
      scopeType: "project",
      scopeId: job.projectId,
    },
  });
}

/** Stop a running export. Whatever it has drawn so far is discarded; the timeline is untouched. */
export async function DELETE(_request: Request, { params }: Params) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "processing") return NextResponse.json({ ok: true, status: job.status });
  if (!stopRender(jobId)) return NextResponse.json({ error: "This export is running somewhere this editor cannot stop" }, { status: 409 });
  return NextResponse.json({ ok: true, status: "stopping" });
}
