import path from "node:path";

import { MEDIA_CONTENT_TYPES } from "@/lib/local-store/media";
import { resolveSfxCatalogFile } from "@/lib/local-store/sfx-catalog";
import { streamFileResponse } from "@/lib/local-store/stream-file";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { path: segments } = await params;
    const relativeFile = segments.map((segment) => decodeURIComponent(segment)).join(path.sep);
    const absPath = resolveSfxCatalogFile(relativeFile);
    const contentType = MEDIA_CONTENT_TYPES[path.extname(absPath).toLowerCase()] ?? "application/octet-stream";
    return streamFileResponse(absPath, request, { contentType });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return Response.json({ error: error instanceof Error ? error.message : "Failed to serve catalog SFX" }, { status });
  }
}
