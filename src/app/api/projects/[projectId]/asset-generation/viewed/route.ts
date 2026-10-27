import { z } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { markStagedDraftViewed } from "@/lib/local-store/asset-generation-workspace";
export const runtime = "nodejs";

/** The open Generate drawer reports that it is showing a staged draft to the creator. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const { stagedId } = z.object({ stagedId: z.uuid() }).strict().parse(await request.json());
    markStagedDraftViewed(projectId, stagedId);
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
