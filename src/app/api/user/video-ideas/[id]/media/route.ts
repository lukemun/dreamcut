import { resolveVideoIdeaMedia } from "@/lib/local-store/video-ideas";
import { streamFileResponse } from "@/lib/local-store/stream-file";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const kind = new URL(request.url).searchParams.get("kind") ?? "reference";
  if (kind !== "reference" && kind !== "poster") return new Response("Unknown media", { status: 404 });
  const media = resolveVideoIdeaMedia((await params).id, kind);
  return media ? streamFileResponse(media.file, request, { contentType: media.contentType, headers: { "X-Content-Type-Options": "nosniff" } }) : new Response("Reference unavailable", { status: 404 });
}
