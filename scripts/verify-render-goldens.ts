/** Golden-scene renderer parity. Fixed composite scenes render through Standard and the
 * CanvasKit GPU export path from /render-frame (the export capture path), and through the
 * GPU preview player (/playback-proof: the preview worker, paused at each frame), then:
 *   1. GPU vs Standard on this machine: p99 and mean channel difference within tolerance.
 *   2. GPU preview vs GPU export: the same tolerance (preview must match export).
 *   3. Each renderer vs committed per-platform goldens (regression; bless with GOLDEN_BLESS=1).
 *   4. A perturbed scene must fail the golden comparison, proving the metric can see change.
 *   5. Shape geometry through one rasterizer: Chrome draws Standard's shape markup and the outlines
 *      CanvasKit fills (canvaskit-shape.ts), and they must agree under the strict tolerance.
 * Requires a running editor: the stable one on 3123 by default, which rebuilds from the working tree
 * a few minutes after edits settle (`pnpm editor:status` says when it serves the current code). To
 * check renderer edits right away, run `pnpm dev` and set TIMELINE_EDITOR_BASE_URL=http://127.0.0.1:3129.
 * Receipt: testing/results/render-goldens/receipt.json. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {chromium} from "playwright-core";
import {VideoRenderSession} from "../src/lib/render/browser-renderer";
import type {CompositionElement} from "../src/lib/render/composition-adapters";
import {gpuSceneCapabilityIssues} from "../src/lib/gpu-preview/scene";
import CanvasKitInit from "canvaskit-wasm";
import {CanvasKitShapePaths} from "../src/lib/gpu-preview/canvaskit-shape";
import {shapeFrameInTimeline, type ShapeFrame} from "../src/lib/timeline/shapes";

const base = process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3123";
const bless = process.env.GOLDEN_BLESS === "1";
const SIZE = 160, FPS = 30, DURATION_FRAMES = 120;
const platform = `${os.platform()}-${os.arch()}`;
const goldens = path.resolve("testing/goldens/render-scenes", platform);
const output = path.resolve("testing/results/render-goldens");
/** Renderers differ in rasterisation and filtering. Measured on macOS arm64 2026-10-10:
 * p99 ≤ 1, mean ≤ 0.15. The bound leaves room for other GPUs, not for visible change. */
const CROSS = {p99: 4, mean: 1};
/** GPU vs Standard on shape scenes only. Both rasterize paths with 4-sample coverage, but CanvasKit on
 * WebGL uses the pattern flipped vertically for some path sizes, so an edge pixel can differ by one
 * sample: a quarter of full contrast, 255 / 4 ≈ 64 levels. Measured 2026-10-25: p99 41 and 30 at most.
 * Geometry is checked separately and strictly (shapeGeometry), so a wrong outline still fails. */
const SHAPE_CROSS = {p99: 64, mean: 1};
const isShapeScene = (name: string) => name.startsWith("shape-");
/** Same machine, same renderer: only nondeterminism may differ. */
const GOLDEN = {p99: 2, mean: .25};
const fixture = (name: string) => `${base}/fixtures/golden-scenes/${name}.svg`;

function still(id: string, url: string, lane: number, props: Record<string, unknown> = {}, timing = {start: 0, duration: 4}): CompositionElement {
  return {id, type: "still", source_url: url, timeline_start: timing.start, duration: timing.duration, lane_key: `visual_${lane}`, lane_index: lane,
    volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0, props: {source_width: SIZE, source_height: SIZE, ...props}};
}
const backdrop = () => still("backdrop", fixture("backdrop"), 1);
/** A shape drawn from its numbers (timeline/shapes.ts). Sizes are shares of the canvas height; stroke widths are 1080p pixels. */
function shape(id: string, lane: number, props: Record<string, unknown>, timing = {start: 0, duration: 4}): CompositionElement {
  return {id, type: "shape", source_url: null, timeline_start: timing.start, duration: timing.duration, lane_key: `visual_${lane}`, lane_index: lane,
    volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0, props: {title: id, ...props}};
}
/** A decoded video clip: the same fixture serves as source (export) and as its verified proxy (preview). */
function video(id: string, file: string, lane: number, alpha: boolean, props: Record<string, unknown> = {}): CompositionElement {
  const url = `${base}/fixtures/golden-scenes/${file}`;
  return {id, type: "video_clip", source_url: url, timeline_start: 0, duration: 4, lane_key: `visual_${lane}`, lane_index: lane,
    volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0, props: {source_width: SIZE, source_height: SIZE, source_duration_seconds: 4,
      has_alpha: alpha, preview_source_url: url, preview_proxy_validation: {contract: "preview-proxy-v1", url, ok: true, width: SIZE, height: SIZE, quality: "hd"}, ...props}};
}
const ink = [{closed: false, points: [{x: -.45, y: .3, out: [.1, -.5]}, {x: 0, y: -.2, in: [-.2, 0], out: [.2, 0]}, {x: .45, y: .35, in: [-.05, -.5]}]},
  {closed: true, points: [{x: -.2, y: -.4}, {x: .2, y: -.42}, {x: .05, y: -.1}]}];
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
  {name: "shape-fill", elements: [shape("star", 0, {shape_kind: "star", shape_width: .7, shape_height: .7, shape_sides: 5, shape_star_depth: .45, shape_fill: "#ffcc00", shape_stroke: null}), backdrop()], laneOrderKeys: lanes, frames: [10]},
  {name: "shape-stroke", elements: [shape("frame", 0, {shape_kind: "rect", shape_width: .6, shape_height: .45, shape_corner_radius: .25, shape_fill: null, shape_stroke: "#ffffff", shape_stroke_width: 40, media_rotation: 8}), backdrop()], laneOrderKeys: lanes, frames: [10]},
  {name: "shape-ink", elements: [shape("ink", 0, {shape_kind: "path", shape_width: .8, shape_height: .7, shape_contours: ink, shape_fill: null, shape_stroke: "#ff3366", shape_stroke_width: 60, shape_taper: .5, shape_wobble: .4, shape_seed: 7}), backdrop()], laneOrderKeys: lanes, frames: [10]},
  {name: "shape-draw-on", elements: [shape("ring", 0, {shape_kind: "ellipse", shape_width: .6, shape_height: .6, shape_fill: null, shape_stroke: "#33ddff", shape_stroke_width: 45,
    keyframes: {shape_draw: [{t: 0, v: 0}, {t: 2, v: 1}]}}), shape("pen", 2, {shape_kind: "path", shape_width: .8, shape_height: .7, shape_contours: ink, shape_fill: null, shape_stroke: "#ffffff", shape_stroke_width: 30, shape_taper: .4, shape_wobble: .3,
    keyframes: {shape_draw: [{t: 0, v: 0}, {t: 2, v: 1}]}}), backdrop()], laneOrderKeys: ["visual_0", "visual_2", "visual_1"], frames: [30, 45]},
  {name: "shape-overlap-opacity", elements: [shape("disc", 0, {shape_kind: "ellipse", shape_width: .55, shape_height: .55, shape_fill: "#1a7fff", shape_stroke: "#ffffff", shape_stroke_width: 50, media_opacity: .6, media_offset_x: -.2}),
    shape("star", 2, {shape_kind: "star", shape_width: .6, shape_height: .6, shape_fill: "#ff3366", shape_stroke: null, media_opacity: .5, media_offset_x: .2, media_offset_y: .1}), backdrop()],
    laneOrderKeys: ["visual_0", "visual_2", "visual_1"], frames: [10]},
  {name: "shape-camera", elements: [shape("cam", 3, {shape_kind: "camera", keyframes: {media_scale: [{t: 0, v: 1}, {t: 4, v: 1.8}], media_offset_x: [{t: 0, v: 0}, {t: 4, v: .25}]}}),
    shape("arrow", 0, {shape_kind: "arrow", shape_width: .6, shape_height: .3, shape_fill: "#22cc88", shape_stroke: "#111111", shape_stroke_width: 20, media_rotation: 25, media_scale: 1.2, media_offset_y: -.2, camera_id: "cam"}), backdrop()],
    laneOrderKeys: ["visual_0", "visual_3", "visual_1"], frames: [15, 60]},
  // Opaque H.264 and VP9 alpha (software-decoded I420A) over a still: the next frame, then a seek.
  {name: "video", elements: [video("alpha", "video-alpha.webm", 0, true), video("opaque", "video-opaque.mp4", 1, false, {media_scale: .7, media_offset_x: .15}),
    still("backdrop", fixture("backdrop"), 2)], laneOrderKeys: ["visual_0", "visual_1", "visual_2"], frames: [10, 11, 75]},
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

/** The GPU preview player paused at each frame: the preview worker, its CanvasKit compositor and
 * the canvas it presents to, read back exactly. Full HD preview quality, so a software-WebGL machine
 * composites at full size as export does. Returns RGB buffers. */
let previewBrowser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const PREVIEW_PROJECT = "render-goldens";
async function capturePreview(scene: Scene) {
  previewBrowser ??= await chromium.launch({channel: "chrome", headless: true, args: ["--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"]});
  const page = await previewBrowser.newPage({viewport: {width: 400, height: 400}});
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    // A development server may still be compiling the page.
    await page.goto(`${base}/playback-proof`, {waitUntil: "domcontentloaded", timeout: 180000});
    await page.waitForFunction(() => !!window.__dreamcutPlayback, undefined, {timeout: 180000});
    await page.evaluate(id => localStorage.setItem(`dreamcut.preview-quality:${id}`, "hd"), PREVIEW_PROJECT);
    await page.evaluate(config => window.__dreamcutPlayback!.load(config), {gpu: true, projectId: PREVIEW_PROJECT, elements: scene.elements, laneOrderKeys: scene.laneOrderKeys, durationInFrames: DURATION_FRAMES});
    const shots: Buffer[] = [];
    for (const frame of scene.frames) {
      await page.evaluate(n => window.__dreamcutPlayback!.seek(n), frame);
      await page.waitForFunction(n => { const s = window.__dreamcutPlayback!.snapshot(); return (s.gpuFrame === n && !s.playing) || !!s.nativeError; }, frame, {timeout: 30000});
      const state = await page.evaluate(() => window.__dreamcutPlayback!.snapshot());
      assert.equal(state.nativeError, null, `${scene.name}: preview failed`);
      const rgba = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-gpu-preview]")!;
        return {width: canvas.width, height: canvas.height, data: Array.from(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data)};
      });
      assert.deepEqual([rgba.width, rgba.height], [SIZE, SIZE], `${scene.name}: preview canvas size`);
      shots.push(await sharp(Buffer.from(rgba.data), {raw: {width: SIZE, height: SIZE, channels: 4}}).removeAlpha().raw().toBuffer());
    }
    assert.deepEqual(errors, [], `${scene.name}: preview page errors`);
    return shots;
  } finally { await page.close(); }
}

/** One shape layer as Standard draws it (ShapeSequence in TimelineComposition.tsx), with each stroke either
 * as Standard's SVG stroke or as the outline CanvasKit fills, so one rasterizer draws both. */
function shapeMarkup(shape: ShapeFrame, outline: ((d: string, drawn: number, length: number) => string) | null) {
  const paths: string[] = [];
  if (shape.fill && shape.d) paths.push(`<path d="${shape.d}" fill="${shape.fill}" fill-rule="evenodd" stroke="none"/>`);
  if (shape.stroke && shape.strokeWidth > 0) for (const contour of shape.contours) {
    if (contour.drawn <= 0) continue;
    if (contour.ink) paths.push(`<path d="${contour.ink}" fill="${shape.stroke}" fill-rule="nonzero" stroke="none"/>`);
    else if (outline) paths.push(`<path d="${outline(contour.d, contour.drawn, contour.length)}" fill="${shape.stroke}" fill-rule="nonzero" stroke="none"/>`);
    else paths.push(`<path d="${contour.d}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"${contour.drawn < contour.length ? ` stroke-dasharray="${contour.drawn} ${contour.length + shape.strokeWidth}"` : ""}/>`);
  }
  return `<div style="position:absolute;inset:0;opacity:${shape.opacity}"><svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" style="position:absolute;inset:0;overflow:visible">`
    + `<g transform="translate(${shape.centerX} ${shape.centerY}) rotate(${shape.rotationDeg}) scale(${shape.scale})">${paths.join("")}</g></svg></div>`;
}

/** Each frame's shapes drawn by Chrome twice: Standard's markup, and the outlines the CanvasKit path code
 * fills (CanvasKitShapePaths, export pixel scale 1). One rasterizer, so only geometry can differ:
 * caps, miters, trims, transforms and stroke widths. Returns RGB buffers on black. */
let shapeKit: Awaited<ReturnType<typeof CanvasKitInit>> | undefined;
async function shapeGeometry(scene: Scene) {
  shapeKit ??= await CanvasKitInit({locateFile: (file: string) => path.resolve("node_modules/canvaskit-wasm/bin", file)});
  const kit = shapeKit, cache = new CanvasKitShapePaths(kit);
  previewBrowser ??= await chromium.launch({channel: "chrome", headless: true, args: ["--force-color-profile=srgb"]});
  const page = await previewBrowser.newPage({viewport: {width: SIZE, height: SIZE}});
  try {
    const shots: Array<{standard: Buffer; gpu: Buffer}> = [];
    // The first lane key is frontmost, so paint from the last.
    const order = (element: CompositionElement) => -scene.laneOrderKeys.indexOf(element.lane_key);
    const shapes = scene.elements.filter(element => element.type === "shape").sort((a, b) => order(a) - order(b));
    for (const frame of scene.frames) {
      const layers = {standard: "", gpu: ""};
      for (const element of shapes) {
        const start = Math.round(element.timeline_start * FPS);
        if (frame < start || frame >= start + Math.round(element.duration * FPS)) continue;
        const shape = shapeFrameInTimeline(element, scene.elements, (frame - start) / FPS, frame / FPS, SIZE, SIZE);
        if (shape.opacity <= 0) continue;
        layers.standard += shapeMarkup(shape, null);
        layers.gpu += shapeMarkup(shape, (d, drawn, length) => cache.stroke(d, shape.strokeWidth, drawn, length, Math.abs(shape.scale)).toSVGString());
      }
      const shot = async (body: string) => {
        await page.setContent(`<html><body style="margin:0;background:#000">${body}</body></html>`);
        return rgb(await page.screenshot({clip: {x: 0, y: 0, width: SIZE, height: SIZE}, type: "png"}));
      };
      shots.push({standard: await shot(layers.standard), gpu: await shot(layers.gpu)});
    }
    return shots;
  } finally { cache.close(); await page.close(); }
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
    // GOLDEN_SCENES=video,caption checks only the named scenes (never with GOLDEN_BLESS).
    const only = process.env.GOLDEN_SCENES?.split(",");
    assert.ok(!(only && bless), "Bless every scene, not a subset");
    for (const scene of [...SCENES, PERTURBED].filter(scene => !only || only.includes(scene.name))) {
      const shots = {standard: await capture(session, scene, false), gpu: await capture(session, scene, true)};
      const preview = await capturePreview(scene);
      const geometry = isShapeScene(scene.name) ? await shapeGeometry(scene) : null;
      for (const [index, frame] of scene.frames.entries()) {
        const row: Record<string, unknown> = {scene: scene.name, frame};
        const [standard, gpu] = [await rgb(shots.standard[index]), await rgb(shots.gpu[index])];
        for (const [renderer, png] of Object.entries(shots)) fs.writeFileSync(path.join(output, `${scene.name}-${renderer}-f${frame}.png`), png[index]);
        const cross = difference(standard, gpu);
        row.cross = cross;
        const perturbed = scene === PERTURBED;
        if (!perturbed && !within(cross, isShapeScene(scene.name) ? SHAPE_CROSS : CROSS)) { failed = true; row.cross_failed = true; }
        if (geometry) {
          const shapeGeometryDifference = difference(geometry[index].standard, geometry[index].gpu);
          row.geometry = shapeGeometryDifference;
          if (!within(shapeGeometryDifference, CROSS)) { failed = true; row.geometry_failed = true; }
        }
        // Preview must match export: the same renderer-agreement tolerance.
        await sharp(preview[index], {raw: {width: SIZE, height: SIZE, channels: 3}}).png().toFile(path.join(output, `${scene.name}-preview-f${frame}.png`));
        const previewExport = difference(preview[index], gpu);
        row.preview_export = previewExport;
        if (!perturbed && !within(previewExport, CROSS)) { failed = true; row.preview_export_failed = true; }
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
  } finally { await session.close(); await previewBrowser?.close(); }
  const receipt = {date: new Date().toISOString(), platform, blessed: bless, goldens: fs.existsSync(goldens), tolerances: {cross: CROSS, shape_cross: SHAPE_CROSS, shape_geometry: CROSS, preview_export: CROSS, golden: GOLDEN}, ok: !failed, rows};
  fs.writeFileSync(path.join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  for (const row of rows) console.log(JSON.stringify(row));
  assert.ok(!failed, "Render goldens failed; see testing/results/render-goldens/receipt.json");
}

main().catch(error => { console.error(error); process.exit(1); });
