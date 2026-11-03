import path from "node:path";
import { getJob } from "@/lib/local-store/render-jobs";
import { projectRendersDir } from "@/lib/local-store/paths";
import { streamFileResponse } from "@/lib/local-store/stream-file";

/** Job-specific local review artifact; never the latest delivery export. */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job?.preview || job.status !== "completed" || !job.fileName || path.basename(job.fileName) !== job.fileName) {
    return Response.json({ error: "Completed proposal preview not found" }, { status: 404 });
  }
  return streamFileResponse(path.join(projectRendersDir(job.projectId), "proposal-previews", job.fileName), request,
    { contentType: "video/mp4" });
}
