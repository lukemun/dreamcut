import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { generationAssets, resolveGenerationSource } from "./asset-generation";
import { readImageCatalog, imageCatalogFileExists, resolveImageCatalogFile } from "./image-catalog";
import { readVisualCatalog, visualCatalogEntryAvailable, resolveVisualCatalogFile } from "./visual-catalog";
import { ensureVisualCatalogFile } from "./visual-catalog-cloud";
import { projectDir, projectMediaDir } from "./paths";
import { assertProject, withProjectLock } from "./store";
import { writeJsonFileAtomic } from "./atomic-json";
import { ingestMediaPath } from "./media-ingest";
import { listMediaFiles } from "./media";
import { resolveLibraryAudioSource } from "./library-rhythm";

/** Everything the creator has selected across the editor (clips, Library media, looks, layouts, sounds, templates),
 *  kept for the agent: `agent_text` is what the agent reads, `label` what the creator sees. */
export const selectionItemSchema = z.object({
  id: z.string().min(1).max(300), group: z.string().min(1).max(64), kind: z.string().min(1).max(64),
  label: z.string().min(1).max(300), agent_text: z.string().max(2000),
}).strict();
export type WorkspaceSelectionItem = z.infer<typeof selectionItemSchema>;
const schema = z.object({ source: z.string().nullable(), sources: z.array(z.string()).max(10000), selected_at: z.string(),
  items: z.array(selectionItemSchema).max(300).default([]) });
const file = (id: string) => path.join(projectDir(id), "workspace-selection.json");
export function readWorkspaceMediaSelection(id: string) {
  assertProject(id);
  if (!fs.existsSync(file(id))) return { source: null, sources: [], selected_at: "", items: [] };
  const value = JSON.parse(fs.readFileSync(file(id), "utf8"));
  return schema.parse({ ...value, sources: value.sources ?? (value.source ? [value.source] : []) });
}

/** Selection as agents read it: editor-wide items, plus any selected media no open panel described yet
 *  (for example a Storyboard pick made while no chat was open), so "this" always resolves. */
export function agentSelectionItems(id: string): WorkspaceSelectionItem[] {
  const { items, sources } = readWorkspaceMediaSelection(id);
  const described = (source: string) => items.some(item => item.id.endsWith(source) || item.agent_text.includes(`(${source})`));
  return [...items, ...sources.filter(source => !described(source)).flatMap(source => {
    try {
      const asset = resolveLibraryMedia(id, source), kind = asset.kind === "image" ? "Photo" : asset.kind === "audio" ? "Audio" : "Video";
      return [{ id: `media:${source}`, group: "media", kind, label: asset.name.slice(0, 300), agent_text: `${asset.catalog ? "Library" : "Project"} ${kind.toLowerCase()} "${asset.name}" (${source}).` }];
    } catch { return []; }
  })];
}

export function resolveLibraryMedia(id: string, source: string) {
  assertProject(id);
  if (source.startsWith("catalog:image:")) {
    const asset = readImageCatalog().images.find(a => `catalog:image:${a.id}` === source);
    if (!asset || !imageCatalogFileExists(asset.file)) throw new Error("Library image is unavailable.");
    return { source, name: asset.title, kind: "image" as const, file: resolveImageCatalogFile(asset.file), sha256: asset.sha256,
      url: `/api/image-catalog/media/${asset.file.split(/[\\/]/).map(encodeURIComponent).join("/")}`, catalog: true };
  }
  if (source.startsWith("catalog:visual:")) {
    const asset = readVisualCatalog().assets.find(a => `catalog:visual:${a.id}` === source);
    if (!asset || !visualCatalogEntryAvailable(asset)) throw new Error("Library media is unavailable.");
    return { source, name: asset.title, kind: asset.type === "still" ? "image" as const : "video" as const, file: resolveVisualCatalogFile(asset.file), sha256: asset.sha256,
      url: `/api/visual-catalog/media/${asset.file.split(/[\\/]/).map(encodeURIComponent).join("/")}`, catalog: true };
  }
  const asset = generationAssets(id).find(a => a.source === source)
    ?? listMediaFiles(id).filter(a => a.kind === "audio" || a.kind === "image" || a.kind === "video")
      .map(a => ({ source: a.relPath, name: a.name, kind: a.kind as "audio" | "image" | "video" })).find(a => a.source === source);
  if (!asset) throw new Error("Library media is unavailable.");
  return { source, name: asset.name, kind: asset.kind, file: resolveGenerationSource(id, source), sha256: undefined,
    url: `/api/projects/${encodeURIComponent(id)}/media/${source.split("/").map(encodeURIComponent).join("/")}`, catalog: false };
}

export function workspaceMediaSelectionContext(id: string) {
  const selection = readWorkspaceMediaSelection(id);
  return { ...selection, assets: selection.sources.map(source => {
    try { const { file: _file, sha256, ...asset } = resolveLibraryMedia(id, source); return { ...asset, sha256, available: true }; }
    catch { return { source, available: false }; }
  }), meaning: "Selected for discussion and explicit actions; selection does not place media, attach references or approve generation. `items` lists everything selected across the editor (timeline clips, Library media, looks, layouts, sounds, Templates) in the order chosen; act on them when the creator refers to \"this\", \"these\" or \"what I selected\". A Template item (id template:<…>) names the template to use: read its brief with capability_catalog get <id>." };
}

export async function updateWorkspaceMediaSelection(id: string, command: { action: "toggle"; source: string } | { action: "set"; sources: string[] }) {
  return withProjectLock(id, () => {
    const current = readWorkspaceMediaSelection(id);
    const sources = command.action === "set" ? [...new Set(command.sources)]
      : current.sources.includes(command.source) ? current.sources.filter(s => s !== command.source) : [...current.sources, command.source];
    if (command.action === "toggle" && !current.sources.includes(command.source)) resolveLibraryMedia(id, command.source);
    if (command.action === "set") sources.forEach(source => resolveLibraryMedia(id, source));
    const selection = schema.parse({ source: sources.at(-1) ?? null, sources, selected_at: new Date().toISOString(), items: current.items });
    writeJsonFileAtomic(file(id), selection);
    return selection;
  });
}

/** Replace the editor-wide selection list; Library media sources keep their own field. */
export async function setWorkspaceSelectionItems(id: string, items: WorkspaceSelectionItem[]) {
  return withProjectLock(id, () => {
    const current = readWorkspaceMediaSelection(id);
    const selection = schema.parse({ ...current, items, selected_at: new Date().toISOString() });
    writeJsonFileAtomic(file(id), selection);
    return selection;
  });
}

export async function prepareLibraryGenerationReference(id: string, source: string) {
  // A shared Library clip downloads from DreamCut Cloud before the project is locked for the copy.
  if (source.startsWith("catalog:visual:")) {
    const asset = readVisualCatalog().assets.find(a => `catalog:visual:${a.id}` === source);
    if (asset) await ensureVisualCatalogFile(asset.file);
  }
  return withProjectLock(id, () => {
    const asset = resolveLibraryMedia(id, source);
    if (asset.kind === "audio") throw new Error("Choose an image or video reference.");
    if (!asset.catalog) return { source: asset.source, name: asset.name };
    const imported = ingestMediaPath({ projectId: id, sourcePath: asset.file, storageMode: "managed_copy", expectedSourceSha256: asset.sha256 });
    return { source: imported.media_path, name: asset.name };
  });
}

/** Add a local/library audio file to project media without placing it on a timeline. */
export async function prepareLibraryAudioMedia(id: string, sourceUrl: string) {
  return withProjectLock(id, () => {
    const file = resolveLibraryAudioSource(id, sourceUrl);
    if (!file) throw new Error("Library audio is unavailable.");
    const existing = listMediaFiles(id).find(asset => asset.kind === "audio" && path.resolve(projectMediaDir(id), asset.relPath) === file);
    if (existing) return { source: existing.relPath, name: existing.name };
    const volume = fs.statfsSync(projectMediaDir(id));
    if (volume.bavail * volume.bsize < fs.statSync(file).size + 64 * 1024 * 1024) throw new Error("Not enough disk space to add this audio.");
    const imported = ingestMediaPath({ projectId: id, sourcePath: file, storageMode: "managed_copy" });
    return { source: imported.media_path, name: path.basename(file) };
  });
}
