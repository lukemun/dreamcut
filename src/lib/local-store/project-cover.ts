import fs from "node:fs";

import { coverFromTimeline, type ProjectCover } from "@/lib/media/project-cover-source";

import { projectTimelinePath } from "./paths";

export { coverFromTimeline, type ProjectCover };

type Entry = { size: number; mtimeMs: number; cover: ProjectCover | undefined };
// Survives dev-server module reloads; bounded by the number of projects.
const store = globalThis as typeof globalThis & { __dreamcutProjectCovers?: Map<string, Entry> };
const covers = (store.__dreamcutProjectCovers ??= new Map());

/**
 * Dashboard cover, re-derived only when timeline.json's size or mtime changes. Every
 * timeline write goes through an atomic replace, which always changes the mtime.
 */
export function projectCover(id: string): ProjectCover | undefined {
  const file = projectTimelinePath(id);
  let stat: fs.Stats;
  try { stat = fs.statSync(file); } catch { covers.delete(id); return undefined; }
  const hit = covers.get(id);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.cover;
  let cover: ProjectCover | undefined;
  try { cover = coverFromTimeline(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { cover = undefined; }
  covers.set(id, { size: stat.size, mtimeMs: stat.mtimeMs, cover });
  return cover;
}
