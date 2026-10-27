import { NextResponse } from "next/server";
import { enqueueAssets } from "@/lib/local-store/media-analysis";
import { readMetadata } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    if (readMetadata(projectId).media_preprocessing_enabled !== true) {
      return NextResponse.json({ error: "Media preprocessing is disabled for this project" }, { status: 409 });
    }
    const body = await request.json().catch(() => ({})) as { asset_ids?: unknown };
    const assetIds = Array.isArray(body.asset_ids) ? body.asset_ids.filter((value): value is string => typeof value === "string") : undefined;
    return NextResponse.json({ jobs: enqueueAssets(projectId, assetIds) }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to enqueue assets" }, { status: 400 });
  }
}
