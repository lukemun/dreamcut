import { NextResponse } from "next/server";
import { readPreviewSettings, writeAutomaticPreviewQuality, writePreviewSettings } from "@/lib/local-store/preview-settings";
import { prepareProjectPreviews, preparationDir, type PreparedMedia } from "@/lib/local-store/media-preparation";
import { PREVIEW_QUALITIES, type PreviewQuality } from "@/lib/preview-quality";
import { projectExists } from "@/lib/local-store/paths";
import { readJsonFile } from "@/lib/local-store/atomic-json";
import fs from "node:fs";
import path from "node:path";
export async function GET(request: Request) {
  try {
    const projectId = new URL(request.url).searchParams.get("project_id");
    if (!projectId || !projectExists(projectId)) throw new Error("Project not found");
    const settings = readPreviewSettings(projectId);
    const records: PreparedMedia[] = [];
    const dir = preparationDir(projectId);
    if (fs.existsSync(dir)) for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
      const record = readJsonFile<PreparedMedia | null>(path.join(dir, file), null);
      if (record) records.push(record);
    }
    // Report each preview's real state; a ready one made at another quality is stale, not preparing.
    return NextResponse.json({ ...settings, media: records.map(r => ({ source: r.source, state: r.state, stale: settings.known && r.state === "ready" && (r.preview_quality ?? "prepared") !== settings.quality, error: r.error, dimensions: r.preview_probe })) });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.project_id !== "string" || !projectExists(body.project_id)) throw new Error("Project not found");
    const known = (value: unknown): value is PreviewQuality => typeof value === "string" && Object.hasOwn(PREVIEW_QUALITIES, value);
    // `quality` is the creator's choice; `automatic` is the size the player needs, sent by the editor.
    if (!known(body.quality) && !(known(body.automatic) && body.automatic !== "prepared")) throw new Error("Unknown preview quality");
    const before = readPreviewSettings(body.project_id).quality;
    const settings = known(body.quality) ? writePreviewSettings(body.project_id, body.quality) : writeAutomaticPreviewQuality(body.project_id, body.automatic);
    // A choice is prepared again on request; an Automatic size only when the size it resolves to changed.
    const media = known(body.quality) || settings.quality !== before ? prepareProjectPreviews(body.project_id) : [];
    return NextResponse.json({ ...settings, queued: media.filter(r => r?.state === "preparing").length });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
