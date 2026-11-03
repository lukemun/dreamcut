import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertProject } from "./store";
import { projectDir } from "./paths";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { readProjectSourceManifest } from "./media-ingest";
import { readVideoDescription, verifyCatalogSource } from "./video-descriptions";
import { searchVideos } from "./video-search";

export const libraryPresentationInput = z.object({
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).default(""),
  items: z.array(z.object({
    project_id: z.string().min(1).max(128), asset_id: z.string().min(1).max(120),
    source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    time_seconds: z.number().finite().nonnegative().optional(),
  }).strict()).min(1).max(24),
}).strict();
const presentationSchema = libraryPresentationInput.extend({ id: z.string().uuid(), created_at: z.string().datetime(), expires_at: z.string().datetime() });
const file = (projectId: string) => path.join(projectDir(projectId), "preprocess", "library-presentation.json");
export function readLibraryPresentation(projectId: string) {
  assertProject(projectId);
  const value = readJsonFile<unknown>(file(projectId), null);
  if (!value) return null;
  const presentation = presentationSchema.parse(value);
  return Date.parse(presentation.expires_at) > Date.now() ? presentation : null;
}

function resolveItem(item: z.infer<typeof libraryPresentationInput>["items"][number]) {
  const asset = readProjectSourceManifest(item.project_id).assets.find(asset => asset.asset_id === item.asset_id);
  if (!asset || asset.source_sha256 !== item.source_sha256 || !/\.(mov|mp4|m4v|webm)$/i.test(asset.media_path)) throw new Error("Imported video handle is unavailable or changed");
  if (!verifyCatalogSource(item.project_id, asset.media_path, item.source_sha256)) throw new Error("Presented video source changed; reimport before using its descriptions");
  if (item.time_seconds === undefined) return null;
  const description = readVideoDescription(item.source_sha256);
  const frame = description?.frames.find(frame => Math.abs(frame.time_seconds - item.time_seconds!) <= 0.001);
  if (!frame) throw new Error("Present a verified sampled source timestamp from video_search");
  return frame;
}

/** Display handoff only: no source adoption, analysis, timeline or metadata writes. */
export function presentLibraryVideos(projectId: string, input: unknown) {
  assertProject(projectId);
  const data = libraryPresentationInput.parse(input);
  for (const item of data.items) resolveItem(item);
  const presentation = { ...data, id: randomUUID(), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString() };
  writeJsonFileAtomic(file(projectId), presentation);
  return { presentation, library_url: `/p/${encodeURIComponent(projectId)}/library?presentation=${presentation.id}`, state: "ready_in_library", timeline_changed: false };
}

export function resolveLibraryPresentation(projectId: string) {
  const presentation = readLibraryPresentation(projectId);
  if (!presentation) return { presentation: null, videos: [], warnings: [] };
  const valid: Array<{ item: z.infer<typeof libraryPresentationInput>["items"][number]; frame: ReturnType<typeof resolveItem> }> = [], warnings: string[] = [];
  for (const item of presentation.items) {
    try { valid.push({ item, frame: resolveItem(item) }); }
    catch (error) { warnings.push(error instanceof Error ? error.message : "Video unavailable"); }
  }
  const result = searchVideos({ query: "", sources: valid.map(entry => entry.item), limit: 24 });
  const videos = result.videos.map(video => {
    const frames = [...new Map(valid.filter(entry => entry.item.source_sha256 === video.source_sha256 && entry.frame).map(entry => [entry.frame!.id, entry.frame!])).values()];
    return { ...video, matching_frames: frames, matching_frame_count: frames.length };
  }).sort((a, b) => presentation.items.findIndex(item => item.source_sha256 === a.source_sha256) - presentation.items.findIndex(item => item.source_sha256 === b.source_sha256));
  return { presentation, videos, warnings: [...warnings, ...result.warnings.map(warning => warning.reason)] };
}

export function dismissLibraryPresentation(projectId: string, id: string) {
  const current = readLibraryPresentation(projectId);
  if (current && current.id !== id) throw new Error("New Library results arrived; review them before dismissing");
  writeJsonFileAtomic(file(projectId), null);
}
