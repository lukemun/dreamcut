import { communityMediaSource } from "@/lib/effects/community-recipes";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = /^(video\/mp4|image\/(webp|jpeg|png))$/;

/** Streams a published community example from DreamCut Cloud, forwarding byte ranges for video seeking. */
export async function GET(request: Request, { params }: { params: Promise<{ effect: string }> }) {
  const { effect } = await params;
  const source = await communityMediaSource(effect, new URL(request.url).searchParams.get("kind") ?? "video");
  if (!source) return new Response("Community example not found", { status: 404 });
  try {
    const range = request.headers.get("range");
    const upstream = await fetch(source, {
      headers: range ? { range } : {}, cache: "no-store", redirect: "error", signal: request.signal,
    });
    const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!upstream.ok || !upstream.body || !ALLOWED_TYPES.test(contentType)) {
      await upstream.body?.cancel();
      return new Response("Community example unavailable", { status: 404 });
    }
    const headers = new Headers({ "Content-Type": contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=600" });
    for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response("Community example unavailable", { status: 404 });
  }
}
