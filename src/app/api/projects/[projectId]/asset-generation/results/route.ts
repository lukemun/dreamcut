import { z } from "zod";
import { assetGenerationResults, MAX_WAIT_SECONDS } from "@/lib/agent/asset-generation-results";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { assertProject } from "@/lib/local-store/store";
export const runtime = "nodejs";
// POST so a long wait is not cached or prefetched; it reads only.
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params; assertProject(projectId);
    const body = z.object({ job_id: z.uuid().optional(), wait_seconds: z.number().min(0).max(MAX_WAIT_SECONDS).optional() }).strict().parse(await request.json());
    return Response.json(await assetGenerationResults(projectId, body));
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
