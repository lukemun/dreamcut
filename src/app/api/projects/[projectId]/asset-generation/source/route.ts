import { resolveGenerationSource, probeGenerationSource, probeMediaDuration } from "@/lib/local-store/asset-generation";
import { enqueueMediaPreparation } from "@/lib/local-store/media-preparation";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
type Params = { params: Promise<{ projectId: string }> };
export async function POST(request: Request, { params }: Params) {
  try {
    assertGenerationOrigin(request); const { projectId } = await params;
    const { source, lengthOnly } = await request.json();
    // A reference's time range needs only its length; audio has no frames to list.
    if (lengthOnly === true && typeof source === "string") return Response.json({ duration: await probeMediaDuration(resolveGenerationSource(projectId, source)) });
    if (typeof source !== "string" || !/\.(mp4|mov|webm|m4v)$/i.test(source)) throw new Error("Choose a video.");
    const file = resolveGenerationSource(projectId, source);
    enqueueMediaPreparation(projectId, source, true);
    const probe = await probeGenerationSource(file, true);
    if (probe.times.length > 100000) throw new Error("Choose a shorter video (under 100,000 frames).");
    return Response.json(probe);
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
