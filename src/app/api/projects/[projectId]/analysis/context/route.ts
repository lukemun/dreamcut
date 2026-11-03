import { NextResponse } from "next/server";

import { buildProjectMediaContextPack } from "@/lib/media-analysis/project-context";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    return NextResponse.json(buildProjectMediaContextPack(projectId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to read media context" }, { status: 500 });
  }
}
