import path from "node:path";
import { z } from "zod";
import { projectDir, projectExists } from "@/lib/local-store/paths";
import { readBeatAnnotation, prepareBeatAnnotation } from "@/lib/local-store/beat-annotations";
import { readRhythmReview, resolveLibraryAudioSource, withRhythmReview, writeRhythmReview } from "@/lib/local-store/library-rhythm";
import { musicalHitKindSchema } from "@/lib/timeline/beat-annotations";
import { withProjectLock } from "@/lib/local-store/store";

type Context = { params: Promise<{ projectId: string }> };
const bodySchema = z.object({ source_url: z.string().max(3000) });
const saveSchema = bodySchema.extend({
  expected_revision: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  hits: z.array(z.object({
    time_seconds: z.number().finite().nonnegative(),
    kind: musicalHitKindSchema,
    confidence: z.number().finite().min(0).max(1),
    strength: z.number().finite().min(0).max(1),
  })).max(200000),
});
function response(annotation: Awaited<ReturnType<typeof readBeatAnnotation>>, review: Awaited<ReturnType<typeof readRhythmReview>>) {
  return Response.json({ annotation: annotation ? withRhythmReview(annotation, review?.review.hits ?? null) : null, detected_annotation: annotation, review_revision: review?.revision ?? null, reviewed: Boolean(review) }, { headers: { "Cache-Control": "no-store" } });
}
async function sourceAndDirectory(projectId: string, sourceUrl: string) {
  if (!projectExists(projectId)) throw new Error("Project not found");
  const source = resolveLibraryAudioSource(projectId, sourceUrl);
  if (!source) throw new Error("Select an available Library audio track");
  return { source, directory: path.join(projectDir(projectId), "analysis", "beats") };
}
export async function GET(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const { source, directory } = await sourceAndDirectory(projectId, new URL(request.url).searchParams.get("source_url") ?? "");
    const annotation = await readBeatAnnotation(source, directory);
    return response(annotation, annotation ? await readRhythmReview(directory, annotation) : null);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not read rhythm analysis" }, { status: 400 }); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const { source_url } = bodySchema.parse(await request.json());
    const { source, directory } = await sourceAndDirectory(projectId, source_url);
    const annotation = await prepareBeatAnnotation(source, directory);
    return response(annotation, await readRhythmReview(directory, annotation));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not analyze rhythm" }, { status: 422 }); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = saveSchema.parse(await request.json());
    return await withProjectLock(projectId, async () => {
      const { source, directory } = await sourceAndDirectory(projectId, body.source_url);
      const annotation = await readBeatAnnotation(source, directory);
      if (!annotation) return Response.json({ error: "Analyze the track first" }, { status: 409 });
      const review = await writeRhythmReview(directory, annotation, body.hits, body.expected_revision);
      return response(annotation, review);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save rhythm review";
    return Response.json({ error: message }, { status: message.includes("changed elsewhere") ? 409 : 422 });
  }
}
