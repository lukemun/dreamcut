import { z } from "zod";
import { localEditorOrigin } from "@/lib/local-request";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { DraftSubmitRefusal } from "@/lib/local-store/asset-generation-workspace";
import { approveChatGeneration, draftChatGeneration } from "@/lib/local-store/chat-generation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const approveSchema = z.object({ project_id: z.string().min(1).max(200), draft_id: z.uuid(), approval: z.string().max(2000) });

/** generate_media: draft a request into the Generate form and price it, then generate it once the creator approves that price in chat. */
export async function POST(request: Request) {
  try {
    assertGenerationOrigin(request);
    const body = await request.json();
    if (body && typeof body === "object" && "draft_id" in body) {
      const result = await approveChatGeneration(approveSchema.parse(body), localEditorOrigin(request));
      return Response.json(result, { status: result.already_submitted ? 200 : 201 });
    }
    return Response.json(await draftChatGeneration(body, localEditorOrigin(request)));
  } catch (error) {
    if (error instanceof DraftSubmitRefusal) return Response.json({ error: error.message, tool_error: {
      schema_version: 1, code: error.code, message: error.message, retryable: false, state_changed: false, current: error.details,
      recovery: { action: "ask_creator", reason: "Nothing was generated or charged. Resolve this with the creator, then call again with their approval." },
    } }, { status: 409 });
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
