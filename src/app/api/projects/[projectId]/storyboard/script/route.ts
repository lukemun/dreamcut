import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readStoryboard, storyboardAssets, updateStoryboard } from "@/lib/local-store/storyboard";
import { storyboardAgentSummary } from "@/lib/storyboard/agent-draft";
import { applyScriptWrite, storyboardScriptWriteSchema } from "@/lib/storyboard/script";
type Context = { params: Promise<{ projectId: string }> };

/** Agent write of the Script document, saved as one revision-checked storyboard Undo step. */
export async function POST(request: Request, { params }: Context) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const write = storyboardScriptWriteSchema.parse(await request.json());
    const current = readStoryboard(projectId);
    if (current.revision !== write.revision) return NextResponse.json({ error: "The storyboard changed since storyboard_get. Read it again and write onto the current script.", code: "STALE_REVISION", current_revision: current.revision }, { status: 409 });
    let content;
    try { content = applyScriptWrite(current.content, write); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid script", code: "INVALID_SCRIPT" }, { status: 422 }); }
    const saved = await updateStoryboard(projectId, { action: "save", revision: write.revision, content });
    return NextResponse.json({ ...storyboardAgentSummary(saved, storyboardAssets(projectId)),
      saved: { revision: saved.revision, mode: write.mode, blocks: write.blocks.length, sections: write.blocks.filter(b => b.section).length },
      undo: "One Undo in the Storyboard page removes this script write." });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "script"}: ${i.message}`).join("; "), code: "INVALID_SCRIPT" }, { status: 422 });
    const status = (error as { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot save the script", ...(status === 409 ? { code: "STALE_REVISION" } : {}) }, { status });
  }
}
