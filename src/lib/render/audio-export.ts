import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AudioSample } from "../frame-runtime/session";
import { audioRuns, tempoFilters } from "./audio-manifest";
const sampleRate = 48000, channels = 2, bytesPerSample = 4;
export async function runMediaProcess(command: string, args: string[], signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], signal, timeout: 300_000 });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout = (stdout + data).slice(-1_000_000); });
    child.stderr.on("data", data => { stderr = (stderr + data).slice(-32_000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${code}): ${stderr}`)));
  });
}
/** The desktop service rejects requests without its session cookie, including the headless
 * renderer's /render-frame and FFmpeg reading project media. The browser editor (pnpm dev) has no token and needs none. */
export function desktopRenderSessionCookie(env:Record<string,string|undefined>=process.env){
  return env.DREAMCUT_SERVICE_TOKEN ? { name: "dreamcut_desktop_session", value: env.DREAMCUT_SERVICE_TOKEN } : undefined;
}
/** FFmpeg/FFprobe input arguments for a source; only this machine's editor is sent the session cookie. */
export function mediaInputArgs(src: string, cookie = desktopRenderSessionCookie()) {
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(src);
  return [...(cookie && local ? ["-headers", `Cookie: ${cookie.name}=${cookie.value}\r\n`] : []), "-i", src];
}
/** Run tasks with at most `limit` in flight; results keep their input order. */
async function pooled<T, R>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await work(items[index]!, index); }
  }));
  return results;
}

/**
 * Decode bounded source windows to disk, several at once (each is its own ffmpeg process),
 * then mix run by run in the original run order. Each output sample is summed in the same
 * order as the earlier frame-by-frame mixer, so the result is bit-identical; decoding in
 * sequence was most of the audio pass after its frames were evaluated.
 */
export async function exportAudioMix(frames: AudioSample[][], fps: number, directory: string, signal?: AbortSignal) {
  const runs = audioRuns(frames, fps), hasAudio = new Map<string, boolean>();
  const limit = Math.max(2, Math.min(8, (typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length) - 2));
  const sources = [...new Set(runs.map((run) => run.src))];
  const probes = await pooled(sources, limit, async (src) => {
    signal?.throwIfAborted();
    return JSON.parse(await runMediaProcess("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "json", ...mediaInputArgs(src)], signal)).streams.length > 0;
  });
  sources.forEach((src, index) => hasAudio.set(src, probes[index]!));
  const decoded = (await pooled(runs, limit, async (run, index) => {
    signal?.throwIfAborted();
    if (!hasAudio.get(run.src)) return null;
    const pcm = path.join(directory, `audio-${index}.f32`);
    const first = Math.round(run.firstFrame * sampleRate / fps);
    const count = Math.round((run.firstFrame + run.gains.length) * sampleRate / fps) - first;
    const duration = count / sampleRate;
    const span = duration * run.rate;
    // A reverse run's first picture frame shows sourceStart; its sound covers that frame and runs back from the frame's end.
    const windowEnd = run.reverse ? run.sourceStart + run.rate / fps : run.sourceStart + span;
    const windowStart = Math.max(0, windowEnd - span);
    const filters = [...(run.reverse ? ["areverse"] : []), "aresample=48000", ...(run.preservePitch ? tempoFilters(run.rate) : [`asetrate=${sampleRate * run.rate}`, "aresample=48000"]), "apad", `atrim=end_sample=${count}`];
    await runMediaProcess("ffmpeg", ["-v", "error", "-y", "-ss", String(windowStart), "-t", String(windowEnd - windowStart), ...mediaInputArgs(run.src), "-map", "0:a:0", "-vn", "-af", filters.join(","), "-ar", String(sampleRate), "-ac", "2", "-f", "f32le", pcm], signal);
    return { first, gains: run.gains, pcm, firstFrame: run.firstFrame };
  })).filter((run): run is NonNullable<typeof run> => run !== null);
  signal?.throwIfAborted();
  const frameStart = (frame: number) => Math.round(frame * sampleRate / fps);
  const mix = new Float32Array(frameStart(frames.length) * channels);
  for (const run of decoded) {
    const bytes = fs.readFileSync(run.pcm);
    const samples = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / bytesPerSample));
    for (let offset = 0; offset < run.gains.length; offset++) {
      const frame = run.firstFrame + offset;
      if (frame >= frames.length) break;
      const from = frameStart(frame) * channels, to = frameStart(frame + 1) * channels, source = (frameStart(frame) - run.first) * channels, gain = run.gains[offset]!;
      // A short decode contributes what it has, as the frame-by-frame reader did.
      for (let i = from, j = source; i < to && j < samples.length; i++, j++) mix[i] += samples[j]! * gain;
    }
  }
  const output = path.join(directory, "mix.f32");
  fs.writeFileSync(output, Buffer.from(mix.buffer, mix.byteOffset, mix.byteLength));
  return { output, sourceCount: [...hasAudio.values()].filter(Boolean).length, runCount: decoded.length };
}
