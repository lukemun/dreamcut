import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runBackgroundCommand as run } from "./background-worker";
import { createHash } from "node:crypto";
import { resolveLocalMediaSource } from "./audio-effects";
import { resolveMusicCatalogFile } from "./music-catalog";
import { resolveSfxCatalogFile } from "./sfx-catalog";
import { extractWaveformPeaksFromPcmWav, WAVEFORM_PEAK_RECIPE_ID } from "../media-analysis/waveform-peaks";
import type { PeaksEntry } from "./store";

const jobs = new Map<string, Promise<PeaksEntry>>();

export function resolveWaveformSource(projectId: string, source: string): string | null {
  const url = new URL(source, "http://localhost");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
  const music = "/api/music-catalog/media/";
  const sfx = "/api/sfx-catalog/media/";
  if (url.pathname.startsWith(music)) return resolveMusicCatalogFile(decodeURIComponent(url.pathname.slice(music.length)));
  if (url.pathname.startsWith(sfx)) return resolveSfxCatalogFile(decodeURIComponent(url.pathname.slice(sfx.length)));
  return resolveLocalMediaSource(projectId, url.pathname, { allowReferencedProject: true })?.absolutePath ?? null;
}

/** Source-wide analysis, independent of clip trims, playback codecs or browser gestures. */
export async function prepareWaveform(source: string, cacheDir: string): Promise<PeaksEntry> {
  const key = createHash("sha256").update(await fs.readFile(source)).update(WAVEFORM_PEAK_RECIPE_ID).digest("hex");
  const cache = path.join(cacheDir, `${key}.json`);
  try { return JSON.parse(await fs.readFile(cache, "utf8")); } catch { /* Missing cache. */ }
  const existing = jobs.get(cache);
  if (existing) return existing;
  const job = (async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "waveform-"));
    try {
      const wav = path.join(temp, "audio.wav");
      await run("ffmpeg", ["-v", "error", "-nostdin", "-i", source, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", wav], { timeout: 120_000 });
      const result = extractWaveformPeaksFromPcmWav(wav);
      await fs.mkdir(cacheDir, { recursive: true });
      const staging = `${cache}.${path.basename(temp)}.tmp`;
      await fs.writeFile(staging, JSON.stringify(result));
      await fs.rename(staging, cache);
      return result;
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
  })();
  jobs.set(cache, job);
  try { return await job; } finally { jobs.delete(cache); }
}
