import { NextResponse } from "next/server";

import { enqueueAssets, listJobs, readManifest, reconcileAssetBindings, requestCancellation } from "@/lib/local-store/media-analysis";
import { readMetadata, writeMetadata } from "@/lib/local-store/store";
import { assetAnalysisState } from "@/lib/media-analysis/cache-budget";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const metadata = readMetadata(projectId);
    let bindings = reconcileAssetBindings(projectId);
    if (metadata.media_preprocessing_enabled === true) {
      const unscheduled = bindings.assets.filter((asset) => asset.current_job_id == null).map((asset) => asset.asset_id);
      if (unscheduled.length > 0) {
        enqueueAssets(projectId, unscheduled);
        bindings = reconcileAssetBindings(projectId);
      }
    }
    const jobs = listJobs(projectId);
    return NextResponse.json({
      enabled: metadata.media_preprocessing_enabled === true,
      assets: bindings.assets.map((asset) => {
        const job = asset.current_job_id ? jobs.find((candidate) => candidate.job_id === asset.current_job_id) ?? null : null;
        const manifest = asset.fingerprint_sha256 ? readManifest(asset.fingerprint_sha256) : null;
        return { ...asset, state: assetAnalysisState(asset, job, manifest), job, manifest };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to read analysis assets" }, { status: (error as Error & { status?: number }).status ?? 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json() as { enabled?: unknown };
    const metadata = readMetadata(projectId);
    const enabled = body.enabled === true;
    const next = { ...metadata, media_preprocessing_enabled: enabled };
    writeMetadata(projectId, next, "set_media_preprocessing_enabled");
    const jobs = enabled && metadata.media_preprocessing_enabled !== true
      ? enqueueAssets(projectId)
      : !enabled
        ? listJobs(projectId)
          .filter((job) => job.status === "queued" || job.status === "running")
          .map((job) => requestCancellation(job.job_id))
        : [];
    return NextResponse.json({ enabled: next.media_preprocessing_enabled, jobs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update preprocessing" }, { status: 400 });
  }
}
