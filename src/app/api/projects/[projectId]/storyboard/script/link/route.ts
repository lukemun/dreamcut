import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readStoryboard, storyboardAssets, updateStoryboard } from "@/lib/local-store/storyboard";
import { storyboardAgentSummary } from "@/lib/storyboard/agent-draft";
import { applyScriptLinks, storyboardScriptLinkSchema } from "@/lib/storyboard/script";
type Context = { params: Promise<{ projectId: string }> };

/** Agent links between script sections and visuals, saved as one revision-checked storyboard Undo step. */
export async function POST(request: Request, { params }: Context) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const write = storyboardScriptLinkSchema.parse(await request.json());
    const current = readStoryboard(projectId);
    if (current.revision !== write.revision) return NextResponse.json({ error: "The storyboard changed since storyboard_get. Read it again and link onto the current script.", code: "STALE_REVISION", current_revision: current.revision }, { status: 409 });
    const assets = storyboardAssets(projectId);
    let content;
    try { content = applyScriptLinks(current.content, write, assets); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid link", code: "INVALID_LINK" }, { status: 422 }); }
    const saved = await updateStoryboard(projectId, { action: "save", revision: write.revision, content });
    return NextResponse.json({ ...storyboardAgentSummary(saved, assets),
      saved: { revision: saved.revision, links: write.links.length, visuals: write.links.reduce((n, l) => n + l.visuals.length, 0) },
      undo: "One Undo in the Storyboard page removes these links." });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "links"}: ${i.message}`).join("; "), code: "INVALID_LINK" }, { status: 422 });
    const status = (error as { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot save the links", ...(status === 409 ? { code: "STALE_REVISION" } : {}) }, { status });
  }
}
