import { readPreparation } from "./media-preparation";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { generationAssets } from "./asset-generation";
import { readProjectSourceManifest } from "./media-ingest";
import { readSfxCatalog } from "./sfx-catalog";
import { readSourceNotes } from "./source-notes";
import { readPeaks } from "./store";
import { listMediaFiles, mediaUrl } from "./media";
import { projectDir } from "./paths";
import { assertProject, withProjectLock } from "./store";
import { writeJsonFileAtomic } from "./atomic-json";
import { readWorkspaceMediaSelection, updateWorkspaceMediaSelection } from "./workspace-media-selection";
import { emptyStoryboard, storyboardContentSchema, validateStoryboardAssets, type StoryboardAsset, type StoryboardSnapshot } from "../storyboard/model";

const recordSchema = z.object({ schema_version: z.literal(1), revision: z.number().int().nonnegative(), content: storyboardContentSchema,
  past: z.array(storyboardContentSchema).max(50), future: z.array(storyboardContentSchema).max(50) }).passthrough();
const file = (id: string) => path.join(projectDir(id), "storyboard.json");
function readRecord(id: string) {
  assertProject(id);
  if (!fs.existsSync(file(id))) return { schema_version: 1 as const, revision: 0, content: emptyStoryboard(), past: [], future: [] };
  const raw = JSON.parse(fs.readFileSync(file(id), "utf8"));
  // Library contract: a newer storyboard is never reinterpreted or rewritten in an older shape.
  if (typeof raw?.schema_version === "number" && raw.schema_version > 1) {
    throw Object.assign(new Error(`This storyboard was saved by a newer DreamCut (version ${raw.schema_version}). Update DreamCut to open it.`), { status: 409 });
  }
  return recordSchema.parse(raw);
}
export function readStoryboard(id: string): StoryboardSnapshot {
  const record = readRecord(id);
  const selection = readWorkspaceMediaSelection(id);
  return { revision: record.revision, content: record.content, canUndo: !!record.past.length, canRedo: !!record.future.length, selection };
}
export function storyboardAssets(id: string): StoryboardAsset[] {
  const manifest = readProjectSourceManifest(id);
  const visuals: StoryboardAsset[] = generationAssets(id).map(a => ({ source: a.source, name: a.name, kind: a.kind,
    assetId: manifest.assets.find(s => s.media_path === a.source)?.asset_id, sourceHash: manifest.assets.find(s => s.media_path === a.source)?.source_sha256, url: mediaUrl(id, a.source), preview: a.preview, duration: a.duration,
    ready: a.kind === "image" || a.preparation === "ready", generated: !!a.jobId || a.source.startsWith("generated/"),
    importedAt: manifest.assets.find(s => s.media_path === a.source)?.imported_at,
    error: a.preparation === "failed" ? "Preview preparation failed. Retry preparation." : undefined,
  }));
  const peaks = readPeaks(id);
  const catalogHashes = new Set(readSfxCatalog().sound_effects.flatMap(entry => entry.sha256 ? [entry.sha256] : []));
  const audio: StoryboardAsset[] = listMediaFiles(id).filter(f => f.kind === "audio").flatMap(f => {
    const asset = manifest.assets.find(a => a.media_path === f.relPath);
    if (!asset) return [];
    const notes = readSourceNotes(id, asset.asset_id);
    return [{ source: f.relPath, assetId: asset.asset_id, cataloged: catalogHashes.has(asset.source_sha256), name: notes.title || f.name, kind: "audio", url: f.url, duration: f.durationSeconds ?? peaks[f.url]?.source_duration_seconds, ready: true, generated: false, importedAt: asset.imported_at }];
  });
  return [...visuals.map(asset => {
    if (asset.kind !== "video") return asset;
    const prep = readPreparation(id, asset.source), browse = prep?.browse_preview;
    return { ...asset, previewReady: asset.ready || !!browse, preparationState: prep?.state, preparationStage: prep?.stage,
      ...(!asset.ready && browse ? { preview: mediaUrl(id, browse.preview), duration: browse.duration } : {}) };
  }), ...audio];
}
export async function selectWorkspaceMedia(id: string, source: string | string[] | null) {
  return updateWorkspaceMediaSelection(id, { action: "set", sources: Array.isArray(source) ? source : source ? [source] : [] });
}
export const storyboardWriteSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), revision: z.number().int().nonnegative(), content: storyboardContentSchema }).strict(),
  z.object({ action: z.enum(["undo", "redo"]), revision: z.number().int().nonnegative() }).strict(),
]);
export async function updateStoryboard(id: string, input: unknown) {
  const command = storyboardWriteSchema.parse(input);
  return withProjectLock(id, () => {
    const current = readRecord(id);
    if (current.revision !== command.revision) throw Object.assign(new Error("Storyboard changed in another window. Reload before editing."), { status: 409 });
    let next = { ...current, revision: current.revision + 1 };
    if (command.action === "save") {
      validateStoryboardAssets(command.content, storyboardAssets(id));
      next = { ...next, content: command.content, past: [...current.past, current.content].slice(-50), future: [] };
    } else if (command.action === "undo") {
      if (!current.past.length) throw new Error("Nothing to undo");
      next = { ...next, content: current.past.at(-1)!, past: current.past.slice(0, -1), future: [...current.future, current.content].slice(-50) };
    } else {
      if (!current.future.length) throw new Error("Nothing to redo");
      next = { ...next, content: current.future.at(-1)!, future: current.future.slice(0, -1), past: [...current.past, current.content].slice(-50) };
    }
    writeJsonFileAtomic(file(id), next, value => { recordSchema.parse(value); });
    return readStoryboard(id);
  });
}
