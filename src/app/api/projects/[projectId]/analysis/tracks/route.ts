import { NextResponse } from "next/server";
import { buildProjectMediaContextPack } from "@/lib/media-analysis/project-context";

type Params = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const pack = buildProjectMediaContextPack(projectId);
    const semanticDatasets = pack.contexts.flatMap((context) => {
      const datasets = Array.isArray(context.datasets) ? context.datasets : [];
      return datasets.filter((dataset) => dataset.kind === "anonymous_person_face_tracks");
    });
    return NextResponse.json({
      status: semanticDatasets.length > 0 ? "available" : "unavailable",
      reason: semanticDatasets.length > 0 ? null : "No active semantic-track dataset is attached to a project source.",
      tracks: semanticDatasets,
      assets: pack.assets,
      timeline_bindings: pack.timeline_bindings,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to read tracks" }, { status: 500 });
  }
}
