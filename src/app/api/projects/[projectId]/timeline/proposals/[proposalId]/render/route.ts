import { z } from "zod";
import { readProposalRenderSnapshot } from "@/lib/local-store/proposal-render-snapshot";
import { getJob, startProposalRender, stopRender } from "@/lib/local-store/render-jobs";
import { withProjectLock } from "@/lib/local-store/store";
import { editorRequestOrigin } from "@/lib/render/capture-origin";

type Params = { params: Promise<{ projectId: string; proposalId: string }> };
const startSchema = z.object({
  option_id: z.string().min(1), expected_revision: z.string().regex(/^[a-f0-9]{64}$/),
  expected_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  backend: z.enum(["standard", "gpu"]).default("gpu"),
  resolution: z.union([z.literal(480), z.literal(720), z.literal(1080), z.literal(1440), z.literal(2160)]).default(1080),
}).strict();

function responseError(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Proposal preview render failed" },
    { status: error instanceof z.ZodError ? 400 : (error as { status?: number })?.status ?? 500 });
}
function scopedJob(projectId: string, proposalId: string, jobId: string) {
  const job = getJob(jobId);
  if (!job || job.projectId !== projectId || job.preview?.proposal_id !== proposalId) {
    throw Object.assign(new Error("Proposal preview job not found"), { status: 404 });
  }
  return job;
}
function jobPayload(job: NonNullable<ReturnType<typeof getJob>>) {
  return { job_id: job.id, status: job.status, status_label: job.statusLabel, progress: job.progress,
    preview: job.preview, error: job.error,
    output_url: job.status === "completed" ? `/api/generation-jobs/${job.id}/file` : null };
}

/** Prepare an exact candidate identity, or inspect a previously dispatched job. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId, proposalId } = await params;
    const query = new URL(request.url).searchParams;
    const jobId = query.get("job_id");
    if (jobId) return Response.json(jobPayload(scopedJob(projectId, proposalId, jobId)));
    const option = query.get("option_id");
    if (!option) return Response.json({ error: "option_id is required to prepare a preview render" }, { status: 400 });
    const snapshot = await withProjectLock(projectId, () => readProposalRenderSnapshot(projectId, proposalId, option));
    return Response.json({ preview: snapshot.identity, approval: "unapproved", state_changed: false });
  } catch (error) { return responseError(error); }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId, proposalId } = await params;
    const body = startSchema.parse(await request.json());
    const result = await startProposalRender(projectId, proposalId, body.option_id,
      { revision: body.expected_revision, fingerprint: body.expected_fingerprint }, editorRequestOrigin(request),
      { backend: body.backend, resolution: body.resolution, dynamicRange: "sdr" });
    if (!result.ok) return Response.json(result.body, { status: result.status });
    return Response.json({ ...jobPayload(result.job), already_in_progress: result.alreadyInProgress });
  } catch (error) { return responseError(error); }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { projectId, proposalId } = await params;
    const jobId = new URL(request.url).searchParams.get("job_id");
    if (!jobId) return Response.json({ error: "job_id is required" }, { status: 400 });
    const job = scopedJob(projectId, proposalId, jobId);
    if (job.status !== "processing") return Response.json(jobPayload(job));
    if (!stopRender(jobId)) return Response.json({ error: "This preview is no longer running" }, { status: 409 });
    return Response.json({ job_id: jobId, status: "stopping", preview: job.preview });
  } catch (error) { return responseError(error); }
}
