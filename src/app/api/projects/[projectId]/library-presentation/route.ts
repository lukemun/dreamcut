import { conditionalJsonResponse } from "@/lib/conditional-json-response";
import { presentLibraryVideos, readLibraryPresentation, resolveLibraryPresentation, dismissLibraryPresentation } from "@/lib/local-store/library-presentation";
export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };
const failure = (error: unknown, status = 400) => {
  const message = error instanceof Error ? error.message : "Library handoff failed";
  return Response.json({ error: message, tool_error: { schema_version: 1, code: "LIBRARY_PRESENTATION_FAILED", message, retryable: false, state_changed: "unknown", recovery: { action: "inspect_source_handles", reason: "Search again for current imported handles and verified source moments before presenting." } } }, { status });
};
export async function GET(request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    // Conditional: the editor polls this, and an unchanged handoff answers 304.
    return conditionalJsonResponse(request, new URL(request.url).searchParams.has("metadata") ? { presentation: readLibraryPresentation(projectId) } : resolveLibraryPresentation(projectId));
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
export async function POST(request: Request, { params }: Context) {
  try { const { projectId } = await params; return Response.json(presentLibraryVideos(projectId, await request.json())); }
  catch (error) { return failure(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const { projectId } = await params, { id } = await request.json();
    if (typeof id !== "string") throw new Error("Presentation id required");
    dismissLibraryPresentation(projectId, id); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 409 }); }
}
