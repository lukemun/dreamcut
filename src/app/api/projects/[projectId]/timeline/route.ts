import { NextResponse } from "next/server";

import { compressedJson } from "@/lib/local-store/compressed-json";

import { readTimelineSnapshot } from "@/lib/local-store/store";
import { timelinePayload } from "@/lib/local-store/timeline-payload";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const { timeline, revision } = readTimelineSnapshot(projectId);
    return compressedJson(request, { ...timelinePayload(projectId, timeline), revision });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load timeline" },
      { status },
    );
  }
}
