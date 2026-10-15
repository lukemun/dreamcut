import { NextResponse } from "next/server";

import { listJobs } from "@/lib/local-store/render-jobs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const activeOnly = url.searchParams.get("active") === "1";
  const targetType = url.searchParams.get("targetType") ?? undefined;

  const jobs = listJobs({ projectId, activeOnly, targetType }).map((job) => ({
    id: job.id,
    status: job.status,
    statusLabel: job.statusLabel,
    progress: job.progress,
    targetType: job.targetType,
    targetId: job.projectId,
    outputUrl: null,
    error: job.error,
    createdAt: job.createdAt,
    projectId: job.projectId,
    // Render jobs belong to their project; the editor's job tracker filters by this scope.
    scopeType: "project",
    scopeId: job.projectId,
  }));

  return NextResponse.json({ jobs });
}
