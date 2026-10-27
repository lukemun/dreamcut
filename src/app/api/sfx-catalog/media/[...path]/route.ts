import path from "node:path";

import { toolErrorResponse } from "@/lib/agent/tool-error";
import { MEDIA_CONTENT_TYPES } from "@/lib/local-store/media";
import { isPersonalCatalogFile } from "@/lib/local-store/personal-library";
import { resolveSfxCatalogFile, sfxCatalogCheckoutPath } from "@/lib/local-store/sfx-catalog";
import { ensureSfxCatalogFile } from "@/lib/local-store/sfx-catalog-cloud";
import { streamFileResponse } from "@/lib/local-store/stream-file";

type Params = { params: Promise<{ path: string[] }> };

/** A catalog sound: personal library, this checkout, or downloaded from DreamCut Cloud on first use. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { path: segments } = await params;
    const relativeFile = segments.map((segment) => decodeURIComponent(segment)).join(path.sep);
    const absPath = isPersonalCatalogFile(relativeFile)
      ? resolveSfxCatalogFile(relativeFile)
      : await ensureSfxCatalogFile(relativeFile, sfxCatalogCheckoutPath(relativeFile));
    const contentType = MEDIA_CONTENT_TYPES[path.extname(absPath).toLowerCase()] ?? "application/octet-stream";
    return streamFileResponse(absPath, request, { contentType });
  } catch (error) {
    if ((error as { toolError?: unknown }).toolError) return toolErrorResponse(error);
    const status = (error as Error & { status?: number }).status ?? 500;
    return Response.json({ error: error instanceof Error ? error.message : "Failed to serve catalog SFX" }, { status });
  }
}
