import { NextResponse } from "next/server";
import { z } from "zod";

import { getJob, latestRenderJob } from "@/lib/local-store/render-jobs";
import { projectRendersDir } from "@/lib/local-store/paths";
import { assertProject } from "@/lib/local-store/store";
import { assertEditorOrigin } from "@/lib/render/capture-origin";
import { revealInFileManager } from "@/lib/local-store/reveal-file";
import { finishedExportFile } from "@/lib/local-store/export-library";

type Params = { params: Promise<{ projectId: string }> };

const bodySchema = z.object({ job_id: z.string().min(1).max(128).optional() }).strict();

/** Show a finished export in Finder. The editor's server runs on this computer. */
export async function POST(request: Request, { params }: Params) {
  try {
    assertEditorOrigin(request);
    const { projectId } = await params;
    assertProject(projectId);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    const job = parsed.data.job_id ? getJob(parsed.data.job_id) : latestRenderJob(projectId);
    if (!job || job.projectId !== projectId || job.status !== "completed" || !job.fileName) {
      return NextResponse.json({ error: "That export is not available" }, { status: 404 });
    }
    // Only the project's renders folder and the shared exports folder can be revealed.
    const file = finishedExportFile(job, projectRendersDir(projectId));
    if (!file) return NextResponse.json({ error: "The exported file was moved or deleted" }, { status: 404 });
    await revealInFileManager(file);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? (/origin|local editor/i.test(String(error)) ? 403 : 500);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not open the folder" }, { status });
  }
}
