import { z } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readWorkspaceMediaSelection, updateWorkspaceMediaSelection, prepareLibraryGenerationReference, prepareLibraryAudioMedia, selectionItemSchema, setWorkspaceSelectionItems } from "@/lib/local-store/workspace-media-selection";
type Params = { params: Promise<{ projectId: string }> };
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare_audio"), source: z.string().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("toggle"), source: z.string().min(1).max(1000) }).strict(),
  z.object({ action: z.literal("set"), sources: z.array(z.string().min(1).max(1000)).max(500) }).strict(),
  z.object({ action: z.literal("prepare_reference"), source: z.string().min(1).max(1000) }).strict(),
  z.object({ action: z.literal("set_items"), items: z.array(selectionItemSchema).max(300) }).strict(),
]);
export async function GET(_request: Request, { params }: Params) {
  try { return Response.json(readWorkspaceMediaSelection((await params).projectId)); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
export async function POST(request: Request, { params }: Params) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const input = command.parse(await request.json());
    if (input.action === "prepare_audio") return Response.json(await prepareLibraryAudioMedia(projectId, input.source));
    if (input.action === "set_items") return Response.json(await setWorkspaceSelectionItems(projectId, input.items));
    return Response.json(input.action === "prepare_reference" ? await prepareLibraryGenerationReference(projectId, input.source) : await updateWorkspaceMediaSelection(projectId, input));
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
