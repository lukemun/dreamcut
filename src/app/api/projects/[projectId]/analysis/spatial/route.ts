import { NextResponse } from "next/server";
import { assessProjectSpatial } from "@/lib/local-store/spatial-assessment";
import { readTimeline } from "@/lib/local-store/store";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    return NextResponse.json(assessProjectSpatial(projectId, readTimeline(projectId)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Assessment unavailable" }, { status: 500 });
  }
}
