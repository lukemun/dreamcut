import { finishedExportFile } from "@/lib/local-store/export-library";
import { projectRendersDir } from "@/lib/local-store/paths";
import { getJob } from "@/lib/local-store/render-jobs";
import { streamFileResponse } from "@/lib/local-store/stream-file";

type Params = { params: Promise<{ jobId: string }> };

/** Play one finished export from the Library. */
export async function GET(request: Request, { params }: Params) {
  const { jobId } = await params;
  const job = getJob(jobId);
  const file = job?.status === "completed" ? finishedExportFile(job, projectRendersDir(job.projectId)) : null;
  if (!file) return Response.json({ error: "That export is no longer available" }, { status: 404 });
  return streamFileResponse(file, request, { contentType: "video/mp4" });
}
