import { communityMediaSource } from "@/lib/effects/community-recipes";
import { communityMedia } from "@/lib/effects/community-media-cache";
import { streamFileResponse } from "@/lib/local-store/stream-file";

export const dynamic = "force-dynamic";

/**
 * Serves a published community example. The first request downloads it from DreamCut Cloud into the
 * local cache, and requests that arrive meanwhile (a video's parallel range requests) wait for that one
 * download; every later one (including video seeking) is served from disk.
 */
export async function GET(request: Request, { params }: { params: Promise<{ effect: string }> }) {
  const { effect } = await params;
  const source = await communityMediaSource(effect, new URL(request.url).searchParams.get("kind") ?? "video");
  if (!source) return new Response("Community example not found", { status: 404 });
  try {
    const saved = await communityMedia(source);
    if (!saved) return new Response("Community example unavailable", { status: 404 });
    return streamFileResponse(saved.file, request, { contentType: saved.contentType, headers: { "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Community example unavailable", { status: 404 });
  }
}
