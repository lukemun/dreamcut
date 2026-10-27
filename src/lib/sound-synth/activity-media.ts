import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

/**
 * Media readers for visual activity: motion energy measured from decoded frames, a
 * sound's loudness envelope on the timeline clock, and a composition's own timing
 * read from its scene data by a short agent-written activity() function.
 */

const FRAME_WIDTH = 160;
const DIFF_THRESHOLD = 12;

function run(args: string[], timeout = 60_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", ["-v", "error", ...args], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024, timeout }, (error, stdout) => {
      if (error) reject(new Error(`ffmpeg could not read the media: ${error.message.split("\n")[0]}`));
      else resolve(stdout);
    });
  });
}

function probeSize(file: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { timeout: 20_000 }, (error, stdout) => {
      if (error) return reject(new Error(`ffprobe could not read the video: ${error.message.split("\n")[0]}`));
      const [width, height] = String(stdout).trim().split(",").map(Number);
      if (!width || !height) return reject(new Error("The video has no readable picture size"));
      resolve({ width, height });
    });
  });
}

/**
 * Motion energy per frame over a source window: the share of pixels that changed
 * since the previous frame (on a 160 px wide grey copy, alpha premultiplied). A share
 * of changed pixels, not an average difference, so a small moving subject still counts.
 * Returns values at `fps`, the first being the change into frame 1, timed between frames.
 */
export async function measureFrameMotion(file: string, sourceStart: number, sourceEnd: number, options: { fps?: number; alpha?: boolean } = {}) {
  const fps = options.fps ?? 30;
  const { width, height } = await probeSize(file);
  const outWidth = FRAME_WIDTH;
  const outHeight = Math.max(2, Math.round((height / width) * outWidth / 2) * 2);
  const seconds = Math.max(1 / fps, sourceEnd - sourceStart);
  const decoder = options.alpha && file.endsWith(".webm") ? ["-c:v", "libvpx-vp9"] : [];
  const filter = options.alpha
    ? `fps=${fps},scale=${outWidth}:${outHeight},format=rgba,premultiply=inplace=1,format=gray`
    : `fps=${fps},scale=${outWidth}:${outHeight},format=gray`;
  const raw = await run([...decoder, "-ss", sourceStart.toFixed(3), "-i", file, "-t", seconds.toFixed(3), "-vf", filter, "-f", "rawvideo", "-pix_fmt", "gray", "-"], 120_000);
  const frameBytes = outWidth * outHeight;
  const frames = Math.floor(raw.length / frameBytes);
  const values: number[] = [];
  for (let frame = 1; frame < frames; frame += 1) {
    let changed = 0;
    const a = (frame - 1) * frameBytes;
    const b = frame * frameBytes;
    for (let pixel = 0; pixel < frameBytes; pixel += 1) {
      if (Math.abs(raw[b + pixel]! - raw[a + pixel]!) > DIFF_THRESHOLD) changed += 1;
    }
    values.push(changed / frameBytes);
  }
  // values[i] is the change between frames i and i+1: centred at sourceStart + (i + 1) / fps.
  return { fps, start: sourceStart + 0.5 / fps, values, frames };
}

export type PlacedSound = {
  label: string;
  file: string;
  timeline_start: number;
  source_start: number;
  source_end: number;
  volume: number;
  playback_rate: number;
  volume_envelope?: Array<{ time_seconds: number; volume: number }>;
};

const ENVELOPE_SAMPLE_RATE = 32_000;

function envelopeVolume(sound: PlacedSound, local: number) {
  const points = sound.volume_envelope;
  if (!points?.length) return sound.volume;
  if (local <= points[0]!.time_seconds) return points[0]!.volume;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (local <= right.time_seconds) {
      const span = Math.max(1e-6, right.time_seconds - left.time_seconds);
      return left.volume + (right.volume - left.volume) * ((local - left.time_seconds) / span);
    }
  }
  return points.at(-1)!.volume;
}

/**
 * One sound's linear RMS loudness per timeline bin over [windowStart, windowStart + bins / rate).
 * `highpassHz` measures only the bright part (above that frequency), for timbre changes.
 */
export async function soundEnvelopeOnTimeline(sound: PlacedSound, windowStart: number, rate: number, bins: number, options: { highpassHz?: number } = {}) {
  const filter = options.highpassHz ? ["-af", `highpass=f=${options.highpassHz}:poles=2,highpass=f=${options.highpassHz}:poles=2`] : [];
  const raw = await run(["-ss", sound.source_start.toFixed(4), "-i", sound.file, "-t", Math.max(0.01, sound.source_end - sound.source_start).toFixed(4), ...filter, "-ac", "1", "-ar", String(ENVELOPE_SAMPLE_RATE), "-f", "f32le", "-"]);
  const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const out = new Float64Array(bins);
  const rateFactor = sound.playback_rate > 0 ? sound.playback_rate : 1;
  for (let bin = 0; bin < bins; bin += 1) {
    const t0 = windowStart + bin / rate - sound.timeline_start;
    const t1 = t0 + 1 / rate;
    if (t1 <= 0) continue;
    const from = Math.max(0, Math.floor(Math.max(0, t0) * rateFactor * ENVELOPE_SAMPLE_RATE));
    const to = Math.min(samples.length, Math.floor(t1 * rateFactor * ENVELOPE_SAMPLE_RATE));
    if (to <= from) continue;
    let sum = 0;
    for (let index = from; index < to; index += 1) sum += samples[index]! * samples[index]!;
    out[bin] = Math.sqrt(sum / (to - from)) * envelopeVolume(sound, (t0 + t1) / 2);
  }
  return out;
}

/** Mix of several sounds' envelopes (power sum), on the same bins. */
export function mixEnvelopes(envelopes: readonly Float64Array[], bins: number) {
  const out = new Float64Array(bins);
  for (const envelope of envelopes) for (let index = 0; index < bins; index += 1) out[index] += envelope[index]! * envelope[index]!;
  for (let index = 0; index < bins; index += 1) out[index] = Math.sqrt(out[index]!);
  return out;
}

/** Linear RMS per bin of a mono/stereo WAV or any audio file, from its own time zero. */
export async function fileEnvelope(file: string, rate: number, bins: number, offsetSeconds = 0, options: { highpassHz?: number } = {}) {
  return soundEnvelopeOnTimeline({ label: path.basename(file), file, timeline_start: offsetSeconds, source_start: 0, source_end: offsetSeconds + bins / rate + 1, volume: 1, playback_rate: 1 }, 0, rate, bins, options);
}

const ACTIVITY_TIMEOUT_MS = 10_000;
const MAX_SCENE_BYTES = 40 * 1024 * 1024;

function base64Bytes(text: string) {
  return new Uint8Array(Buffer.from(String(text), "base64"));
}

export type CompositionActivityResult = { rate: number; curves: Record<string, Float64Array>; onsets: Record<string, number[]> };

/**
 * Run a composition's data scripts (e.g. scene.js that sets window.FLIGHT) and then an
 * agent-written `function activity({ window, duration, rate, helpers })` that returns
 * `{ curves: { name: number[] }, onsets?: { name: number[] } }` on the composition clock
 * from 0 at `rate` values per second. Isolated VM: no require, process, timers or network.
 * A determinism boundary, not a security sandbox (the scene and code are local, agent-authored).
 */
export function runCompositionActivity(compositionDir: string, scripts: readonly string[], activityJs: string, duration: number, rate: number): CompositionActivityResult {
  const window: Record<string, unknown> = {};
  const n = Math.max(1, Math.ceil(duration * rate));
  const helpers = Object.freeze({
    curve: () => new Float64Array(n),
    bytes: base64Bytes,
    int16: (text: string) => {
      const bytes = base64Bytes(text);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return Array.from({ length: Math.floor(bytes.byteLength / 2) }, (_, index) => view.getInt16(index * 2, true));
    },
    /** Add `amount` spread evenly over [t0, t1] seconds (per second, so areas add up). */
    spread: (curve: Float64Array, t0: number, t1: number, amount: number) => {
      const a = Math.max(0, Math.floor(t0 * rate));
      const b = Math.min(curve.length - 1, Math.max(a, Math.floor(t1 * rate)));
      if (a >= curve.length) return;
      const per = (amount * rate) / (b - a + 1);
      for (let index = a; index <= b; index += 1) curve[index] += per;
    },
  });
  const context = vm.createContext({ window, Math, Float32Array, Float64Array, Int16Array, Uint8Array, DataView, Array, Number, Object, JSON, Infinity, NaN, isFinite, console: { log() {}, warn() {} } }, { codeGeneration: { strings: false, wasm: false } });
  (context as Record<string, unknown>).globalThis = context;
  let bytes = 0;
  for (const script of scripts) {
    const file = path.resolve(compositionDir, script);
    if (!file.startsWith(compositionDir + path.sep) || !file.endsWith(".js")) throw new Error(`scripts must be .js files inside the composition: ${script}`);
    if (!fs.existsSync(file)) throw new Error(`The composition has no ${script}`);
    const code = fs.readFileSync(file, "utf8");
    bytes += code.length;
    if (bytes > MAX_SCENE_BYTES) throw new Error("The composition's scripts are larger than 40 MB");
    try {
      new vm.Script(code, { filename: script }).runInContext(context, { timeout: ACTIVITY_TIMEOUT_MS });
    } catch (error) {
      throw new Error(`${script} failed outside a browser (${error instanceof Error ? error.message : String(error)}); list only the scripts that define scene data`);
    }
  }
  new vm.Script(activityJs, { filename: "activity.js" }).runInContext(context, { timeout: ACTIVITY_TIMEOUT_MS });
  if (typeof (context as { activity?: unknown }).activity !== "function") throw new Error("activity_js must define function activity({ window, duration, rate, helpers })");
  (context as Record<string, unknown>).__args = Object.freeze({ window, duration, rate, helpers });
  const output = vm.runInContext("activity(__args)", context, { timeout: ACTIVITY_TIMEOUT_MS }) as { curves?: unknown; onsets?: unknown } | null;
  if (!output || typeof output.curves !== "object" || output.curves == null) throw new Error("activity() must return { curves: { name: number[] } }");
  const curves: Record<string, Float64Array> = {};
  for (const [name, values] of Object.entries(output.curves as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) throw new Error(`Curve names use letters, numbers, - or _ (got ${name})`);
    if (!values || typeof (values as ArrayLike<number>).length !== "number") throw new Error(`Curve ${name} must be an array of numbers`);
    const array = Float64Array.from(values as ArrayLike<number>, (value) => (Number.isFinite(value) ? Math.max(0, value) : 0));
    curves[name] = array;
  }
  if (!Object.keys(curves).length) throw new Error("activity() returned no curves");
  const onsets: Record<string, number[]> = {};
  if (output.onsets && typeof output.onsets === "object") {
    for (const [name, values] of Object.entries(output.onsets as Record<string, unknown>)) {
      if (Array.isArray(values)) onsets[name] = Array.from(values as unknown[]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    }
  }
  return { rate, curves, onsets };
}
