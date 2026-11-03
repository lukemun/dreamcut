import path from "node:path";

import { MEDIA_CONTENT_TYPES } from "@/lib/local-store/media";
import { musicCatalogPreviewDir, resolveMusicCatalogFile } from "@/lib/local-store/music-catalog";
import { prepareCatalogAudioPreview } from "@/lib/local-store/catalog-audio-preview";
import { streamFileResponse } from "@/lib/local-store/stream-file";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { path: segments } = await params;
    const relativeFile = segments.map((segment) => decodeURIComponent(segment)).join(path.sep);
    let absPath = resolveMusicCatalogFile(relativeFile);
    if (new URL(request.url).searchParams.get("preview") === "1" && /\.(opus|ogg)$/i.test(absPath)) {
      absPath = await prepareCatalogAudioPreview(absPath, musicCatalogPreviewDir(relativeFile));
    }
    const contentType = MEDIA_CONTENT_TYPES[path.extname(absPath).toLowerCase()] ?? "application/octet-stream";
    return streamFileResponse(absPath, request, { contentType });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to serve catalog audio" },
      { status },
    );
  }
}
