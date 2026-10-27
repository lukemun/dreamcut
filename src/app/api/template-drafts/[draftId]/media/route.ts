import { resolveTemplateDraftMedia } from "@/lib/local-store/template-drafts";
import { streamFileResponse } from "@/lib/local-store/stream-file";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const media = resolveTemplateDraftMedia((await params).draftId);
    if (!media) return new Response("Draft video not found", { status: 404 });
    return streamFileResponse(media.file, request, {
      contentType: media.contentType,
      headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch { return new Response("Draft video not found", { status: 404 }); }
}
