import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { runBackgroundCommand as run } from "./background-worker";
import { resolveMediaPath } from "./media";
import { projectDir } from "./paths";
import { storyboardAssets } from "./storyboard";
import { workerCommand } from "@/lib/worker-command";
import { traceOperation } from "@/lib/observability/operations";
import type { TranscriptWord } from "@/lib/storyboard/model";

const busy = new Set<string>();
const sha256 = (file: string) => new Promise<string>((resolve, reject) => {
  const hash = createHash("sha256");
  createReadStream(file).on("data", chunk => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
});

/**
 * Preparation only: word-timed speech for one storyboard video, on its source clock. Never writes
 * the storyboard; the page saves the words onto a row as its own Undo step. Results are cached by
 * the source bytes' hash (a few KB each); the extracted audio is removed once whisper finishes.
 */
export function transcribeStoryboardSource(projectId: string, source: string) {
  return traceOperation("storyboard.transcribe", () => transcribe(projectId, source));
}
async function transcribe(projectId: string, source: string): Promise<{ source: string; words: TranscriptWord[]; text: string }> {
  const asset = storyboardAssets(projectId).find(a => a.source === source);
  if (!asset || asset.kind !== "video") throw Object.assign(new Error("Choose a video to transcribe."), { status: 400 });
  const file = resolveMediaPath(projectId, source.split("/"));
  if (!file) throw Object.assign(new Error("This video is not in the project's media."), { status: 400 });
  const dir = path.join(projectDir(projectId), "instruments", "storyboard-transcripts");
  const hash = asset.sourceHash ?? await sha256(file), cached = path.join(dir, `${hash}.json`);
  const read = async () => { const result = JSON.parse(await fs.readFile(cached, "utf8")); return { source, words: result.words as TranscriptWord[], text: result.text as string }; };
  try { return await read(); } catch { /* Not transcribed yet. */ }
  const key = `${projectId}:${hash}`;
  if (busy.has(key)) throw Object.assign(new Error("This video is already being transcribed."), { status: 409 });
  busy.add(key);
  const work = path.join(dir, `${hash}.work`);
  try {
    await fs.mkdir(work, { recursive: true });
    const job = workerCommand("scripts/transcribe.ts", [file, "--words", "--out", path.join(work, "transcript.json")]);
    try { await run(job.command, job.args, { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 }); }
    catch (cause) {
      const detail = (cause as { stderr?: string }).stderr?.match(/Error: ([^\n]+)/)?.[1];
      if (detail === "VAD found no transcribable speech.") throw Object.assign(new Error("No speech found in this video."), { status: 422 });
      throw Object.assign(new Error(detail ?? "Transcription failed. `pnpm setup:check` shows whether FFmpeg, whisper-cli and the speech models are installed."), { status: 500 });
    }
    const result = JSON.parse(await fs.readFile(path.join(work, "transcript.json"), "utf8"));
    await fs.writeFile(cached, JSON.stringify({ source, sha256: hash, text: result.text, words: result.words ?? [] }));
    return await read();
  } finally {
    busy.delete(key);
    await fs.rm(work, { recursive: true, force: true });
  }
}
