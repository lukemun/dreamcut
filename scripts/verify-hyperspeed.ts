/** Original synthetic takes, native proposal derivation and Browser GPU frame proof.
 * No user timeline or private course asset is changed. Construction-only evidence.
 * Start an isolated dev server; TIMELINE_EDITOR_BASE_URL defaults to :3137.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { Input, ALL_FORMATS, BufferSource, Output, BufferTarget, WebMOutputFormat, EncodedVideoPacketSource, EncodedPacketSink } from "mediabunny";
import { editorAgentOptionSchema, deriveProposalTimeline } from "../src/lib/agent/timeline-editor-agent-apply";
import { writePreparation } from "../src/lib/local-store/media-preparation";
import { projectMediaDir } from "../src/lib/local-store/paths";
import { buildCompositionElements } from "../src/lib/render/composition-adapters";
import { hyperspeedWindows, hyperspeedInputs } from "../src/lib/agent/proposal-blocks-hyperspeed";

async function main() {
const out = path.resolve(process.env.HYPERSPEED_PROOF_OUT ?? "testing/results/hyperspeed/latest");
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-hyperspeed-proof-"));
process.env.TIMELINE_PROJECTS_DIR = scratch;
const browser = await chromium.launch({ executablePath: process.env.DREAMCUT_CHROME_EXECUTABLE ?? "/tmp/dreamcut-effect-browsers/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const results: unknown[] = [];
try {
 const page = await browser.newPage();
 await page.addInitScript("window.__name = (fn) => fn;");
 await page.goto(`${process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3137"}/render-frame`, { waitUntil: "networkidle" });
 await page.waitForFunction(() => Boolean(window.__dreamcutRender));
 for (const [width, height, seconds] of [[320, 180, 11], [180, 320, 14]]) {
  const cachedInput = path.join(out, `hyperspeed-${width}x${height}-input.webm`);
  let base64 = fs.existsSync(cachedInput) ? fs.readFileSync(cachedInput).toString("base64") : await page.evaluate(async ({ width, height, seconds }) => {
   const c = document.createElement("canvas"); c.width = width; c.height = height;
   const ctx = c.getContext("2d", { alpha: false })!;
   const draw = (f: number) => {
    ctx.fillStyle = "rgb(30,55,75)"; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgb(80,90,110)"; for (let x = 0; x < width; x += 20) ctx.fillRect(x, 0, 2, height);
    // Continuous actor sweeps out and back, with legible source-frame label.
    const t = f / (seconds * 30), x = (0.1 + .7 * Math.sin(Math.PI * t)) * width;
    ctx.fillStyle = "rgb(240,210,20)"; ctx.fillRect(x, height * .4, width * .08, height * .2);
    ctx.fillStyle = "white"; ctx.font = "14px monospace"; ctx.fillText(`source ${f}`, 5, 18);
   };
   draw(0); const stream = c.captureStream(30), chunks: Blob[] = [];
   const r = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 2_000_000 });
   r.ondataavailable = e => chunks.push(e.data);
   const done = new Promise<string>(resolve => { r.onstop = async () => { let b = ""; for (const v of new Uint8Array(await new Blob(chunks).arrayBuffer())) b += String.fromCharCode(v); stream.getTracks().forEach(t => t.stop()); resolve(btoa(b)); }; });
   r.start(); for (let f = 1; f <= seconds * 30; f++) { draw(f); await new Promise(resolve => setTimeout(resolve, 1000 / 30)); }
   r.stop(); return done;
  }, { width, height, seconds });
  // MediaRecorder marks an opaque canvas as AlphaMode=1 without an alpha plane.
  // Normalize that erroneous declaration on these original synthetic fixtures.
  const normalized = Buffer.from(base64, "base64");
  const alphaMode = normalized.indexOf(Buffer.from([0x53, 0xc0, 0x81, 0x01]));
  if (alphaMode >= 0) normalized[alphaMode + 3] = 0;
  const recorded = new Input({ formats: ALL_FORMATS, source: new BufferSource(normalized) });
  const track = (await recorded.getPrimaryVideoTrack())!;
  const sink = new EncodedPacketSink(track), target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const packetSource = new EncodedVideoPacketSource((await track.getCodec())!);
  output.addVideoTrack(packetSource, { frameRate: 30 }); await output.start();
  const decoderConfig = (await track.getDecoderConfig())!;
  let count = 0;
  for await (const packet of sink.packets()) {
    await packetSource.add(packet.clone({ timestamp: count / 30, duration: 1 / 30 }), count === 0 ? { decoderConfig } : undefined); count++;
  }
  await output.finalize(); recorded.dispose();
  const sourceSeconds = count / 30;
  base64 = Buffer.from(target.buffer!).toString("base64");
  const project = `hyperspeed-${width}x${height}`, media = projectMediaDir(project);
  fs.mkdirSync(media, { recursive: true }); const bytes = Buffer.from(base64, "base64");
  fs.writeFileSync(path.join(media, "take.webm"), bytes);
  fs.writeFileSync(path.join(out, `${project}-input.webm`), bytes);
  const stat = fs.statSync(path.join(media, "take.webm"));
  writePreparation(project, { recipe: "editor-media-v1", source: "take.webm", size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: "take.webm", render: "take.webm", duration: sourceSeconds, alpha: false });
  const inputs = hyperspeedInputs.parse({ source: { source_url: `/api/projects/${project}/media/take.webm`, source_duration_seconds: sourceSeconds, source_end_seconds: sourceSeconds }, fast_start_source_seconds: 1, fast_end_source_seconds: seconds - 1 });
  const windows = hyperspeedWindows(inputs, 15, 30);
  const option = editorAgentOptionSchema.parse({ id: "hyper", label: "Hyperspeed", summary: "Bounded continuous performance", recommended: true, operations: [], blocks: [{ block_id: "hyper", kind: "hyperspeed", version: 1, seed: project, frame_rate: 30, inputs, settings: { blur: 5 } }] });
  fs.writeFileSync(path.join(out, `${project}-option.json`), JSON.stringify(option, null, 2));
  const derived = deriveProposalTimeline({ elements: [], transitions: [] }, option.operations, project);
  const url = `data:video/webm;base64,${base64}`;
  const elements = buildCompositionElements(derived.timeline.elements, new Set()).map(el => ({ ...el, source_url: url, props: { ...el.props, source_width: width, source_height: height, preview_source_url: url, archival_source_url: url } }));
  const frames = Math.round((windows[2]!.at + windows[2]!.duration) * 30);
  await page.evaluate(config => window.__dreamcutRender!.load(config), { gpu: true, width, height, fps: 30, durationInFrames: frames, inputProps: { elements, laneOrderKeys: ["visual_0"] } });
  const pngs: Buffer[] = [], checks: { frame: number; source: number }[] = [];
  for (let frame = 0; frame < frames; frame++) {
   await page.evaluate(f => window.__dreamcutRender!.frame(f), frame);
   const png = Buffer.from(await page.evaluate(() => (document.getElementById("dreamcut-gpu-export") as HTMLCanvasElement).toDataURL("image/png").split(",")[1]!), "base64");
   pngs.push(png);
   const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
   assert.ok(data.some(v => v > 120), `Blank frame ${frame}`);
   const w = windows.find(w => frame / 30 >= w.at - 1e-6 && frame / 30 < w.at + w.duration - 1e-6)!;
   checks.push({ frame, source: w.start + (frame / 30 - w.at) * w.rate });
  }
  const boundaries = [29, 30, Math.round(windows[2]!.at * 30) - 1, Math.round(windows[2]!.at * 30)];
  for (const frame of [...boundaries].reverse()) {
   await page.evaluate(f => window.__dreamcutRender!.frame(f), frame);
   const png = Buffer.from(await page.evaluate(() => (document.getElementById("dreamcut-gpu-export") as HTMLCanvasElement).toDataURL("image/png").split(",")[1]!), "base64");
   assert.deepEqual(png, pngs[frame], `Reverse seek changed frame ${frame}`);
  }
  await sharp({ create: { width: width * 4, height, channels: 4, background: "black" } }).composite(boundaries.map((f, i) => ({ input: pngs[f]!, left: i * width, top: 0 }))).png().toFile(path.join(out, `${project}-boundaries.png`));
  // Encode the actual captured native frames, never a separate retime implementation.
  const encoded = path.join(out, `${project}-result.webm`);
  const proc = spawnSync(process.env.HYPERSPEED_FFMPEG ?? "/tmp/dreamcut-effect-browsers/ffmpeg-1013/ffmpeg-mac", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg", "-i", "pipe:0", "-c:v", "libvpx-vp9", "-b:v", "1500k", encoded], { input: Buffer.concat(await Promise.all(pngs.map(png => sharp(png).jpeg({ quality: 95 }).toBuffer()))), maxBuffer: 8_000_000 });
  assert.equal(proc.status, 0, proc.stderr?.toString());
  const proof = new Input({ formats: ALL_FORMATS, source: new BufferSource(fs.readFileSync(encoded)) });
  const proofTrack = (await proof.getPrimaryVideoTrack())!;
  const stats = await proofTrack.computePacketStats();
  assert.equal(stats.packetCount, frames); proof.dispose();
  const playback = await page.evaluate(async base64 => {
    const video = document.createElement("video"); video.src = `data:video/webm;base64,${base64}`; video.muted = true;
    let decoded = 0;
    const next = () => { decoded++; if (!video.ended) video.requestVideoFrameCallback(next); };
    video.requestVideoFrameCallback(next);
    const ended = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Encoded playback did not finish")), 10_000);
      video.onended = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error("Encoded playback failed")); };
    });
    await video.play(); await ended;
    return { ended: video.ended, decoded_callbacks: decoded, duration: video.duration };
  }, fs.readFileSync(encoded).toString("base64"));
  assert.ok(playback.ended && playback.decoded_callbacks > frames / 2);
  results.push({ width, height, playback, source_seconds: sourceSeconds, source_frames: count, source_sha256: createHash("sha256").update(bytes).digest("hex"), frames, windows, all_frames_nonblank: true, repeated_boundary_seeks_identical: true, encoding_exit: proc.status, encoding_error: proc.stderr?.toString(), frame_source_map: checks });
 }
 fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ stage: "native construction proof", results, limits: ["Synthetic takes, not fresh real footage or fresh agent", "Directional spatial blur; temporal blending unimplemented", "Continuous audiovisual review and UI undo not performed"] }, null, 2));
 console.log(JSON.stringify({ out, results: results.map(({ frame_source_map, ...r }: any) => r) }, null, 2));
} finally { await browser.close(); fs.rmSync(scratch, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
