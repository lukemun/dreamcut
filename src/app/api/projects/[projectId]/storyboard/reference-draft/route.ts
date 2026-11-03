import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readStoryboard, storyboardAssets, updateStoryboard } from "@/lib/local-store/storyboard";
import { referenceShotBeats } from "@/lib/local-store/storyboard-recast";
import { applyStoryboardReferenceDraft, storyboardAgentSummary, storyboardReferenceDraftSchema, StoryboardDraftError } from "@/lib/storyboard/agent-draft";
type Context = { params: Promise<{ projectId: string }> };

/** Agent draft of a Follow-reference recast plan, saved as one revision-checked storyboard Undo step. */
export async function POST(request: Request, { params }: Context) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const draft = storyboardReferenceDraftSchema.parse(await request.json());
    const current = readStoryboard(projectId);
    if (current.revision !== draft.revision) return NextResponse.json({ error: "The storyboard changed since storyboard_get. Read it again and redraft from the current board.", code: "STALE_REVISION", current_revision: current.revision }, { status: 409 });
    const assets = storyboardAssets(projectId);
    const cuts = draft.beats ? null : (await referenceShotBeats(projectId, draft.source, { maxSeconds: draft.max_beat_seconds })).beats;
    const content = applyStoryboardReferenceDraft(current.content, draft, assets, cuts);
    const saved = await updateStoryboard(projectId, { action: "save", revision: draft.revision, content });
    return NextResponse.json({ ...storyboardAgentSummary(saved, assets), saved: { revision: saved.revision, beats: content.reference!.beats.length, split_at_cuts: !draft.beats },
      undo: "One Undo in the Storyboard page removes this whole plan.", next: "Prices: storyboard_recast_quote. The creator generates from the Storyboard's Recast button; that click spends credits." });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "draft"}: ${i.message}`).join("; "), code: "INVALID_DRAFT" }, { status: 422 });
    if (error instanceof StoryboardDraftError) return NextResponse.json({ error: error.message, code: "INVALID_DRAFT" }, { status: 422 });
    const status = (error as { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot save the plan", ...(status === 409 ? { code: "STALE_REVISION" } : {}) }, { status });
  }
}
