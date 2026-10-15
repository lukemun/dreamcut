import { NextResponse } from "next/server";

import { finishedExportFile } from "@/lib/local-store/export-library";
import { projectRendersDir } from "@/lib/local-store/paths";
import { getJob } from "@/lib/local-store/render-jobs";
import { revealInFileManager } from "@/lib/local-store/reveal-file";
import { assertEditorOrigin } from "@/lib/render/capture-origin";

type Params = { params: Promise<{ jobId: string }> };

/** Show one finished export in Finder, from the Library. */
export async function POST(request: Request, { params }: Params) {
  try {
    assertEditorOrigin(request);
    const { jobId } = await params;
    const job = getJob(jobId);
    const file = job?.status === "completed" ? finishedExportFile(job, projectRendersDir(job.projectId)) : null;
    if (!file) return NextResponse.json({ error: "That export is no longer available" }, { status: 404 });
    await revealInFileManager(file);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? (/origin|local editor/i.test(String(error)) ? 403 : 500);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not open the folder" }, { status });
  }
}
