import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
import { readStoryboard } from "@/lib/local-store/storyboard";
import { beatRecastJobs, generateRecastBeats, quoteRecastBeats, referenceShotBeats, useRecastResult } from "@/lib/local-store/storyboard-recast";
type Context = { params: Promise<{ projectId: string }> };

/** Each reference beat's recast generations, with status and results. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const beats = readStoryboard(projectId).content.reference?.beats ?? [];
    return NextResponse.json({ beats: Object.fromEntries(beats.filter(b => b.recast?.jobs.length).map(b => [b.id, beatRecastJobs(projectId, b)])) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot load recasts" }, { status: 400 }); }
}

/**
 * quote: per-beat prices (free). cuts: beats from the reference's shot cuts (read-only).
 * generate: the creator's Generate click with the prices they saw. use: choose a result as the beat's footage.
 */
export async function POST(request: Request, { params }: Context) {
  try {
    assertGenerationOrigin(request);
    const { projectId } = await params;
    const { action, ...input } = await request.json();
    if (action === "quote") return NextResponse.json(await quoteRecastBeats(projectId, Array.isArray(input.beat_ids) ? input.beat_ids : undefined));
    if (action === "cuts") {
      if (typeof input.source !== "string") throw new Error("Choose the reference video.");
      return NextResponse.json(await referenceShotBeats(projectId, input.source, { maxSeconds: typeof input.max_seconds === "number" ? input.max_seconds : 15 }));
    }
    if (action === "generate") return NextResponse.json(await generateRecastBeats(projectId, input));
    if (action === "use") return NextResponse.json(await useRecastResult(projectId, input));
    throw new Error("Unknown recast action.");
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "request"}: ${i.message}`).join("; ") }, { status: 422 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recast failed" }, { status: (error as { status?: number }).status ?? 400 });
  }
}
