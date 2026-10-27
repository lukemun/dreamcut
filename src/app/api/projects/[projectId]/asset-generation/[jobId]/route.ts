import { z } from "zod";
import { keepAssetOutput, readAssetJob, startAssetWorker, updateAssetJob } from "@/lib/local-store/asset-generation";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { canResumeAssetJob } from "@/lib/generation/assets";
type Params = { params: Promise<{ projectId: string; jobId: string }> };
export async function GET(_request: Request, { params }: Params) {
  try { const { projectId, jobId } = await params; const job = readAssetJob(projectId, jobId); return Response.json({ job }); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
export async function POST(request: Request, { params }: Params) {
  try {
    assertGenerationOrigin(request); const { projectId, jobId } = await params;
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("keep"), outputId: z.string().max(200), annotation: z.string().trim().max(2000).optional() }),
      z.object({ action: z.enum(["resume", "cancel"]) }),
    ]).parse(await request.json());
    let job = readAssetJob(projectId, jobId);
    if (body.action === "keep") job = await keepAssetOutput(projectId, jobId, body.outputId, body.annotation);
    if (body.action === "resume") {
      if (!canResumeAssetJob(job)) throw new Error("This request can't be resumed. Generate it again.");
      // A Cloud request resumes under the same id, so the Cloud returns the same job instead of charging again.
      const running = Boolean(job.provider || job.cloud?.generationId);
      job = await updateAssetJob(projectId, jobId, { status: running ? "running" : "queued", error: undefined }); startAssetWorker(projectId, jobId);
    }
    if (body.action === "cancel") {
      if (!["queued", "running", "submitting"].includes(job.status)) throw new Error("This request is no longer cancelable.");
      job = await updateAssetJob(projectId, jobId, { cancelRequested: true });
    }
    return Response.json({ job });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
