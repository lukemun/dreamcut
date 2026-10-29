import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { runBackgroundCommand as run } from "./background-worker";
import { beatAnnotationSchema, type BeatAnnotation } from "../timeline/beat-annotations";

const jobs = new Map<string, Promise<BeatAnnotation>>();
const script = path.resolve(process.cwd(), "scripts/beat-grid.py");
async function hashFile(source: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(source)) hash.update(chunk);
  return hash.digest("hex");
}
async function identity(source: string, directory: string) {
  const source_sha256 = await hashFile(source);
  const recipe = `rhythm-map-v3-${await hashFile(script)}`;
  return { source_sha256, recipe, file: path.join(directory, `${source_sha256}-${createHash("sha256").update(recipe).digest("hex").slice(0, 16)}.json`) };
}
async function readSaved(id: Awaited<ReturnType<typeof identity>>) {
  try {
    const annotation = beatAnnotationSchema.parse(JSON.parse(await fs.readFile(id.file, "utf8")));
    return annotation.source_sha256 === id.source_sha256 && annotation.recipe === id.recipe ? annotation : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Saved beat annotation is invalid. Remove the damaged sidecar before analyzing again.");
  }
}
/** Read-only: never invokes the detector, including on a cache miss. */
export async function readBeatAnnotation(source: string, directory: string) {
  return readSaved(await identity(source, directory));
}
/**
 * Explicit preparation only. Source bytes and timeline are never written.
 * One rhythm map per source: a new `expected_bpm` re-analyzes and replaces it, and
 * a request without one reuses whatever was saved, hinted or not.
 */
export async function prepareBeatAnnotation(source: string, directory: string, options: { expected_bpm?: number } = {}): Promise<BeatAnnotation> {
  const expected = options.expected_bpm ?? null;
  if (expected !== null && !(expected >= 40 && expected <= 240)) throw new Error("expected_bpm must be between 40 and 240.");
  const id = await identity(source, directory);
  const saved = await readSaved(id);
  if (saved && (expected === null || (saved.schema_version === 3 && saved.tempo_hint_bpm === expected))) return saved;
  const jobKey = `${id.file}:${expected ?? ""}`;
  const pending = jobs.get(jobKey);
  if (pending) return pending;
  const job = (async () => {
    // This executable belongs to the host, not the JavaScript bundle. Virtualenv
    // Python is commonly a symlink outside the repository's tracing root.
    const python = process.env.BEAT_PYTHON || path.resolve(/* turbopackIgnore: true */ ".venv-music/bin/python");
    try { await fs.access(python); } catch { throw new Error("Beat analysis needs the local librosa environment (.venv-music), or BEAT_PYTHON."); }
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "beat-annotation-"));
    try {
      const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", source]);
      const duration = Number(probe.stdout.trim());
      if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) throw new Error("Beat annotation supports sources up to 30 minutes. No partial grid was saved.");
      const wav = path.join(temp, "audio.wav");
      await run("ffmpeg", ["-v", "error", "-nostdin", "-i", source, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "22050", wav], { timeout: 180000 });
      const out = path.join(temp, "beats.json");
      await run(python, [script, wav, "--out", out, ...(expected === null ? [] : ["--bpm", String(expected)])], { timeout: 600000 });
      const detected = JSON.parse(await fs.readFile(out, "utf8"));
      const annotation = beatAnnotationSchema.parse({ schema_version: 3, source_sha256: id.source_sha256,
        recipe: id.recipe, analyzed_at: new Date().toISOString(), source_duration_seconds: detected.source_duration_seconds,
        tempo_bpm: detected.tempo_bpm, tempo_confirmed: false, beats_seconds: detected.beats_seconds, hits: detected.hits,
        downbeats: detected.downbeats, drops: detected.drops, tempo_hint_bpm: expected, beat_source: detected.beat_source, grid_strength: detected.grid_strength });
      if (await hashFile(source) !== id.source_sha256) throw new Error("Source changed during analysis; retry with the current recording.");
      await fs.mkdir(directory, { recursive: true });
      const staging = `${id.file}.${path.basename(temp)}.tmp`;
      await fs.writeFile(staging, JSON.stringify(annotation, null, 2) + "\n");
      await fs.rename(staging, id.file);
      return annotation;
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
  })();
  jobs.set(jobKey, job);
  try { return await job; } finally { jobs.delete(jobKey); }
}
