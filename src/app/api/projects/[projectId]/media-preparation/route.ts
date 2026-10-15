import { NextResponse } from "next/server";
import { enqueueMediaPreparation } from "@/lib/local-store/media-preparation";
import fs from "node:fs";
import path from "node:path";
import { ingestMediaPath } from "@/lib/local-store/media-ingest";
import { readVisualCatalog, resolveVisualCatalogFile, visualCatalogMediaRoot } from "@/lib/local-store/visual-catalog";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    if (typeof body.catalog_visual_id === "string") {
      const asset = readVisualCatalog().assets.find(asset => asset.id === body.catalog_visual_id);
      if (!asset || asset.type !== "video_clip") return NextResponse.json({ error: "Catalog video not found" }, { status: 404 });
      const sourcePath = resolveVisualCatalogFile(asset.file);
      const realRoot = fs.realpathSync(visualCatalogMediaRoot(asset.file));
      if (!fs.realpathSync(sourcePath).startsWith(realRoot + path.sep)) throw new Error("Catalog source must stay inside its media directory");
      const imported = ingestMediaPath({ projectId: projectId, sourcePath, storageMode: "managed_copy", expectedSourceSha256: asset.sha256 });
      const preparation = enqueueMediaPreparation(projectId, imported.media_path, true);
      return NextResponse.json({ preparation }, { status: 202 });
    }
    if (typeof body.source !== "string") return NextResponse.json({ error: "Source is required" }, { status: 400 });
    const preparation = enqueueMediaPreparation(projectId, body.source, true);
    if (!preparation) return NextResponse.json({ error: "Source must be a video" }, { status: 400 });
    return NextResponse.json({ preparation }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
