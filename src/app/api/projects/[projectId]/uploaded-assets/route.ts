import fs from "node:fs";

import { NextResponse } from "next/server";

import { localRequestRefusal } from "@/lib/local-request";
import { commitMediaUpload, importedMediaUrl, ingestMediaBuffer, receiveMediaUpload } from "@/lib/local-store/media-ingest";
import { assertProject, withProjectLock } from "@/lib/local-store/store";
import { enqueueImportJob } from "@/lib/local-store/media-import-jobs";
import { UPLOAD_ASSET_TYPE_HEADER, UPLOAD_FILENAME_HEADER } from "@/lib/media/upload-library-media";

type Params = { params: Promise<{ projectId: string }> };

const ASSET_TYPES = new Set(["still", "video_clip", "music", "sfx"]);

/** Uploads are managed imports: bytes are copied into project media and recorded
 *  in source-manifest.json. Browser uploads cannot expose their original path.
 *  The editor sends the file itself as the body (name and type in headers), which streams to disk at any size;
 *  multipart form uploads remain accepted for small files and older clients. */
export async function POST(request: Request, { params }: Params) {
  // src/proxy.ts skips this route so large uploads arrive whole; apply its check here.
  const refusal = localRequestRefusal(request, true);
  if (refusal) return NextResponse.json({ error: "forbidden", message: refusal }, { status: 403 });
  try {
    const { projectId } = await params;
    assertProject(projectId);

    let filename: string, assetType: string;
    let ingest: () => Promise<Parameters<typeof importedMediaUrl>[1]>;
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      assetType = String(formData.get("asset_type") ?? "");
      if (!(file instanceof File) || !ASSET_TYPES.has(assetType)) {
        return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
      }
      filename = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      ingest = () => withProjectLock(projectId, () => ingestMediaBuffer({
        projectId,
        buffer,
        originalFilename: filename,
        destinationDir: assetType === "sfx" ? "sfx" : "sources",
      }));
    } else {
      assetType = request.headers.get(UPLOAD_ASSET_TYPE_HEADER) ?? "";
      try { filename = decodeURIComponent(request.headers.get(UPLOAD_FILENAME_HEADER) ?? ""); } catch { filename = ""; }
      if (!request.body || !filename || !ASSET_TYPES.has(assetType)) {
        return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
      }
      const length = Number(request.headers.get("content-length"));
      const received = await receiveMediaUpload({
        projectId,
        stream: request.body,
        originalFilename: filename,
        destinationDir: assetType === "sfx" ? "sfx" : "sources",
        ...(Number.isSafeInteger(length) && length > 0 ? { expectedBytes: length } : {}),
      });
      // The temporary file is gone after a commit; this also covers a lock that never opened.
      ingest = () => withProjectLock(projectId, () => commitMediaUpload(received)).finally(() => fs.rmSync(received.temporaryPath, { force: true }));
    }

    const asset = await ingest();
    let processing;
    try { processing = enqueueImportJob(projectId, asset); }
    catch (error) { processing = { status: "failed", error: error instanceof Error ? error.message : "Could not queue processing" }; }
    return NextResponse.json({
      ok: true,
      processing,
      asset: {
        kind: assetType === "music" || assetType === "sfx" ? assetType : "visual",
        source_url: importedMediaUrl(projectId, asset),
        original_filename: filename,
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
