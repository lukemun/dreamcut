import path from "node:path";

import { NextResponse } from "next/server";

import { resolveMediaPath } from "@/lib/local-store/media";
import { assertProject } from "@/lib/local-store/store";
import { createCustomCutout, normalizeCustomCutoutRequest } from "@/lib/media-analysis/custom-cutout";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const input = normalizeCustomCutoutRequest(await request.json());
    const sourcePath = resolveMediaPath(projectId, input.sourceRelativePath.split(/[\\/]/));
    if (!sourcePath || ![".mp4", ".mov", ".webm", ".m4v"].includes(path.extname(sourcePath).toLowerCase())) {
      return NextResponse.json({ error: "Custom removal requires a project video asset" }, { status: 400 });
    }
    const receipt = await createCustomCutout({ projectId: projectId, sourcePath, request: input });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Custom cutout failed" }, { status });
  }
}
