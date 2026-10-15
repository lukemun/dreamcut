import { NextResponse } from "next/server";
import { readPreviewSettings, writePreviewSettings } from "@/lib/local-store/preview-settings";
import { prepareProjectPreviews, preparationDir, type PreparedMedia } from "@/lib/local-store/media-preparation";
import { PREVIEW_QUALITIES, type PreviewQuality } from "@/lib/preview-quality";
import { projectExists } from "@/lib/local-store/paths";
import { readJsonFile } from "@/lib/local-store/atomic-json";
import fs from "node:fs";
import path from "node:path";
export async function GET(request: Request) {
  try {
    const projectId = new URL(request.url).searchParams.get("project_id");
    const settings = readPreviewSettings();
    const records: PreparedMedia[] = [];
    if (projectId && projectExists(projectId)) {
      const dir = preparationDir(projectId);
      if (fs.existsSync(dir)) for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
        const record = readJsonFile<PreparedMedia | null>(path.join(dir, file), null);
        if (record) records.push(record);
      }
    }
    return NextResponse.json({ ...settings, media: records.map(r => ({ source: r.source, state: (r.preview_quality ?? "prepared") === settings.quality ? r.state : "needs_preparation", error: r.error, dimensions: r.preview_probe })) });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.quality !== "string" || !Object.hasOwn(PREVIEW_QUALITIES, body.quality)) throw new Error("Unknown preview quality");
    if (typeof body.project_id !== "string" || !projectExists(body.project_id)) throw new Error("Project not found");
    const settings = writePreviewSettings(body.quality as PreviewQuality);
    const media = prepareProjectPreviews(body.project_id);
    return NextResponse.json({ ...settings, queued: media.filter(r => r?.state === "preparing").length });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
