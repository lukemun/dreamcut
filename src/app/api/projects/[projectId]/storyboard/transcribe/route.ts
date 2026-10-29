import { NextResponse } from "next/server";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { transcribeStoryboardSource } from "@/lib/local-store/storyboard-transcript";
export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

/** Read-only preparation: a video's timed words. The page saves them onto a row as one Undo step. */
export async function POST(request: Request, { params }: Context) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const { source } = await request.json();
    if (typeof source !== "string" || !source) throw new Error("Choose a video to transcribe.");
    return NextResponse.json(await transcribeStoryboardSource(projectId, source));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot transcribe this video" }, { status: (error as { status?: number }).status ?? 400 }); }
}
