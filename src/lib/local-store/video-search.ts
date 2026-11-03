import { listProjectIds } from "./paths";
import { readProjectSourceManifest } from "./media-ingest";
import { readLibraryAnnotations, type LibraryAssetAnnotation } from "./library-annotations";
import { readMetadata } from "./store";
import { listImportJobs } from "./media-import-jobs";
import { readPreparation } from "./media-preparation";
import { videoCatalogDescription } from "./video-descriptions";
import { videoSearchQuery, videoSearchTextMatches, matchingVideoFrames } from "../media-analysis/video-descriptions";

/** Read-only projection of canonical source descriptions. No flattened/truncated index. */
export function searchVideos(options: { projectId?: string; query: string; offset?: number; limit?: number; sources?: Array<{ project_id: string; asset_id: string }> }) {
  const { terms, position } = videoSearchQuery(options.query);
  const offset = options.offset ?? 0, limit = options.limit ?? 50;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100 || options.query.length > 500) throw new Error("Invalid video search bounds");
  const sources = new Map<string, {
    slot_id: string; name: string; type: "video_clip"; source_url: string | null; project_id: string; project_title: string;
    processing_status: string | null; processing_error: string | null; asset_id: string; media_path: string; source_sha256: string; original_filename: string; duration_seconds: number | null;
    video_description: ReturnType<typeof videoCatalogDescription>; library_annotation: LibraryAssetAnnotation | null;
    matching_frames: ReturnType<typeof matchingVideoFrames>; matching_frame_count: number;
    projects: Array<{ id: string; title: string; media_path: string }>;
  }>();
  const warnings: Array<{ project_id: string; reason: string }> = [];
  for (const projectId of options.projectId ? [options.projectId] : options.sources ? [...new Set(options.sources.map(source => source.project_id))] : listProjectIds()) {
    try {
      const manifest = readProjectSourceManifest(projectId);
      const annotations = readLibraryAnnotations(projectId);
      const title = readMetadata(projectId).title ?? projectId;
      const jobs = new Map(listImportJobs(projectId).map(job => [job.asset_id, job]));
      for (const asset of manifest.assets) {
        if (options.sources && !options.sources.some(source => source.project_id === projectId && source.asset_id === asset.asset_id)) continue;
        if (!/\.(mov|mp4|m4v|webm)$/i.test(asset.media_path)) continue;
        const annotation = annotations?.assets[asset.media_path] ?? null;
        const description = videoCatalogDescription(projectId, asset.media_path, asset.source_sha256);
        const matches = matchingVideoFrames(description.frames, options.query, description.duration_seconds ?? undefined);
        // Context boilerplate and negative use instructions are deliberately not
        // subject evidence. Otherwise every trip asset falsely matches "cat".
        const text = [asset.original_filename, annotation?.display_name, annotation?.meaning, ...(annotation?.tags ?? []), description.summary, ...description.tags].join(" ").toLocaleLowerCase();
        if (position ? !matches.length : terms.length && !videoSearchTextMatches(text, terms) && !matches.length) continue;
        const key = description.status === "stale" || description.status === "failed" ? `${asset.source_sha256}:${projectId}:${asset.asset_id}` : asset.source_sha256;
        const prior = sources.get(key);
        if (prior) { prior.projects.push({ id: projectId, title, media_path: asset.media_path }); continue; }
        const preparation = readPreparation(projectId, asset.media_path);
        const preview = preparation?.state === "ready" ? preparation.preview : null;
        const url = (file: string) => `/api/projects/${encodeURIComponent(projectId)}/media/${file.split("/").map(encodeURIComponent).join("/")}`;
        sources.set(key, {
          slot_id: `search:${key}`, name: asset.original_filename, original_filename: asset.original_filename,
          type: "video_clip", source_url: preview ? url(preview) : null, project_id: projectId, project_title: title,
          processing_status: jobs.get(asset.asset_id)?.status ?? null, processing_error: jobs.get(asset.asset_id)?.error ?? null,
          asset_id: asset.asset_id, media_path: asset.media_path, source_sha256: asset.source_sha256, duration_seconds: preparation?.duration ?? null,
          library_annotation: annotation,
          video_description: { ...description, frames: [] },
          matching_frames: matches.slice(0, 12), matching_frame_count: matches.length,
          projects: [{ id: projectId, title, media_path: asset.media_path }],
        });
      }
    } catch (error) { warnings.push({ project_id: projectId, reason: error instanceof Error ? error.message : "Catalog unavailable" }); }
  }
  const all = [...sources.values()].sort((a, b) => Number(b.video_description.status === "ready") - Number(a.video_description.status === "ready") || b.matching_frame_count - a.matching_frame_count || a.name.localeCompare(b.name));
  return { videos: all.slice(offset, offset + limit), total: all.length, offset, limit,
    next_offset: offset + limit < all.length ? offset + limit : null, warnings,
    coverage: "Search includes saved summaries and every saved frame description; unanalyzed content remains unknown." };
}
