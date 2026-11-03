import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readAnnotations, writeAnnotations } from "@/lib/local-store/media-analysis";
import type { AnalysisAnnotation } from "@/lib/media-analysis/schema";

type Params = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  return NextResponse.json(readAnnotations(projectId));
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json() as Partial<AnalysisAnnotation>;
    if (typeof body.asset_id !== "string" || typeof body.label !== "string" || typeof body.start_seconds !== "number" || typeof body.end_seconds !== "number" || body.end_seconds < body.start_seconds) throw new Error("Invalid annotation");
    const now = new Date().toISOString();
    const annotation: AnalysisAnnotation = {
      annotation_id: randomUUID(), asset_id: body.asset_id, track_id: typeof body.track_id === "string" ? body.track_id : null,
      start_seconds: body.start_seconds, end_seconds: body.end_seconds, label: body.label,
      notes: typeof body.notes === "string" ? body.notes : null, created_at: now, updated_at: now,
    };
    const current = readAnnotations(projectId);
    writeAnnotations(projectId, { ...current, annotations: [...current.annotations, annotation] });
    return NextResponse.json({ annotation }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create annotation" }, { status: 400 });
  }
}
