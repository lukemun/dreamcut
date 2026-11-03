/** Original synthetic assets; production proposal derivation and Browser GPU pixels.
 * No user project or course media is read or changed. Run with tsx against pnpm dev.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { editorAgentOptionSchema, deriveProposalTimeline } from "../src/lib/agent/timeline-editor-agent-apply";
import { validateBlockRanges, setBlockSetting, type BlockInstance } from "../src/lib/agent/proposal-blocks";
import { writePreparation } from "../src/lib/local-store/media-preparation";
import { projectMediaDir } from "../src/lib/local-store/paths";
import { buildCompositionElements } from "../src/lib/render/composition-adapters";
import type { TimelineFile } from "../src/lib/local-store/store";

async function main() {
const baseUrl = process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3129";
const out = path.resolve(process.env.CLEAN_PLATE_PROOF_OUT ?? "testing/results/clean-plate-reveal/latest");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-clean-plate-proof-"));
process.env.TIMELINE_PROJECTS_DIR = scratch;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.DREAMCUT_CHROME_EXECUTABLE ? { executablePath: process.env.DREAMCUT_CHROME_EXECUTABLE } : { channel: "chrome" }), args: ["--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required"] });
const results: unknown[] = [];
try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/render-frame`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__dreamcutRender));
  for (const [width, height] of [[320, 180], [180, 320]]) {
    // Record two matched, original canvas takes. Yellow actor moves outside the
    // patch; the red prop exists throughout the hero, including before the cue.
    const media = await page.evaluate(async ({ width, height }) => {
      const captures = [true, false].map(hero => {
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        const draw = (frame: number) => {
          ctx.fillStyle = "rgb(60,90,110)"; ctx.fillRect(0, 0, width, height);
          ctx.strokeStyle = "rgb(75,105,125)";
          for (let y = 0; y < height; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
          if (hero) {
            ctx.fillStyle = "rgb(230,30,40)"; ctx.fillRect(width * .65, height * .55, width * .1, height * .15);
            ctx.fillStyle = "rgb(240,220,20)"; ctx.fillRect(width * (.08 + frame * .001), height * .12, width * .1, height * .15);
          }
        };
        draw(0);
        const stream = canvas.captureStream(30), chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 3_000_000 });
        recorder.ondataavailable = event => chunks.push(event.data);
        const done = new Promise<string>(resolve => { recorder.onstop = async () => {
          const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
          let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
          stream.getTracks().forEach(track => track.stop()); resolve(btoa(binary));
        }; });
        recorder.start();
        return { draw, recorder, done };
      });
      for (let frame = 1; frame <= 75; frame++) { captures.forEach(c => c.draw(frame)); await new Promise(resolve => setTimeout(resolve, 1000 / 30)); }
      captures.forEach(c => c.recorder.stop());
      return Promise.all(captures.map(c => c.done));
    }, { width, height });
    const project = `synthetic-${width}x${height}`;
    for (const [index, name] of ["hero.webm", "plate.webm"].entries()) {
      const file = path.join(projectMediaDir(project), name);
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(media[index]!, "base64"));
      const stat = fs.statSync(file);
      writePreparation(project, { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name, render: name, duration: 2.5, alpha: false });
    }
    const block: BlockInstance = { block_id: "appear", kind: "clean_plate_reveal", version: 1, seed: project, frame_rate: 30, settings: {}, inputs: {
      hero: { source_url: `/api/projects/${project}/media/hero.webm`, source_duration_seconds: 2.5 },
      clean_plate: { source_url: `/api/projects/${project}/media/plate.webm`, source_duration_seconds: 2.5 },
      duration_seconds: 2, reveal_seconds: 1,
      patch: { left: .55, right: .85, top: .45, bottom: .8 }, lane_order_keys: ["visual_1", "visual_0"],
    } };
    validateBlockRanges(block);
    const frames: Buffer[] = [];
    for (const shift of [0, -10, 10]) {
      const tuned = setBlockSetting(block, "reveal_shift_frames", shift);
      const option = editorAgentOptionSchema.parse({ id: "reveal", label: "Object Appear", summary: "Reveal", recommended: true, operations: [], blocks: [tuned] });
      const derived = deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option.operations, project);
      const elements = buildCompositionElements(derived.timeline.elements, new Set()).map(element => {
        const index = element.props?.title === "Continuous performance" ? 0 : 1;
        const url = `data:video/webm;base64,${media[index]}`;
        return { ...element, source_url: url, props: { ...element.props, source_width: width, source_height: height, preview_source_url: url, archival_source_url: url } };
      });
      await page.evaluate(config => window.__dreamcutRender!.load(config), { gpu: true, width, height, fps: 30, durationInFrames: 60, inputProps: { elements, laneOrderKeys: ["visual_1", "visual_0"] } });
      const reveal = 30 + shift, pixels = new Map<number, Buffer>();
      // Every output frame, plus reverse seeks around the boundary.
      for (const frame of [...Array.from({ length: 60 }, (_, f) => f), reveal - 1, reveal, reveal + 1, 0]) {
        await page.evaluate(frame => window.__dreamcutRender!.frame(frame), frame);
        const png = Buffer.from(await page.evaluate(() => (document.getElementById("dreamcut-gpu-export") as HTMLCanvasElement).toDataURL("image/png").split(",")[1]!), "base64");
        const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const at = (x: number, y: number) => [...data.subarray((Math.floor(y * height) * info.width + Math.floor(x * width)) * 4, (Math.floor(y * height) * info.width + Math.floor(x * width)) * 4 + 3)];
        const prop = at(.7, .62);
        assert.ok(frame < reveal ? prop[0]! < 100 : prop[0]! > 180 && prop[1]! < 80, `${project} shift ${shift} frame ${frame}: prop ${prop}`);
        const actorVisible = Array.from({ length: Math.floor(width * .3) }, (_, x) => at(x / width, .18)).some(p => p[0]! > 170 && p[1]! > 150 && p[2]! < 80);
        assert.ok(actorVisible, `Continuous actor disappeared at ${frame}`);
        if (pixels.has(frame)) assert.deepEqual(data, pixels.get(frame), `Random seek changed frame ${frame}`);
        pixels.set(frame, data);
        if (shift === 0 && [reveal - 1, reveal, reveal + 1].includes(frame) && frames.length < 3) { frames.push(png); fs.writeFileSync(path.join(out, `${project}-${frame}.png`), png); }
      }
      results.push({ project, width, height, shift_frames: shift, reveal_frame: reveal, inspected_frames: 60, reverse_seek_identity: true, prop_boundary: "pass", actor_continuity: "pass", dial_range_compile: "pass" });
    }
    await sharp({ create: { width: width * 3, height, channels: 4, background: "black" } }).composite(frames.map((input, i) => ({ input, left: i * width, top: 0 }))).png().toFile(path.join(out, `${project}-boundary.png`));
  }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ renderer: "production Browser GPU", inputs: "original synthetic canvas videos; construction-only", results, limits: ["No real-footage fresh-input certification", "No continuous human playback or listening check", "Static rectangular patch; moving camera, exposure changes and foreground crossings require additional treatment"] }, null, 2));
  console.log(JSON.stringify({ output: out, results }, null, 2));
} finally { await browser.close(); fs.rmSync(scratch, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
