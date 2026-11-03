/**
 * Shared catalog clips from DreamCut Cloud.
 *
 * The catalog's list (`catalogs/visual/catalog.json`) ships with the editor; its media does not.
 * A clip that is not in this checkout's `catalogs/visual/media/` is downloaded on first use from
 * DreamCut Cloud (`GET /api/v1/visuals/<file>` returns a short-lived link; every clip is free, so no
 * account is needed), checked against the entry's SHA-256 and kept in the profile's visual cache.
 *
 * Storage: a rebuildable cache owned by this module. It holds at most one copy of each shared
 * catalog file; files the catalog no longer lists and temporary files of ended processes are removed
 * before each download. A download needs room for the file plus the 5 GiB free-space reserve, is
 * written to a temporary name and renamed into place only after its hash matches.
 */
import fs from "node:fs";
import path from "node:path";

import { cloudBaseUrl } from "@/lib/cloud/base-url";

import { saveCatalogDownload } from "./catalog-cloud-download";
import { isPersonalCatalogFile } from "./personal-library";
import { readSharedVisualCatalog, resolveVisualCatalogFile, visualCatalogCheckoutPath, visualCloudCachePath, visualCloudCacheRoot } from "./visual-catalog";

const RESERVE_BYTES = 5 * 1024 ** 3;
const MAX_CLIP_BYTES = 500 * 1024 * 1024;
const TIMEOUT_MS = 10 * 60_000;

function entryFor(relativeFile: string) {
  const file = relativeFile.split(path.sep).join("/");
  return readSharedVisualCatalog().assets.find((entry) => entry.file === file) ?? null;
}

function processAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

/** Remove cached files the shared catalog no longer lists, and temporary files of ended downloads. */
export function pruneVisualCloudCache(): number {
  const root = path.resolve(visualCloudCacheRoot());
  const listed = new Set(readSharedVisualCatalog().assets.map((entry) => visualCloudCachePath(entry.file)));
  let removed = 0;
  const visit = (directory: string) => {
    let children: fs.Dirent[];
    try { children = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const child of children) {
      const full = path.join(directory, child.name);
      if (child.isDirectory()) { visit(full); continue; }
      if (!child.isFile()) continue;
      const temporary = child.name.match(/\.(\d+)\.[0-9a-f-]{36}\.tmp$/);
      const stale = temporary ? !processAlive(Number(temporary[1])) : !listed.has(full);
      if (stale) { fs.rmSync(full, { force: true }); removed += 1; }
    }
  };
  visit(root);
  return removed;
}

const downloads = new Map<string, Promise<string>>();

async function download(entry: NonNullable<ReturnType<typeof entryFor>>): Promise<string> {
  const target = visualCloudCachePath(entry.file);
  const pathname = `/api/v1/visuals/${entry.file.split("/").map(encodeURIComponent).join("/")}`;
  let response: Response;
  try {
    response = await fetch(`${cloudBaseUrl()}${pathname}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw Object.assign(new Error("Could not reach DreamCut to download this clip. Check the connection and try again."), { status: 503 });
  }
  if (!response.ok) throw Object.assign(new Error(`DreamCut could not provide this clip (${response.status}).`), { status: response.status === 404 ? 404 : 502 });
  pruneVisualCloudCache();
  return saveCatalogDownload(response, { target, sha256: entry.sha256, maxBytes: MAX_CLIP_BYTES, reserveBytes: RESERVE_BYTES, timeoutMs: TIMEOUT_MS, noun: "clip" });
}

/** Whether a shared catalog file is on this computer (in the checkout or already downloaded). */
export function visualCatalogFileDownloaded(relativeFile: string): boolean {
  return fs.existsSync(visualCatalogCheckoutPath(relativeFile)) || fs.existsSync(visualCloudCachePath(relativeFile));
}

/**
 * The local path of a catalog file, downloading a shared one from DreamCut Cloud when needed.
 * Personal-library files and checkout files are used as they are.
 */
export async function ensureVisualCatalogFile(relativeFile: string): Promise<string> {
  if (isPersonalCatalogFile(relativeFile)) return resolveVisualCatalogFile(relativeFile);
  const checkout = visualCatalogCheckoutPath(relativeFile);
  if (fs.existsSync(checkout)) return checkout;
  const cached = visualCloudCachePath(relativeFile);
  if (fs.existsSync(cached)) return cached;
  const entry = entryFor(relativeFile);
  if (!entry) throw Object.assign(new Error("No such catalog clip."), { status: 404 });
  const pending = downloads.get(cached) ?? download(entry);
  downloads.set(cached, pending);
  try { return await pending; } finally { downloads.delete(cached); }
}
