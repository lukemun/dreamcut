import { resolveLibraryAudioSource } from "@/lib/local-store/library-rhythm";
import { readInstrumentAnalysis, startInstrumentAnalysis, saveInstrumentSettings, saveInstrumentPreset } from "@/lib/local-store/instrument-analysis";
import { projectExists } from "@/lib/local-store/paths";
import { withProjectLock } from "@/lib/local-store/store";
type Context = { params: Promise<{ projectId: string }> };
async function handle(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    if (!projectExists(projectId)) return Response.json({ error: "Project not found" }, { status: 404 });
    const body = request.method === "GET" ? { source_url: new URL(request.url).searchParams.get("source_url") } : await request.json();
    if (typeof body.source_url !== "string") throw new Error("Choose a Library track");
    const source = resolveLibraryAudioSource(projectId, body.source_url);
    if (!source) throw new Error("Library audio is unavailable");
    const data = request.method === "GET" ? readInstrumentAnalysis(projectId, source) : await withProjectLock(projectId, () => {
      if (request.method === "POST") return startInstrumentAnalysis(projectId, source);
      if (body.action === "save_preset" || body.action === "rename_preset") return saveInstrumentPreset(projectId, source, body.name, body.settings, body.action === "rename_preset" ? body.preset_id : undefined, body.view, body.viewer);
      if (body.action != null) throw new Error("Unknown instrument action");
      return saveInstrumentSettings(projectId, source, body.settings);
    });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Instrument analysis failed" }, { status: 422 }); }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
