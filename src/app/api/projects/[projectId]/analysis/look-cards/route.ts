import { NextResponse } from "next/server";
import { assertProject } from "@/lib/local-store/store";
import { lookCards } from "@/lib/media-analysis/look-cards";

/** Builds proposal cards that give clips a reference clip's look; saves nothing and applies nothing. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    return NextResponse.json(await lookCards(projectId, await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
