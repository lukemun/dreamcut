import { NextResponse } from "next/server";

import { importedMediaUrl, ingestMediaBuffer } from "@/lib/local-store/media-ingest";
import { assertProject, withProjectLock } from "@/lib/local-store/store";
import { enqueueImportJob } from "@/lib/local-store/media-import-jobs";

type Params = { params: Promise<{ projectId: string }> };

const ASSET_TYPES = new Set(["still", "video_clip", "music", "sfx"]);

/** Uploads are managed imports: bytes are copied into project media and recorded
 *  in source-manifest.json. Browser uploads cannot expose their original path. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);

    const formData = await request.formData();
    const file = formData.get("file");
    const assetType = String(formData.get("asset_type") ?? "");
    if (!(file instanceof File) || !ASSET_TYPES.has(assetType)) {
      return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await withProjectLock(projectId, () => ingestMediaBuffer({
      projectId: projectId,
      buffer,
      originalFilename: file.name,
      destinationDir: assetType === "sfx" ? "sfx" : "sources",
    }));
    let processing;
    try { processing = enqueueImportJob(projectId, asset); }
    catch (error) { processing = { status: "failed", error: error instanceof Error ? error.message : "Could not queue processing" }; }
    return NextResponse.json({
      ok: true,
      processing,
      asset: {
        kind: assetType === "music" || assetType === "sfx" ? assetType : "visual",
        source_url: importedMediaUrl(projectId, asset),
        original_filename: file.name,
        asset_id: asset.asset_id,
        storage_mode: asset.storage_mode,
      },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status },
    );
  }
}
