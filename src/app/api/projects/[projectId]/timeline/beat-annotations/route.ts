import path from "node:path";
import { readTimeline } from "@/lib/local-store/store";
import { projectDir, projectExists } from "@/lib/local-store/paths";
import { resolveWaveformSource } from "@/lib/local-store/prepare-waveform";
import { readBeatAnnotation, prepareBeatAnnotation } from "@/lib/local-store/beat-annotations";
import { readRhythmReview, withRhythmReview } from "@/lib/local-store/library-rhythm";
import { readInstrumentAnalysis } from "@/lib/local-store/instrument-analysis";
import { instrumentAnnotation } from "@/lib/timeline/instrument-analysis";
import { projectBeatAnnotation } from "@/lib/timeline/beat-annotations";
import { WAVEFORM_SUPPORTED_TYPES } from "@/lib/timeline/media";

type Context = { params: Promise<{ projectId: string }> };
async function handle(request: Request, context: Context, prepare: boolean) {
  try {
    const { projectId } = await context.params;
    if (!projectExists(projectId)) return Response.json({ error: "Project not found" }, { status: 404 });
    const elementId = new URL(request.url).searchParams.get("element_id");
    const element = readTimeline(projectId).elements.find(e => e.id === elementId && !e.removed_at);
    if (!element?.source_url || !WAVEFORM_SUPPORTED_TYPES.has(element.type)) return Response.json({ error: "Choose a clip with audio" }, { status: 400 });
    const source = resolveWaveformSource(projectId, element.source_url);
    if (!source) return Response.json({ error: "Beat annotation requires a local source" }, { status: 400 });
    const directory = path.join(projectDir(projectId), "analysis", "beats");
    const detected = await (prepare ? prepareBeatAnnotation : readBeatAnnotation)(source, directory);
    const instruments = readInstrumentAnalysis(projectId, source);
    const annotation = instruments.state === "ready" && instruments.result
      ? instrumentAnnotation(detected ?? { schema_version: 2, source_sha256: instruments.result.source_sha256, recipe: `htdemucs-${instruments.key}`, analyzed_at: "", source_duration_seconds: instruments.result.duration, tempo_bpm: 0, tempo_confirmed: false, beats_seconds: [], downbeats: "unknown", hits: [] }, instruments.result, instruments.settings)
      : detected ? withRhythmReview(detected, (await readRhythmReview(directory, detected))?.review.hits ?? null) : null;
    const current = readTimeline(projectId).elements.find(e => e.id === elementId && !e.removed_at);
    if (!current || current.source_url !== element.source_url) return Response.json({ error: "Clip source changed; refresh and retry" }, { status: 409 });
    return Response.json({ annotation, beats: annotation ? projectBeatAnnotation(current, annotation) : [], element_id: current.id, instrument_marks_active: instruments.state === "ready" && !!instruments.result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Beat annotation failed" }, { status: 422 });
  }
}
export const GET = (request: Request, context: Context) => handle(request, context, false);
export const POST = (request: Request, context: Context) => handle(request, context, true);
