import fs from "node:fs";

import { coverFromTimeline, type ProjectCover } from "@/lib/media/project-cover-source";

import { projectSourceManifestPath, projectTimelinePath } from "./paths";
import { mediaUrl } from "./media";

export { coverFromTimeline, type ProjectCover };

type Entry = { key: string; cover: ProjectCover | undefined };
// Survives dev-server module reloads; bounded by the number of projects.
const store = globalThis as typeof globalThis & { __dreamcutProjectCovers?: Map<string, Entry> };
const covers = (store.__dreamcutProjectCovers ??= new Map());

const stamp = (file: string) => { try { const stat = fs.statSync(file); return `${stat.size}:${stat.mtimeMs}`; } catch { return "-"; } };

/** A project with nothing on its timeline yet still has a picture: its first imported image or video. */
function coverFromImports(id: string): ProjectCover | undefined {
  try {
    const manifest = JSON.parse(fs.readFileSync(projectSourceManifestPath(id), "utf8")) as { assets?: { media_path?: unknown }[] };
    for (const asset of manifest.assets ?? []) {
      const file = asset.media_path;
      if (typeof file !== "string") continue;
      if (/\.(png|jpe?g|webp|gif)$/i.test(file)) return { url: mediaUrl(id, file), video: false };
      if (/\.(mp4|mov|webm|m4v)$/i.test(file)) return { url: mediaUrl(id, file), video: true };
    }
  } catch { /* No imports yet. */ }
  return undefined;
}

/**
 * Dashboard and tab cover: the timeline's first picture, else the first imported one. Re-derived
 * only when timeline.json or source-manifest.json changes (every write is an atomic replace).
 */
export function projectCover(id: string): ProjectCover | undefined {
  const file = projectTimelinePath(id);
  if (!fs.existsSync(file)) { covers.delete(id); return undefined; }
  const key = `${stamp(file)}|${stamp(projectSourceManifestPath(id))}`;
  const hit = covers.get(id);
  if (hit && hit.key === key) return hit.cover;
  let cover: ProjectCover | undefined;
  try { cover = coverFromTimeline(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { cover = undefined; }
  cover ??= coverFromImports(id);
  covers.set(id, { key, cover });
  return cover;
}
