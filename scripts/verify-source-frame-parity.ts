/** Source-frame parity: the exported picture shows the source frame the preview proxy showed.
 * Each source frame is a flat grey of level 2i, so a decoded pixel names its source frame.
 * Preview truth comes from the production proxy filter; export truth from the real Standard
 * and GPU exports. Requires a running editor (pnpm dev). Receipt: testing/results/source-frame-parity. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {renderBrowserVideo} from "../src/lib/render/browser-renderer";
import type {CompositionElement} from "../src/lib/render/composition-adapters";
import {previewProxyFpsFilter} from "../src/lib/timeline/source-sampling";

const base = process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3123";
const output = path.resolve("testing/results/source-frame-parity");
const SIZE = 64, SOURCE_FRAMES = 120, TIMELINE_SECONDS = 1.5;
fs.mkdirSync(output, {recursive: true});

function run(args: string[], input?: Buffer) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], {input, maxBuffer: 256 * 1024 * 1024});
  assert.equal(result.status, 0, `ffmpeg ${args.join(" ")}\n${result.stderr}`);
  return result.stdout;
}

/** Centre-pixel grey of each frame, as a source frame index. */
function frameIndices(file: string, width: number, height: number) {
  const raw = run(["-i", file, "-vf", "format=gray", "-f", "rawvideo", "-"]);
  const frame = width * height, centre = Math.floor(height / 2) * width + Math.floor(width / 2);
  return Array.from({length: raw.length / frame}, (_, i) => Math.round(raw[i * frame + centre] / 2));
}

function indexedSource(name: string, rate: string) {
  const file = path.join(output, `${name}-source.mp4`);
  const raw = Buffer.concat(Array.from({length: SOURCE_FRAMES}, (_, i) => Buffer.alloc(SIZE * SIZE, 2 * i)));
  // High-profile 4:2:0 so Chromium decodes it; flat greys survive at this quality.
  run(["-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${SIZE}x${SIZE}`, "-r", rate, "-i", "-",
    "-c:v", "libx264", "-crf", "4", "-pix_fmt", "yuv420p", "-g", "12", "-movflags", "+faststart", file], raw);
  return file;
}

/** The proxy at the project rate, made with the production filter: what preview shows. */
function previewTruth(source: string, name: string, fps: number) {
  const proxy = path.join(output, `${name}-proxy.mp4`);
  run(["-y", "-i", source, "-vf", previewProxyFpsFilter(fps), "-c:v", "libx264", "-crf", "4", "-pix_fmt", "yuv420p", "-g", String(fps), proxy]);
  return frameIndices(proxy, SIZE, SIZE);
}

/** A prepared clip: its receipt says preview used a proxy at the project rate. */
function clip(source: string, trimStartFrames: number, fps: number, sourceRate: string): CompositionElement {
  const [num, den = 1] = sourceRate.split("/").map(Number);
  return {id: "indexed", type: "video_clip", source_url: `data:video/mp4;base64,${fs.readFileSync(source).toString("base64")}`,
    timeline_start: 0, duration: TIMELINE_SECONDS, lane_key: "visual_0", lane_index: 0, volume: 0, playback_rate: 1,
    trim_start: trimStartFrames / fps, trim_end: 0, fade_in: 0, fade_out: 0,
    props: {source_duration_seconds: SOURCE_FRAMES * den / num, objectFit: "fill",
      preview_proxy_validation: {contract: "preview-proxy-v1", url: "proxy", ok: true, width: SIZE, height: SIZE, frame_rate: fps}}} as CompositionElement;
}

/** [name, source rate, trim in project frames, project frame rate] */
const cases: Array<[string, string, number, number]> = [
  ["29.97", "30000/1001", 0, 30], ["29.97-trim", "30000/1001", 7, 30], ["23.976", "24000/1001", 0, 30],
  ["29.97-in-24", "30000/1001", 0, 24], ["23.976-in-24", "24000/1001", 3, 24], ["29.97-in-60", "30000/1001", 0, 60], ["59.94-in-60", "60000/1001", 0, 60],
];
async function main() {
  const receipt: Record<string, unknown> = {};
  let failed = false;
  for (const [name, rate, trim, fps] of cases) {
    const frames = Math.round(TIMELINE_SECONDS * fps);
    const source = indexedSource(name, rate);
    const preview = previewTruth(source, name, fps);
    const expected = Array.from({length: frames}, (_, frame) => preview[Math.min(preview.length - 1, trim + frame)]);
    for (const gpu of [false, true]) {
      const renderer = gpu ? "gpu" : "standard";
      const video = path.join(output, `${name}-${renderer}.mp4`);
      await renderBrowserVideo({baseUrl: base, outputLocation: video, width: SIZE, height: SIZE, fps, durationInFrames: frames,
        inputProps: {elements: [clip(source, trim, fps, rate)], laneOrderKeys: ["visual_0"]}, pictureOnly: true, gpu, crf: 4, concurrency: 1});
      const exported = frameIndices(video, SIZE, SIZE);
      const mismatches = expected.map((frame, i) => [i, frame, exported[i]]).filter(([, a, b]) => a !== b);
      receipt[`${name}/${renderer}`] = {fps, frames: exported.length, mismatches: mismatches.length, first: mismatches.slice(0, 5)};
      if (mismatches.length || exported.length !== frames) failed = true;
    }
  }
  fs.writeFileSync(path.join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  assert.equal(failed, false, "An export showed a different source frame from preview");
}

main().catch(error => { console.error(error); process.exit(1); });
