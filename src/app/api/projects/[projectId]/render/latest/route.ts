import { NextResponse } from "next/server";

import { buildLatestRenderFileUrl } from "@/lib/render/urls";
import { latestRenderJob } from "@/lib/local-store/render-jobs";
import { assertProject } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);

    const job = latestRenderJob(projectId);
    if (!job) {
      return NextResponse.json({ ok: true, job: null });
    }

    return NextResponse.json({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        previewUrl: job.status === "completed" ? buildLatestRenderFileUrl(projectId, { version: job.id }) : null,
        downloadUrl: job.status === "completed" ? buildLatestRenderFileUrl(projectId, { download: true, version: job.id }) : null,
        fileName: job.status === "completed" ? job.fileName : null,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load latest render" },
      { status },
    );
  }
}
