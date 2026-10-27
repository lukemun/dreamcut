import { profileDir } from "@/lib/local-store/editing-memory";
import { resolveUserEffectMedia } from "@/lib/local-store/user-effect-recipes";
import { streamFileResponse } from "@/lib/local-store/stream-file";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ effect: string }> }) {
  const { effect } = await params;
  try {
    const query = new URL(request.url).searchParams;
    const supplied = query.get("supplied");
    const kind = supplied !== null && /^\d$/.test(supplied) ? { supplied: Number(supplied) }
      : query.get("full") === "1" ? "full" : query.get("result") === "1" ? "result" : query.get("poster") === "1" ? "poster" : "reference";
    const media = resolveUserEffectMedia(effect, profileDir(), kind);
    if (!media) return new Response("User effect example not found", { status: 404 });
    return streamFileResponse(media.file, request, {
      contentType: media.contentType,
      headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch { return new Response("User effect example unavailable", { status: 404 }); }
}
