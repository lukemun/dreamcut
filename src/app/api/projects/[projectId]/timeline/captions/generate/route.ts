import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { generateReviewedCaptions, prepareCaptionTranscript } from "@/lib/local-store/generate-captions";

export const runtime = "nodejs";
export const POST = withEditRequestActor(async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    if (body.action === "transcribe" && typeof body.elementId === "string")
      return NextResponse.json(await prepareCaptionTranscript(projectId, body.elementId));
    if (body.action === "generate" && typeof body.sessionId === "string" && typeof body.text === "string")
      return NextResponse.json(await generateReviewedCaptions(projectId, body.sessionId, body.text, body.wordLimit, body.pronunciations));
    return NextResponse.json({ error: "Invalid caption generation request." }, { status: 400 });
  } catch (cause) {
    const error = cause as Error & { status?: number };
    return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
  }
});
