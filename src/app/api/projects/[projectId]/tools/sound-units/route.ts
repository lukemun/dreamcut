import { toolErrorResponse } from "@/lib/agent/tool-error";
import { extractSoundUnits, parseSoundUnitsRequest } from "@/lib/local-store/sound-units";
import { assertProject } from "@/lib/local-store/store";

/** Split a reference's sound effects into single units; preparation only, no timeline edit. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const body = await request.json() as Record<string, unknown>;
    const agent = body.agent && typeof body.agent === "object" ? body.agent as { name?: string; model?: string } : undefined;
    return Response.json(await extractSoundUnits(projectId, parseSoundUnitsRequest(body), agent));
  } catch (error) {
    return toolErrorResponse(error);
  }
}
