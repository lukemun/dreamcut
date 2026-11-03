import { z } from "zod";
import { assetDraftSchema } from "@/lib/generation/assets";
import { checkGeneration } from "@/lib/generation/cloud-readiness";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { assertProject } from "@/lib/local-store/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Price, sign-in and balance for the Generate button. Read-only: no job, no upload, no charge. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params; assertProject(projectId);
    const { draft } = z.object({ draft: assetDraftSchema }).strict().parse(await request.json());
    if (draft.route !== "fal") throw new Error("Only DreamCut models are priced in credits.");
    return Response.json(await checkGeneration(draft), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
