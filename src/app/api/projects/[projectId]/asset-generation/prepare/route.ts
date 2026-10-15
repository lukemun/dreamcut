import { z } from "zod";
import { assetDraftSchema } from "@/lib/generation/assets";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { prepareAssetWorkspace } from "@/lib/local-store/asset-generation-workspace";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const { draft } = z.object({ draft: assetDraftSchema }).strict().parse(await request.json());
    return Response.json(await prepareAssetWorkspace(projectId, draft));
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
