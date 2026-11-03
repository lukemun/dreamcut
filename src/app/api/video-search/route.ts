import { NextResponse } from "next/server";
import { searchVideos } from "@/lib/local-store/video-search";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json(searchVideos({
      projectId: params.get("project_id") ?? undefined, query: params.get("q") ?? "",
      offset: params.has("offset") ? Number(params.get("offset")) : undefined,
      limit: params.has("limit") ? Number(params.get("limit")) : undefined,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Video search unavailable" }, { status: 400 }); }
}
