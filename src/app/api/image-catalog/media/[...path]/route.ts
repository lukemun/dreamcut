import path from "node:path";

import { resolveImageCatalogFile } from "@/lib/local-store/image-catalog";
import { MEDIA_CONTENT_TYPES } from "@/lib/local-store/media";
import { streamFileResponse } from "@/lib/local-store/stream-file";
import { CATALOG_THUMBNAIL_CACHE_CONTROL, thumbnailResponse } from "@/lib/local-store/media-thumbnails";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { path: segments } = await params;
    const relativeFile = segments.map((segment) => decodeURIComponent(segment)).join(path.sep);
    const absPath = resolveImageCatalogFile(relativeFile);
    const contentType = MEDIA_CONTENT_TYPES[path.extname(absPath).toLowerCase()] ?? "application/octet-stream";
    const thumbnail = await thumbnailResponse(request, absPath, { cacheControl: CATALOG_THUMBNAIL_CACHE_CONTROL });
    if (thumbnail) return thumbnail;
    return streamFileResponse(absPath, request, { contentType });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return Response.json({ error: error instanceof Error ? error.message : "Failed to serve catalog image" }, { status });
  }
}
