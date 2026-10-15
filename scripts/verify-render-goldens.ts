/** Golden-scene renderer parity. Fixed composite scenes render through Standard and the
 * CanvasKit GPU export path from /render-frame (the export capture path), then:
 *   1. GPU vs Standard on this machine: p99 and mean channel difference within tolerance.
 *   2. Each renderer vs committed per-platform goldens (regression; bless with GOLDEN_BLESS=1).
 *   3. A perturbed scene must fail the golden comparison, proving the metric can see change.
 * Requires a running editor (pnpm dev). Receipt: testing/results/render-goldens/receipt.json. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {VideoRenderSession} from "../src/lib/render/browser-renderer";
import type {CompositionElement} from "../src/lib/render/composition-adapters";
import {gpuSceneCapabilityIssues} from "../src/lib/gpu-preview/scene";

const base = process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3123";
const bless = process.env.GOLDEN_BLESS === "1";
const SIZE = 160, FPS = 30, DURATION_FRAMES = 120;
const platform = `${os.platform()}-${os.arch()}`;
const goldens = path.resolve("testing/goldens/render-scenes", platform);
const output = path.resolve("testing/results/render-goldens");
/** Renderers differ in rasterisation and filtering. Measured on macOS arm64 2026-10-10:
 * p99 ≤ 1, mean ≤ 0.15. The bound leaves room for other GPUs, not for visible change. */
const CROSS = {p99: 4, mean: 1};
/** Same machine, same renderer: only nondeterminism may differ. */
const GOLDEN = {p99: 2, mean: .25};
const fixture = (name: string) => `${base}/fixtures/golden-scenes/${name}.svg`;

function still(id: string, url: string, lane: number, props: Record<string, unknown> = {}, timing = {start: 0, duration: 4}): CompositionElement {
  return {id, type: "still", source_url: url, timeline_start: timing.start, duration: timing.duration, lane_key: `visual_${lane}`, lane_index: lane,
    volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0, props: {source_width: SIZE, source_height: SIZE, ...props}};
}
const backdrop = () => still("backdrop", fixture("backdrop"), 1);
const lanes = ["visual_0", "visual_1"];

function fadeScene() {
  const now = "2026-10-10T00:00:00.000Z";
  const transition = {id: "fade", project_id: "goldens", from_element_id: "outgoing", to_element_id: "incoming", type: "fade" as const,
    duration_seconds: 1, params: null, removed_at: null, removed_reason: null, created_at: now, updated_at: now};
  return [
    {...still("outgoing", fixture("subject"), 0, {}, {start: 0, duration: 2}), transition_out: transition},
    {...still("incoming", fixture("incoming"), 0, {}, {start: 2, duration: 2}), transition_in: transition},
  ];
}

type Scene = {name: string; elements: CompositionElement[]; laneOrderKeys: string[]; frames: number[]};
const SCENES: Scene[] = [
  {name: "opacity", elements: [still("subject", fixture("subject"), 0, {media_opacity: .6}), backdrop()], laneOrderKeys: lanes, frames: [10]},
  {name: "transform", elements: [still("subject", fixture("subject"), 0, {media_scale: 1.3, media_offset_x: .2, media_offset_y: -.1}), backdrop()], laneOrderKeys: lanes, frames: [10]},
  {name: "blend-difference", elements: [still("subject", fixture("subject"), 0, {media_blend_mode: "difference"}), backdrop()], laneOrderKeys: lanes, frames: [10]},
  {name: "fade-transition", elements: fadeScene(), laneOrderKeys: ["visual_0"], frames: [35, 45, 55, 65]},
  {name: "caption", elements: [{...still("caption", null as unknown as string, 2), type: "caption_text", source_url: null, lane_key: "captions_0",
    props: {text: "PARITY", fontPreset: "sans", fontSizePx: 30, fontSizing: "fixed", textColor: "#ffffff", textAlign: "center", absX: .5, absY: .5, maxWidth: .9, singleLine: true, animationIn: "none", animationOut: "none"}}, backdrop()],
    laneOrderKeys: ["captions_0", ...lanes], frames: [10]},
  {name: "entrance-animation", elements: [still("subject", fixture("subject"), 0, {animationIn: "fade", animationInDuration: .5}), backdrop()], laneOrderKeys: lanes, frames: [4, 9]},
];
/** Same scene with a 6% opacity change: the golden comparison must reject it. */
const PERTURBED: Scene = {...SCENES[0], name: "opacity-perturbed", elements: [still("subject", fixture("subject"), 0, {media_opacity: .66}), backdrop()]};

/** Per-pixel max channel difference: mean over channels, and the 99th percentile over pixels. */
function difference(a: Buffer, b: Buffer) {
  assert.equal(a.length, b.length, "Frame sizes differ");
  const perPixel = new Uint8Array(a.length / 3);
  let sum = 0;
  for (let i = 0, p = 0; i < a.length; i += 3, p++) {
    let max = 0;
    for (let j = 0; j < 3; j++) { const d = Math.abs(a[i + j] - b[i + j]); sum += d; max = Math.max(max, d); }
    perPixel[p] = max;
  }
  const sorted = [...perPixel].sort((x, y) => x - y);
  return {mean: sum / a.length, p99: sorted[Math.floor(sorted.length * .99)], max: sorted.at(-1)!};
}
const within = (d: ReturnType<typeof difference>, limit: {p99: number; mean: number}) => d.p99 <= limit.p99 && d.mean <= limit.mean;
const rgb = (png: Buffer) => sharp(png).removeAlpha().raw().toBuffer();

async function capture(session: VideoRenderSession, scene: Scene, gpu: boolean) {
  const {pages, errors} = await session.acquire({baseUrl: base, outputLocation: "", width: SIZE, height: SIZE, fps: FPS, durationInFrames: DURATION_FRAMES,
    inputProps: {elements: scene.elements, laneOrderKeys: scene.laneOrderKeys}, gpu}, 1, 1);
  try {
    const shots: Buffer[] = [];
    for (const frame of scene.frames) {
      await pages[0].evaluate(n => window.__dreamcutRender!.frame(n), frame);
      shots.push(await pages[0].screenshot({clip: {x: 0, y: 0, width: SIZE, height: SIZE}, type: "png", animations: "allow"}));
    }
    assert.deepEqual(errors, [], `${scene.name}: page errors`);
    return shots;
  } finally { session.release(); }
}

async function main() {
  fs.mkdirSync(output, {recursive: true});
  if (bless) fs.mkdirSync(goldens, {recursive: true});
  // A platform without blessed goldens still enforces renderer parity; goldens are opt-in per machine.
  const goldensAvailable = fs.existsSync(goldens);
  if (!goldensAvailable) console.log(`No goldens for ${platform}; checking renderer parity only. Bless with GOLDEN_BLESS=1.`);
  for (const scene of SCENES) {
    const issues = gpuSceneCapabilityIssues(scene.elements as never, "goldens", "canvaskit");
    assert.deepEqual(issues, [], `${scene.name} is not GPU-admissible; fix the scene or the renderer`);
  }
  const session = new VideoRenderSession();
  const rows: Array<Record<string, unknown>> = [];
  let failed = false;
  try {
    for (const scene of [...SCENES, PERTURBED]) {
      const shots = {standard: await capture(session, scene, false), gpu: await capture(session, scene, true)};
      for (const [index, frame] of scene.frames.entries()) {
        const row: Record<string, unknown> = {scene: scene.name, frame};
        const [standard, gpu] = [await rgb(shots.standard[index]), await rgb(shots.gpu[index])];
        for (const [renderer, png] of Object.entries(shots)) fs.writeFileSync(path.join(output, `${scene.name}-${renderer}-f${frame}.png`), png[index]);
        const cross = difference(standard, gpu);
        row.cross = cross;
        const perturbed = scene === PERTURBED;
        if (!perturbed && !within(cross, CROSS)) { failed = true; row.cross_failed = true; }
        for (const renderer of goldensAvailable ? ["standard", "gpu"] as const : []) {
          const name = `${perturbed ? SCENES[0].name : scene.name}-${renderer}-f${frame}.png`;
          const golden = path.join(goldens, name);
          if (bless && !perturbed) { fs.writeFileSync(golden, shots[renderer][index]); continue; }
          if (!fs.existsSync(golden)) { row[`${renderer}_golden`] = "missing"; failed = true; continue; }
          const d = difference(await rgb(fs.readFileSync(golden)), renderer === "standard" ? standard : gpu);
          row[`${renderer}_golden`] = d;
          // The perturbed scene proves sensitivity: matching its unperturbed golden is a failure.
          if (perturbed ? within(d, GOLDEN) : !within(d, GOLDEN)) { failed = true; row[`${renderer}_golden_failed`] = true; }
        }
        rows.push(row);
      }
    }
  } finally { await session.close(); }
  const receipt = {date: new Date().toISOString(), platform, blessed: bless, goldens: fs.existsSync(goldens), tolerances: {cross: CROSS, golden: GOLDEN}, ok: !failed, rows};
  fs.writeFileSync(path.join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  for (const row of rows) console.log(JSON.stringify(row));
  assert.ok(!failed, "Render goldens failed; see testing/results/render-goldens/receipt.json");
}

main().catch(error => { console.error(error); process.exit(1); });
