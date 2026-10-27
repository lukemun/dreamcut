import { z } from "zod";
import { listVideoIdeas, saveVideoIdea } from "@/lib/local-store/video-ideas";
import { videoIdeaInputSchema } from "@/lib/video-ideas";

export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(listVideoIdeas(), { headers: { "Cache-Control": "private, no-store" } });
}
const bodySchema = z.object({ idea: videoIdeaInputSchema, existing: z.object({ id: z.string().uuid(), expected_revision: z.number().int().positive() }).strict().optional() }).strict();
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next may normalize request.url to localhost; Host retains the browser's address.
  if (origin) {
    let sameHost = false;
    try { const url = new URL(origin); sameHost = /^https?:$/.test(url.protocol) && url.host === (request.headers.get("host") ?? new URL(request.url).host); } catch { /* Reject malformed origins. */ }
    if (!sameHost) return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  }
  try {
    const body = bodySchema.parse(await request.json());
    return Response.json({ idea: saveVideoIdea(body.idea, body.existing) });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "Check the title, URLs, and field lengths." : error instanceof Error ? error.message : "Could not save idea" }, { status: (error as { status?: number }).status ?? 400 });
  }
}
