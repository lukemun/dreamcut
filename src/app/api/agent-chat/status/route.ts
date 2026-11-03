import { browserChatEnabled, browserChatStatus } from "@/lib/agent/browser-chat-host";
import { assertLocalEditorRequest } from "@/lib/agent/browser-chat-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalEditorRequest(request, { requireOrigin: false });
    if (!browserChatEnabled()) return Response.json({ error: "Use the desktop window's chat." }, { status: 404 });
    return Response.json(await browserChatStatus());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Agent status is unavailable." }, { status: 403 });
  }
}
