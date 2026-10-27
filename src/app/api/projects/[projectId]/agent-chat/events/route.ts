import { browserChatEnabled, subscribeBrowserChat, type ChatEvent } from "@/lib/agent/browser-chat-host";
import { assertLocalEditorRequest } from "@/lib/agent/browser-chat-guard";
import { assertProject } from "@/lib/local-store/store";
import { editorSiblingCorsHeaders } from "@/lib/loopback-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-sent events for one project's conversation: text deltas, completion, errors.
// The editor opens this on its stream-only loopback name ([::1], lib/loopback-transport), so it
// is a CORS read from the page's own origin on the same port.
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let origin: string;
  try { origin = assertLocalEditorRequest(request, { requireOrigin: false, siblingOrigin: true }); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 403 }); }
  if (!browserChatEnabled()) return Response.json({ error: "Use the desktop window's chat." }, { status: 404 });
  const { projectId } = await params;
  try { assertProject(projectId); } catch { return Response.json({ error: "Unknown project." }, { status: 404 }); }
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => { try { controller.enqueue(encoder.encode(text)); } catch { /* Closed. */ } };
      unsubscribe = await subscribeBrowserChat(projectId, origin, (event: ChatEvent) => write(`data: ${JSON.stringify(event)}\n\n`));
      write(": connected\n\n");
      heartbeat = setInterval(() => write(": keep-alive\n\n"), 15_000);
      request.signal.addEventListener("abort", () => { clearInterval(heartbeat); unsubscribe(); try { controller.close(); } catch { /* Closed. */ } });
    },
    cancel() { clearInterval(heartbeat); unsubscribe(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", ...editorSiblingCorsHeaders(request) } });
}
