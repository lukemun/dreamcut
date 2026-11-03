import { NextResponse } from "next/server";
import { listHistoryPage } from "@/lib/local-store/history-list";
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    return NextResponse.json(listHistoryPage(projectId, new URL(request.url).searchParams.get("before") ?? undefined));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load history" }, { status: 400 });
  }
}
