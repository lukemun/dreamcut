import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readEnv } from "@/lib/env-name";

/**
 * Finished exports also live in one folder the creator can find outside DreamCut
 * (~/Movies/DreamCut on macOS, ~/Videos/DreamCut elsewhere; DREAMCUT_EXPORTS_DIR overrides).
 *
 * Ownership: the folder belongs to the creator. DreamCut adds finished exports and lists
 * them in Library → Exports; it never deletes, renames or overwrites a file there. The
 * project's renders folder keeps its own copy under its existing retention rules. An export
 * is linked (no extra bytes) when both folders share a volume, otherwise copied with the
 * storage contract's free-space reserve. Failing to add it never fails the export.
 */

const FREE_SPACE_RESERVE_BYTES = 5 * 1024 ** 3;

export function exportsDir(): string {
  const configured = readEnv("EXPORTS_DIR");
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), process.platform === "darwin" ? "Movies" : "Videos", "DreamCut");
}

/** A readable, unique name: the project's title and when it finished. */
export function exportFileName(title: string, finishedAt: Date, extension: string, taken: (name: string) => boolean): string {
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${finishedAt.getFullYear()}-${pad(finishedAt.getMonth() + 1)}-${pad(finishedAt.getDate())} ${pad(finishedAt.getHours())}.${pad(finishedAt.getMinutes())}`;
  for (let index = 1; ; index += 1) {
    const name = `${safe} ${stamp}${index > 1 ? ` (${index})` : ""}${extension}`;
    if (!taken(name)) return name;
  }
}

function freeBytes(directory: string): number | null {
  try {
    const { bavail, bsize } = fs.statfsSync(directory);
    return Number(bavail) * Number(bsize);
  } catch {
    return null;
  }
}

/** Add a finished export to the shared folder; returns its path, or null with the reason logged. */
export function addToExportsFolder(renderPath: string, title: string, finishedAt: Date): string | null {
  try {
    const directory = exportsDir();
    fs.mkdirSync(directory, { recursive: true });
    const name = exportFileName(title, finishedAt, path.extname(renderPath) || ".mp4", (candidate) => fs.existsSync(path.join(directory, candidate)));
    const target = path.join(directory, name);
    try {
      fs.linkSync(renderPath, target);
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV" && (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
    // Another volume: copy only with room to spare, through a temporary name so a full disk never leaves half a file.
    const size = fs.statSync(renderPath).size;
    const free = freeBytes(directory);
    if (free === null || free - size < FREE_SPACE_RESERVE_BYTES) {
      console.warn(`[exports] not copied to ${directory}: not enough free space`);
      return null;
    }
    const pending = path.join(directory, `.${name}.pending`);
    try {
      fs.copyFileSync(renderPath, pending, fs.constants.COPYFILE_EXCL);
      fs.renameSync(pending, target);
    } finally {
      fs.rmSync(pending, { force: true });
    }
    return target;
  } catch (error) {
    console.warn("[exports] could not add the export to the shared folder:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Whether a path is a file DreamCut placed in the shared exports folder. */
export function isInExportsFolder(file: string): boolean {
  const directory = path.resolve(exportsDir());
  const resolved = path.resolve(file);
  return path.dirname(resolved) === directory && fs.existsSync(resolved);
}

/**
 * The file a finished export can be played or shown from: its shared-folder copy when it is
 * still there, else the project's renders copy. Null once both are gone.
 */
export function finishedExportFile(job: { projectId: string; fileName: string | null; libraryPath?: string | null }, rendersDir: string): string | null {
  if (job.libraryPath && isInExportsFolder(job.libraryPath)) return path.resolve(job.libraryPath);
  if (!job.fileName) return null;
  const file = path.join(rendersDir, path.basename(job.fileName));
  return fs.existsSync(file) ? file : null;
}
