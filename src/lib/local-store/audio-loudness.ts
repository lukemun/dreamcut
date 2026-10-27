/**
 * Server-side integrated-loudness measurement for placed audio, so the volume fader
 * can be referenced to a real level (see `audio-gain.ts`). Measured once per file with
 * the same `ffmpeg ebur128` pass `pnpm probe` uses, cached by source identity in
 * per-source files in `preprocess/audio-loudness/` (server-owned). Placement only
 * reads this cache; media preparation owns decoding.
 *
 * Best-effort: if ffmpeg is missing or the file can't be read, returns null and the
 * fader falls back to raw file level (100% = unity) rather than blocking the placement.
 */

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { projectDir } from "@/lib/local-store/paths";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";

type LoudnessEntry = { identity: string; integratedLufs: number };
function cachePath(projectId: string, relKey: string): string {
  return path.join(projectDir(projectId), "preprocess", "audio-loudness", `${createHash("sha256").update(relKey).digest("hex")}.json`);
}

function writeCache(projectId: string, relKey: string, entry: LoudnessEntry): void {
  try {
    // Independent source entries prevent lost updates between preparation processes.
    writeJsonFileAtomic(cachePath(projectId, relKey), entry);
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

// Bound simultaneous decoders. Loudness is optional; saturated requests retain raw gain.
const MAX_MEASUREMENTS = 2;
let activeMeasurements = 0;
const inFlight = new Map<string, Promise<number | null>>();

/** Measure without blocking the server event loop. Failed/overloaded work is retryable. */
export async function measureIntegratedLufs(absPath: string): Promise<number | null> {
  if (activeMeasurements >= MAX_MEASUREMENTS) return null;
  activeMeasurements += 1;
  try {
    return await new Promise<number | null>((resolve) => {
      childProcess.execFile(
        "ffmpeg",
        ["-hide_banner", "-nostats", "-i", absPath, "-af", "ebur128=peak=true", "-f", "null", "-"],
        { encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 },
        (error, _stdout, stderr) => resolve(error ? null : parseIntegratedLufs(stderr)),
      );
    });
  } catch {
    return null;
  } finally {
    activeMeasurements -= 1;
  }
}

function sourceIdentity(absPath: string): string | null {
  try {
    const stat = fs.statSync(absPath);
    return stat.isFile() ? `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` : null;
  } catch {
    return null;
  }
}

/** Cache-only: never launches a decoder, queues work or changes the source/volume. */
export function getCachedLufs(projectId: string, absPath: string, relKey: string): number | null {
  const identity = sourceIdentity(absPath);
  if (identity == null) return null;
  const cached = readJsonFile<LoudnessEntry | null>(cachePath(projectId, relKey), null);
  if (cached?.identity === identity && Number.isFinite(cached.integratedLufs)) return cached.integratedLufs;
  // Read old identity-bound entries without continuing their shared read-modify-write cache.
  const legacy = readJsonFile<Record<string, LoudnessEntry> | null>(path.join(projectDir(projectId), "audio-loudness.json"), null)?.[relKey];
  return legacy?.identity === identity && Number.isFinite(legacy.integratedLufs) ? legacy.integratedLufs : null;
}

/** Deduplicate concurrent requests; never cache a result for a replaced source. */
export async function getOrMeasureLufs(projectId: string, absPath: string, relKey: string): Promise<number | null> {
  const identity = sourceIdentity(absPath);
  if (identity == null) return null;
  const cached = getCachedLufs(projectId, absPath, relKey);
  if (cached != null) return cached;

  const key = JSON.stringify([cachePath(projectId, relKey), absPath, identity]);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const measurement = (async () => {
    const integratedLufs = await measureIntegratedLufs(absPath);
    if (sourceIdentity(absPath) !== identity) return null;
    if (integratedLufs != null) {
      writeCache(projectId, relKey, { identity, integratedLufs });
    }
    return integratedLufs;
  })();
  inFlight.set(key, measurement);
  try {
    return await measurement;
  } finally {
    inFlight.delete(key);
  }
}
