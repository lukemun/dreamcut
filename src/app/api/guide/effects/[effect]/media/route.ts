import { resolveGuideEffectMedia } from "@/lib/effects/guide";
import { streamFileResponse } from "@/lib/local-store/stream-file";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ effect: string }> }) {
  const { effect } = await params;
  if (!/^FX-[A-Z0-9-]+$/.test(effect)) return new Response("Effect not found", { status: 404 });
  try {
    const media = resolveGuideEffectMedia(effect);
    if (!media) return new Response("Effect not found", { status: 404 });
    return streamFileResponse(media.file, request, {
      contentType: media.contentType, headers: { "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Effect media unavailable", { status: 404 });
  }
}
