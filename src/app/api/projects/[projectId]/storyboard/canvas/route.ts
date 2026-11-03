import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readStoryboard, storyboardAssets, updateStoryboard } from "@/lib/local-store/storyboard";
import { storyboardAgentSummary } from "@/lib/storyboard/agent-draft";
import { applyCanvasOps, storyboardCanvasWriteSchema } from "@/lib/storyboard/canvas";
import { storyboardContentSchema } from "@/lib/storyboard/model";
type Context = { params: Promise<{ projectId: string }> };

/** Agent changes to the storyboard canvas (moments, effects, text and the lines between them), saved as one
 *  revision-checked storyboard Undo step. Nothing reaches the timeline. */
export async function POST(request: Request, { params }: Context) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const write = storyboardCanvasWriteSchema.parse(await request.json());
    const current = readStoryboard(projectId);
    if (current.revision !== write.revision) return NextResponse.json({ error: "The storyboard changed since storyboard_get. Read it again and change the current canvas.", code: "STALE_REVISION", current_revision: current.revision }, { status: 409 });
    const assets = storyboardAssets(projectId);
    let applied;
    try {
      applied = applyCanvasOps(current.content, write.ops);
      storyboardContentSchema.parse(applied.board);
    } catch (error) {
      const message = error instanceof ZodError ? error.issues.map(i => i.message).join("; ") : error instanceof Error ? error.message : "Invalid canvas change";
      return NextResponse.json({ error: message, code: "INVALID_CANVAS" }, { status: 422 });
    }
    const saved = await updateStoryboard(projectId, { action: "save", revision: write.revision, content: applied.board });
    return NextResponse.json({ ...storyboardAgentSummary(saved, assets),
      saved: { revision: saved.revision, changes: write.ops.length, refs: applied.refs },
      undo: "One Undo in the Storyboard page reverses these canvas changes." });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "ops"}: ${i.message}`).join("; "), code: "INVALID_CANVAS" }, { status: 422 });
    const status = (error as { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot save the canvas", ...(status === 409 ? { code: "STALE_REVISION" } : {}) }, { status });
  }
}
