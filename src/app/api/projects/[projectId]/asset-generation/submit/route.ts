import { z } from "zod";
import { localEditorOrigin } from "@/lib/local-request";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { DraftSubmitRefusal, submitStagedDraft } from "@/lib/local-store/asset-generation-workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ staged_id: z.uuid(), approval: z.string().max(2000) }).strict();

/** asset_generation_submit: generate the visible staged draft after the creator approved it in chat. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const result = await submitStagedDraft(projectId, bodySchema.parse(await request.json()), localEditorOrigin(request));
    return Response.json({ ...result, review_url: `/p/${encodeURIComponent(projectId)}/library?generate=results` }, { status: result.already_submitted ? 200 : 201 });
  } catch (error) {
    if (error instanceof DraftSubmitRefusal) return Response.json({ error: error.message, tool_error: {
      schema_version: 1, code: error.code, message: error.message, retryable: false, state_changed: false, current: error.details,
      recovery: { action: "ask_creator", reason: "Nothing was generated or charged. Resolve this with the creator, then call again with their approval." },
    } }, { status: 409 });
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
