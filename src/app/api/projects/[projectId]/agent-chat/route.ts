import { z } from "zod";
import { browserChatAction, browserChatEnabled } from "@/lib/agent/browser-chat-host";
import { assertLocalEditorRequest } from "@/lib/agent/browser-chat-guard";
import { assertProject } from "@/lib/local-store/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const body = z.object({
  action: z.enum(["history", "connect", "send", "cancel", "disconnect", "new-conversation", "login", "models", "prewarm"]),
  provider: z.enum(["codex", "claude", "local"]).optional(),
  text: z.string().max(64000).optional(),
  display: z.string().max(64000).optional(),
  attachments: z.array(z.object({ kind: z.string().max(40), label: z.string().max(200) }).strict()).max(100).optional(),
  model: z.string().min(1).max(160).optional(),
  step: z.enum(["start", "wait", "code", "cancel"]).optional(),
  code: z.string().max(2000).optional(),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let origin: string;
  try { origin = assertLocalEditorRequest(request, { requireOrigin: true }); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 403 }); }
  if (!browserChatEnabled()) return Response.json({ error: "Use the desktop window's chat." }, { status: 404 });
  try {
    const { projectId } = await params; assertProject(projectId);
    const { action, ...payload } = body.parse(await request.json());
    const result = await browserChatAction(projectId, origin, action, payload);
    return Response.json({ result: result ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The editing assistant could not complete that." }, { status: 400 });
  }
}
