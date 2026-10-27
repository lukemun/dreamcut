import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readStoryboard, storyboardAssets, updateStoryboard } from "@/lib/local-store/storyboard";
import { applyStoryboardDraft, storyboardAgentSummary, storyboardDraftSchema, StoryboardDraftError } from "@/lib/storyboard/agent-draft";
type Context = { params: Promise<{ projectId: string }> };

/** Agent read of the storyboard: compact board, revision and usable sources. */
export async function GET(_request: Request, { params }: Context) {
  try { const { projectId } = await params; return NextResponse.json(storyboardAgentSummary(readStoryboard(projectId), storyboardAssets(projectId))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot load storyboard" }, { status: 400 }); }
}

/** Agent draft of the freeform story, saved as one revision-checked storyboard Undo step. */
export async function POST(request: Request, { params }: Context) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const draft = storyboardDraftSchema.parse(await request.json());
    const current = readStoryboard(projectId);
    if (current.revision !== draft.revision) return NextResponse.json({ error: "The storyboard changed since storyboard_get. Read it again and redraft from the current board.", code: "STALE_REVISION", current_revision: current.revision }, { status: 409 });
    const assets = storyboardAssets(projectId);
    const content = applyStoryboardDraft(current.content, draft, assets);
    const saved = await updateStoryboard(projectId, { action: "save", revision: draft.revision, content });
    const summary = storyboardAgentSummary(saved, assets);
    return NextResponse.json({ ...summary, saved: { revision: saved.revision, mode: draft.mode, beats: draft.beats.length, shots: draft.beats.reduce((n, b) => n + b.shots.length, 0) },
      undo: "One Undo in the Storyboard page removes this whole draft." });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "draft"}: ${i.message}`).join("; "), code: "INVALID_DRAFT" }, { status: 422 });
    if (error instanceof StoryboardDraftError) return NextResponse.json({ error: error.message, code: "INVALID_DRAFT" }, { status: 422 });
    const status = (error as { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot save the draft", ...(status === 409 ? { code: "STALE_REVISION" } : {}) }, { status });
  }
}
