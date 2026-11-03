import { NextResponse } from "next/server";
import { assertProject } from "@/lib/local-store/store";
import { readProjectSourceManifest } from "@/lib/local-store/media-ingest";
import { analyzeImportedVideo, listImportJobs, startImportWorker, updateImportJob } from "@/lib/local-store/media-import-jobs";

export const runtime = "nodejs";
type Params = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const jobs = listImportJobs(projectId);
    if (jobs.some(job => job.status === "queued" || job.status === "running")) startImportWorker(projectId);
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read import jobs" }, { status: 400 }); }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const body = await request.json();
    if (body.action === "analyze_video") {
      const asset = readProjectSourceManifest(projectId).assets.find(asset => asset.asset_id === body.id);
      if (!asset) throw new Error("Imported video not found");
      return NextResponse.json({ job: analyzeImportedVideo(projectId, asset) }, { status: 202 });
    }
    if (typeof body.id !== "string" || !["retry", "cancel"].includes(body.action)) throw new Error("Invalid job action");
    updateImportJob(projectId, body.id, body.action);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update import job" }, { status: 400 }); }
}
