import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runBackgroundCommand as run } from "./background-worker";

const pending = new Map<string, Promise<string>>();

/** Disposable AAC cache, atomically published and keyed by original bytes + recipe. */
export async function prepareCatalogAudioPreview(source: string, cacheDir: string): Promise<string> {
  const hash = createHash("sha256").update(await fs.readFile(source)).update("aac-192k-48k-v1").digest("hex");
  const output = path.join(cacheDir, `${hash}.m4a`);
  try { await fs.access(output); return output; } catch { /* Prepare missing cache. */ }
  const existing = pending.get(output);
  if (existing) return existing;
  const job = (async () => {
    await fs.mkdir(cacheDir, { recursive: true });
    const temp = path.join(cacheDir, `${hash}-${randomUUID()}.m4a`);
    try {
      await run("ffmpeg", ["-v", "error", "-nostdin", "-i", source, "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", temp], { timeout: 120_000 });
      const probe = async (file: string) => JSON.parse((await run("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file])).stdout);
      const [original, preview] = await Promise.all([probe(source), probe(temp)]);
      if (preview.streams.length !== 1 || preview.streams[0].codec_name !== "aac" || Math.abs(Number(original.format.duration) - Number(preview.format.duration)) > 0.1) throw new Error("Audio preview failed source-clock validation");
      await fs.rename(temp, output);
      return output;
    } finally { await fs.rm(temp, { force: true }); }
  })();
  pending.set(output, job);
  try { return await job; } finally { pending.delete(output); }
}
