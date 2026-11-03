import path from "node:path";

import { latestRenderFile } from "@/lib/local-store/render-jobs";
import { projectRendersDir } from "@/lib/local-store/paths";
import { assertProject, readMetadata } from "@/lib/local-store/store";
import { streamFileResponse } from "@/lib/local-store/stream-file";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);

    const latest = latestRenderFile(projectId);
    if (!latest) {
      return Response.json({ error: "No render found" }, { status: 404 });
    }

    const download = new URL(request.url).searchParams.get("download") === "1";
    const title = readMetadata(projectId).title ?? projectId;
    const downloadName = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "render"}.mp4`;

    return streamFileResponse(path.join(projectRendersDir(projectId), latest.fileName), request, {
      contentType: "video/mp4",
      ...(download ? { downloadName } : {}),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to serve render" },
      { status },
    );
  }
}
