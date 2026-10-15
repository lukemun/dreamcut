import path from "node:path";

import { MEDIA_CONTENT_TYPES, resolveMediaPath } from "@/lib/local-store/media";
import { assertProject } from "@/lib/local-store/store";
import { streamFileResponse } from "@/lib/local-store/stream-file";
import { MUTABLE_THUMBNAIL_CACHE_CONTROL, thumbnailResponse } from "@/lib/local-store/media-thumbnails";

type Params = { params: Promise<{ projectId: string; path: string[] }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId, path: segments } = await params;
    assertProject(projectId);
    const decoded = segments.map((segment) => decodeURIComponent(segment));
    const absPath = resolveMediaPath(projectId, decoded);
    if (!absPath) {
      return Response.json({ error: "Invalid media path" }, { status: 400 });
    }
    const ext = path.extname(absPath).toLowerCase();
    const contentType = MEDIA_CONTENT_TYPES[ext] ?? "application/octet-stream";
    const thumbnail = await thumbnailResponse(request, absPath, { cacheControl: MUTABLE_THUMBNAIL_CACHE_CONTROL });
    if (thumbnail) return thumbnail;
    return streamFileResponse(absPath, request, {
      contentType,
      // Remotion's headless bundle is served from its own local origin. Media
      // remains project-scoped by the path validator above, but must be readable
      // by that renderer for canvas/WebGL effects and video decoding.
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to serve media" },
      { status },
    );
  }
}
