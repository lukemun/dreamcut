import { assertTimelineLanes } from "@/lib/timeline/lanes";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { writeJsonFileAtomic } from "./atomic-json";
import { preparationDir, preparationKey, readPreparation, type PreparedMedia } from "./media-preparation";
import { projectMediaDir, projectMetadataPath, projectSourceManifestPath, projectTimelinePath } from "./paths";
import { assertProject, readMetadata, readTimeline } from "./store";

/** Free space a full (non-clone) copy must leave on the destination volume. */
export const SEED_COPY_RESERVE_BYTES = 5 * 1024 ** 3;

export type SourceSeedReceipt = {
  source_project_id: string;
  elements: number;
  transitions: number;
  media_files: number;
  logical_bytes: number;
  copy_mode: "clone" | "copy" | "mixed" | "none";
};

function mediaPrefix(projectId: string) {
  return `/api/projects/${projectId}/media/`;
}

function collectMediaPaths(value: unknown, prefix: string, out: Set<string>) {
  if (typeof value === "string") {
    if (value.startsWith(prefix)) out.add(decodeURIComponent(value.slice(prefix.length).split(/[?#]/)[0]));
  } else if (Array.isArray(value)) {
    for (const item of value) collectMediaPaths(item, prefix, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectMediaPaths(item, prefix, out);
  }
}

function insideMedia(projectId: string, relative: string) {
  const root = path.resolve(projectMediaDir(projectId));
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) throw new Error(`Referenced media escapes the source project: ${relative}`);
  return file;
}

function preparedPaths(record: PreparedMedia) {
  return [record.preview, record.render, record.audio,
    record.browse_preview?.preview, record.browse_preview?.audio, record.browse_preview?.color_stage]
    .filter((item): item is string => typeof item === "string");
}

/**
 * Seed a fresh assembly workspace with another project's live cut, for a format variant
 * such as a vertical version of a finished 16:9 edit. The source project is only read.
 * Referenced media and their preparation packages are APFS-cloned where the volume
 * supports it; a full copy is admitted only when it leaves the free-space reserve.
 */
/** Copy-on-write clone, or false when the volume cannot clone. Never a silent full copy. */
function cloneFile(from: string, to: string) {
  if (fs.existsSync(to)) throw new Error(`Seed target already exists: ${to}`);
  try {
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE_FORCE);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOSYS" || process.platform !== "darwin") return false;
  }
  // libuv does not implement FICLONE_FORCE on macOS; clonefile(2) through cp -c fails instead of copying.
  try {
    execFileSync("/bin/cp", ["-c", from, to], { stdio: "ignore" });
    return true;
  } catch {
    fs.rmSync(to, { force: true });
    return false;
  }
}

export function seedWorkspaceFromProject(sourceProjectId: string, targetProjectId: string): SourceSeedReceipt {
  assertProject(sourceProjectId);
  const timeline = readTimeline(sourceProjectId);
  const elements = timeline.elements.filter(element => element.removed_at == null);
  assertTimelineLanes(elements);
  const live = new Set(elements.map(element => element.id));
  const transitions = (timeline.transitions ?? []).filter(transition =>
    live.has(transition.from_element_id) && live.has(transition.to_element_id));

  const referenced = new Set<string>();
  collectMediaPaths(elements, mediaPrefix(sourceProjectId), referenced);
  const preparations = new Map<string, PreparedMedia>();
  for (const relative of [...referenced]) {
    const record = readPreparation(sourceProjectId, relative);
    if (record?.state !== "ready") continue;
    preparations.set(relative, record);
    for (const item of preparedPaths(record)) referenced.add(item);
  }
  const files = [...referenced].sort().map(relative => {
    const from = insideMedia(sourceProjectId, relative);
    if (!fs.existsSync(from)) throw new Error(`Source project media is missing: ${relative}`);
    return { relative, from, to: insideMedia(targetProjectId, relative), bytes: fs.statSync(from).size };
  });
  const logicalBytes = files.reduce((sum, file) => sum + file.bytes, 0);

  let cloned = 0;
  let copied = 0;
  let remaining = logicalBytes;
  for (const file of files) {
    fs.mkdirSync(path.dirname(file.to), { recursive: true });
    if (cloneFile(file.from, file.to)) {
      cloned += 1;
    } else {
      const { bavail, bsize } = fs.statfsSync(path.dirname(file.to));
      const available = bavail * bsize;
      if (available - remaining < SEED_COPY_RESERVE_BYTES) {
        throw new Error(`Not enough free space to copy the source media: ${Math.ceil(remaining / 1024 ** 2)} MB needed, `
          + `${Math.floor(available / 1024 ** 2)} MB available, ${SEED_COPY_RESERVE_BYTES / 1024 ** 3} GB must stay free.`);
      }
      fs.copyFileSync(file.from, file.to, fs.constants.COPYFILE_EXCL);
      copied += 1;
    }
    // Preparation records are keyed by size and mtime; keep the copy's identical.
    const stat = fs.statSync(file.from);
    fs.utimesSync(file.to, stat.atime, stat.mtime);
    remaining -= file.bytes;
  }
  for (const [relative, record] of preparations) {
    const stat = fs.statSync(insideMedia(targetProjectId, relative));
    writeJsonFileAtomic(path.join(preparationDir(targetProjectId), preparationKey(relative) + ".json"),
      { ...record, size: stat.size, mtime: stat.mtimeMs });
  }

  const rewrite = <T>(value: T): T => JSON.parse(JSON.stringify(value)
    .split(mediaPrefix(sourceProjectId)).join(mediaPrefix(targetProjectId))
    .split(`"project_id":${JSON.stringify(sourceProjectId)}`).join(`"project_id":${JSON.stringify(targetProjectId)}`));
  writeJsonFileAtomic(projectTimelinePath(targetProjectId), rewrite({ ...timeline, elements, transitions }));

  if (fs.existsSync(projectSourceManifestPath(sourceProjectId))) {
    const manifest = JSON.parse(fs.readFileSync(projectSourceManifestPath(sourceProjectId), "utf8"));
    const kept = new Set(files.map(file => file.relative));
    writeJsonFileAtomic(projectSourceManifestPath(targetProjectId), rewrite({ ...manifest, project_id: targetProjectId,
      assets: (manifest.assets ?? []).filter((asset: { media_path?: string }) => asset.media_path && kept.has(asset.media_path)) }));
  }

  const source = readMetadata(sourceProjectId);
  const target = readMetadata(targetProjectId);
  // The target was just created by this flow; write its seed state as creation does,
  // not as an edit, so the fresh workspace grant and empty history stay intact.
  writeJsonFileAtomic(projectMetadataPath(targetProjectId), {
    ...target,
    ...(source.frame_rate && !target.frame_rate ? { frame_rate: source.frame_rate } : {}),
    ...(source.lane_order_keys ? { lane_order_keys: source.lane_order_keys } : {}),
    ...(source.lane_defaults ? { lane_defaults: source.lane_defaults } : {}),
    ...(source.muted_lane_keys ? { muted_lane_keys: source.muted_lane_keys } : {}),
    ...(source.hidden_lane_keys ? { hidden_lane_keys: source.hidden_lane_keys } : {}),
    ...(source.caption_safe_area_mode ? { caption_safe_area_mode: source.caption_safe_area_mode } : {}),
  });

  return {
    source_project_id: sourceProjectId,
    elements: elements.length,
    transitions: transitions.length,
    media_files: files.length,
    logical_bytes: logicalBytes,
    copy_mode: files.length === 0 ? "none" : copied === 0 ? "clone" : cloned === 0 ? "copy" : "mixed",
  };
}
