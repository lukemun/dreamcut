import { conditionalJsonResponse } from "@/lib/conditional-json-response";
import { z } from "zod";
import { assetDraftSchema, ACTIVE_ASSET_STATUSES } from "@/lib/generation/assets";
import { assertGenerationOrigin, createAssetJob, generationAssets, listAssetJobs, startAssetWorker } from "@/lib/local-store/asset-generation";
import { draftFingerprint, readAssetWorkspace, saveAssetWorkspace } from "@/lib/local-store/asset-generation-workspace";
import { assertProject } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params; assertProject(projectId);
    const jobs = listAssetJobs(projectId);
    for (const job of jobs.filter(j => ACTIVE_ASSET_STATUSES.includes(j.status) || (j.status === "ready" && j.cloud?.ackPending))) startAssetWorker(projectId, job.id);
    // Conditional: open generation surfaces poll this; unchanged state answers 304.
    return conditionalJsonResponse(request, { jobs, assets: generationAssets(projectId), workspace: readAssetWorkspace(projectId) });
  } catch (error) { return Response.json({ error: String((error as Error).message) }, { status: 400 }); }
}
export async function PUT(request: Request, { params }: Params) {
  try {
    assertGenerationOrigin(request); const { projectId } = await params; assertProject(projectId);
    saveAssetWorkspace(projectId, await request.json());
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
/** The creator's Generate click. `acceptedCredits` is the DreamCut price they saw for this exact draft. */
export async function POST(request: Request, { params }: Params) {
  try {
    assertGenerationOrigin(request); const { projectId } = await params;
    const body = z.object({ id: z.uuid(), draft: assetDraftSchema, acceptedCredits: z.number().int().positive().optional() }).strict().parse(await request.json());
    // The creator already approved this exact draft in chat: the button must not generate (and charge) it again.
    const fingerprint = draftFingerprint(body.draft);
    const approved = listAssetJobs(projectId).find(job => job.approval?.source === "chat" && !["failed", "canceled"].includes(job.status) && draftFingerprint(job.request) === fingerprint && job.approval.staged_id === readAssetWorkspace(projectId).stagedId);
    if (approved) return Response.json({ job: approved }, { status: 200 });
    return Response.json({ job: await createAssetJob(projectId, body.draft, body.id, body.acceptedCredits) }, { status: 201 });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
