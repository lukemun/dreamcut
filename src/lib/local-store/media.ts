import fs from "node:fs";
import path from "node:path";

import { portableRelative, projectDir, projectMediaDir } from "@/lib/local-store/paths";

// Scans a project's media/ folder so dropped-in files show up in the asset
// shelf. This request-path scan performs filesystem metadata reads only. Legacy
// probe results remain readable, but all new probing belongs to the worker.

export type MediaKind = "image" | "video" | "audio";

export type MediaFileInfo = {
  relPath: string;
  name: string;
  kind: MediaKind;
  url: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** True when the file lives under media/sfx/ (audio classified as sound effect). */
  isSfx: boolean;
};

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".heic", ".heif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac"]);

export const MEDIA_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
  ".flac": "audio/flac",
};

type ProbeCacheEntry = {
  mtimeMs: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
};

type ProbeCache = Record<string, ProbeCacheEntry>;

function probeCachePath(projectId: string): string {
  return path.join(projectDir(projectId), "media-index.json");
}

function readProbeCache(projectId: string): ProbeCache {
  try {
    return JSON.parse(fs.readFileSync(probeCachePath(projectId), "utf8")) as ProbeCache;
  } catch {
    return {};
  }
}

function walkMediaFiles(dir: string, baseDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    // Legacy processing frames are never creator-facing assets, even before migration.
    if (dir === baseDir && entry.name === "grid-mattes") continue;
    const absPath = path.join(dir, entry.name);
    // Composition renders sit directly in hyperframes/<id>/; folders below are render scratch.
    if (entry.isDirectory() && path.relative(baseDir, dir).split(path.sep).length === 2 && path.relative(baseDir, dir).startsWith(`hyperframes${path.sep}`)) continue;
    if (entry.isDirectory()) {
      files.push(...walkMediaFiles(absPath, baseDir));
    } else if (entry.isFile()) {
      files.push(portableRelative(baseDir, absPath));
    } else if (entry.isSymbolicLink()) {
      // Explicit external-library imports are represented by per-file symlinks.
      // Broken links stay out of the shelf until their library is available again.
      try {
        if (fs.statSync(absPath).isFile()) files.push(portableRelative(baseDir, absPath));
      } catch {
        // unavailable external source
      }
    }
  }
  return files;
}

export function mediaUrl(projectId: string, relPath: string): string {
  const encoded = relPath.split(path.sep).map(encodeURIComponent).join("/");
  return `/api/projects/${projectId}/media/${encoded}`;
}

export function listMediaFiles(projectId: string): MediaFileInfo[] {
  const mediaDir = projectMediaDir(projectId);
  const relPaths = walkMediaFiles(mediaDir, mediaDir);
  const cache = readProbeCache(projectId);

  const results: MediaFileInfo[] = [];
  for (const relPath of relPaths) {
    const ext = path.extname(relPath).toLowerCase();
    const kind: MediaKind | null = IMAGE_EXTS.has(ext)
      ? "image"
      : VIDEO_EXTS.has(ext)
        ? "video"
        : AUDIO_EXTS.has(ext)
          ? "audio"
          : null;
    if (!kind) continue;

    const absPath = path.join(mediaDir, relPath);
    let probe: ProbeCacheEntry;
    const mtimeMs = fs.statSync(absPath).mtimeMs;
    const cached = cache[relPath];
    if (cached && cached.mtimeMs === mtimeMs) {
      probe = cached;
    } else {
      probe = { mtimeMs, durationSeconds: null, width: null, height: null };
    }

    results.push({
      relPath,
      name: path.basename(relPath),
      kind,
      url: mediaUrl(projectId, relPath),
      durationSeconds: probe.durationSeconds,
      width: probe.width,
      height: probe.height,
      isSfx: kind === "audio" && relPath.split(path.sep)[0] === "sfx",
    });
  }

  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** Resolve a URL-decoded media path safely inside the project's media dir. */
export function resolveMediaPath(projectId: string, segments: string[]): string | null {
  const mediaDir = projectMediaDir(projectId);
  const resolved = path.resolve(mediaDir, ...segments);
  if (!resolved.startsWith(mediaDir + path.sep) && resolved !== mediaDir) return null;
  return resolved;
}
