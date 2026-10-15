/**
 * Server-side integrated-loudness measurement for placed audio, so the volume fader
 * can be referenced to a real level (see `audio-gain.ts`). Measured once per file with
 * the same `ffmpeg ebur128` pass `pnpm probe` uses, cached by path+mtime in
 * `audio-loudness.json` (server-owned; kept apart from the client-written media-index).
 *
 * Best-effort: if ffmpeg is missing or the file can't be read, returns null and the
 * fader falls back to raw file level (100% = unity) rather than blocking the placement.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { projectDir } from "@/lib/local-store/paths";

type LoudnessEntry = { mtimeMs: number; integratedLufs: number | null };
type LoudnessCache = Record<string, LoudnessEntry>;

function cachePath(projectId: string): string {
  return path.join(projectDir(projectId), "audio-loudness.json");
}

function readCache(projectId: string): LoudnessCache {
  try {
    return JSON.parse(fs.readFileSync(cachePath(projectId), "utf8")) as LoudnessCache;
  } catch {
    return {};
  }
}

function writeCache(projectId: string, cache: LoudnessCache): void {
  try {
    fs.writeFileSync(cachePath(projectId), `${JSON.stringify(cache, null, 2)}\n`);
  } catch {
    /* cache is an optimization; a write failure is non-fatal */
  }
}

/** Parse the integrated loudness ("I: -23.0 LUFS") from an ffmpeg ebur128 summary. */
export function parseIntegratedLufs(stderr: string): number | null {
  // The Summary block prints `    I:         -23.0 LUFS`. Take the LAST match so a
  // per-frame stream (if verbose) never wins over the final integrated figure.
  const matches = [...stderr.matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  if (matches.length === 0) return null;
  const value = Number(matches[matches.length - 1]![1]);
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}

/** Measure integrated LUFS of an audio file directly (uncached). Null on any failure. */
export function measureIntegratedLufs(absPath: string): number | null {
  try {
    const result = spawnSync(
      "ffmpeg",
      ["-hide_banner", "-nostats", "-i", absPath, "-af", "ebur128=peak=true", "-f", "null", "-"],
      { encoding: "utf8", timeout: 60_000 },
    );
    if (result.error || typeof result.stderr !== "string") return null;
    return parseIntegratedLufs(result.stderr);
  } catch {
    return null;
  }
}

/** Cached integrated-loudness for a project-local audio file (by relative media path). */
export function getOrMeasureLufs(projectId: string, absPath: string, relKey: string): number | null {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(absPath).mtimeMs;
  } catch {
    return null;
  }
  const cache = readCache(projectId);
  const cached = cache[relKey];
  if (cached && cached.mtimeMs === mtimeMs) return cached.integratedLufs;

  const integratedLufs = measureIntegratedLufs(absPath);
  cache[relKey] = { mtimeMs, integratedLufs };
  writeCache(projectId, cache);
  return integratedLufs;
}
