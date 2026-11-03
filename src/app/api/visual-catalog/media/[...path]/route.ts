import path from "node:path";

import { ensureVisualCatalogFile, visualCatalogFileDownloaded } from "@/lib/local-store/visual-catalog-cloud";
import { isPersonalCatalogFile } from "@/lib/local-store/personal-library";
import { MEDIA_CONTENT_TYPES } from "@/lib/local-store/media";
import { streamFileResponse } from "@/lib/local-store/stream-file";
import { CATALOG_THUMBNAIL_CACHE_CONTROL, thumbnailResponse } from "@/lib/local-store/media-thumbnails";

type Params = { params: Promise<{ path: string[] }> };

/** A catalog visual: personal library, this checkout, or downloaded from DreamCut Cloud on first use. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { path: segments } = await params;
    const relativeFile = segments.map((segment) => decodeURIComponent(segment)).join(path.sep);
    // A thumbnail never starts a download: browsing the Library must not fetch every clip.
    if (new URL(request.url).searchParams.has("w") && !isPersonalCatalogFile(relativeFile) && !visualCatalogFileDownloaded(relativeFile)) {
      return Response.json({ error: "This clip has not been downloaded yet." }, { status: 404 });
    }
    const absPath = await ensureVisualCatalogFile(relativeFile);
    const contentType = MEDIA_CONTENT_TYPES[path.extname(absPath).toLowerCase()] ?? "application/octet-stream";
    // The export composition runs on a separate localhost origin. Canvas
    // effects (including chroma key) need the same CORS access as project media.
    const thumbnail = await thumbnailResponse(request, absPath, { cacheControl: CATALOG_THUMBNAIL_CACHE_CONTROL });
    if (thumbnail) return thumbnail;
    return streamFileResponse(absPath, request, {
      contentType,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return Response.json({ error: error instanceof Error ? error.message : "Failed to serve catalog visual" }, { status });
  }
}
