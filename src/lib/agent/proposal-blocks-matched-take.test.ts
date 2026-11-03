import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileBlock, resolveBlockSettings, setBlockSetting, validateBlockRanges, blockReviewChanges, type BlockInstance } from "./proposal-blocks";
import { deriveProposalTimeline, editorAgentOptionSchema } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import type { TimelineFile } from "../local-store/store";
import { writePreparation } from "../local-store/media-preparation";
import { projectMediaDir } from "../local-store/paths";
import { withFrameRate } from "../timeline/frame-rate-scope";
import { createProject } from "../local-store/store";
import { internalGridMatteDirectory } from "../local-store/internal-masks";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "matched-take-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const [name, duration] of [["phone.mp4", 13.1], ["pour.mp4", 13.5]] as const) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration, alpha: false });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const media = "/api/projects/fixture/media";
const mask = { source_url: `${media}/grid-mattes/38eb62a3`, source_start_seconds: 0, fps: 30, frame_count: 393, width: 540, height: 960, source_sha256: "2".repeat(64) };
fs.mkdirSync(path.join(internalGridMatteDirectory("fixture"), "38eb62a3"), { recursive: true });
fs.writeFileSync(path.join(internalGridMatteDirectory("fixture"), "38eb62a3", "manifest.json"), JSON.stringify({ binding: mask, masks: [] }));
/** The approved Liquid from Object card (proposal 20261102T213901-2709130d, option phone-pour) as block inputs. */
function liquidFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "pour", kind: "matched_take_region", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    main: { source_url: `${media}/phone.mp4`, source_duration_seconds: 13.1, source_start_seconds: 0 },
    matched: { source_url: `${media}/pour.mp4`, source_duration_seconds: 13.5, source_start_seconds: 1 },
    duration_seconds: 12, region_inset: [.421, .32, .29, .18], subject_mask: mask, cutout_id: "38eb62a3",
    sound: { source_duration_seconds: 13.525333, source_start_seconds: 205 / 30, source_end_seconds: 340 / 30 },
    titles: { main: "Continuous phone performance", region: "Coffee filling the glass", sound: "Actual coffee pouring" },
    lane_order_keys: ["visual_1", "visual_0", "sound_effect_0"], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "pour", label: "Pour", summary: "Pour", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(30, () => deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option(block).operations, "fixture").timeline.elements);
const close = (actual: unknown, expected: number, message?: string) => assert.ok(Math.abs((actual as number) - expected) < 1e-9, `${message ?? ""} ${actual} ≠ ${expected}`);
const op = (operations: ReturnType<typeof compileBlock>, role: string) => operations.find(item => item.block_ref.role === role)!;

test("compiles the approved Liquid from Object card: main take, region with subject window, sound on the region's clock", () => {
  const operations = compileBlock(liquidFixture());
  assert.deepEqual(operations.map(item => item.block_ref.role), ["lane_order", "main", "region", "sound"]);
  assert.deepEqual((op(operations, "lane_order").set_lane_order as { lane_order_keys: string[] }).lane_order_keys, ["visual_1", "visual_0", "sound_effect_0"]);
  const main = op(operations, "main"), mainVisual = main.create_visual as Record<string, unknown>;
  assert.deepEqual([mainVisual.source_start_seconds, mainVisual.source_end_seconds, mainVisual.timeline_start, mainVisual.volume, mainVisual.lane_key], [0, 12, 0, 1, "visual_0"]);
  const region = op(operations, "region").create_visual as Record<string, unknown>;
  assert.deepEqual([region.source_start_seconds, region.source_end_seconds, region.timeline_start, region.volume, region.lane_key], [1, 13, 0, 0, "visual_1"]);
  (region.mask_inset as number[]).forEach((value, index) => close(value, [.421, .32, .29, .18][index]!, `inset ${index}`));
  close(region.mask_feather, .0015);
  assert.equal(region.subject_window_parent_id, main.element_id);
  assert.deepEqual(region.subject_window_mask, mask);
  assert.deepEqual([region.subject_window_mode, region.subject_window_expand, region.subject_window_feather, region.subject_window_strength], ["outside", 2, 2, 1]);
  const sound = op(operations, "sound").create_audio as Record<string, unknown>;
  close(sound.timeline_start, 175 / 30); close(sound.source_start_seconds, 205 / 30); close(sound.source_end_seconds, 340 / 30);
  close(sound.fade_in, 1 / 30); close(sound.fade_out, .1);
  assert.deepEqual([sound.volume, sound.source_duration_seconds, sound.source_url, sound.lane_key], [1, 13.525333, `${media}/pour.mp4`, "sound_effect_0"]);
  assert.deepEqual(sound.follows_visual, { element_id: op(operations, "region").element_id, offset_seconds: sound.timeline_start });
});

test("the timing dial slips the region's source and its sound together, matching the card's Pour timing range", () => {
  // Pour timing 0.5 s and 1.5 s on the approved card are ±15 frames here: later action reads earlier source.
  for (const [frames, regionStart] of [[15, .5], [-15, 1.5]] as const) {
    const operations = compileBlock(setBlockSetting(liquidFixture(), "slip_frames", frames));
    const region = op(operations, "region").create_visual as Record<string, number>, sound = op(operations, "sound").create_audio as Record<string, number>;
    close(region.source_start_seconds, regionStart); close(region.source_end_seconds, regionStart + 12);
    close(sound.source_start_seconds, 205 / 30, "sound source stays");
    close(sound.timeline_start - region.timeline_start, sound.source_start_seconds - region.source_start_seconds, "sound on the region's clock");
  }
  const authored = compileBlock(liquidFixture());
  assert.deepEqual(op(compileBlock(setBlockSetting(liquidFixture(), "slip_frames", 15)), "main"), op(authored, "main"), "slip never touches the main take");
  // Handles clamp: one second before and half a second after the reference.
  close((op(compileBlock(setBlockSetting(liquidFixture(), "slip_frames", 30)), "region").create_visual as Record<string, number>).source_start_seconds, 0);
  close((op(compileBlock(setBlockSetting(liquidFixture(), "slip_frames", -30)), "region").create_visual as Record<string, number>).source_end_seconds, 13.5);
});

test("derives through proposal validation; every dial endpoint compiles and resets to the authored card", () => {
  const block = liquidFixture();
  const elements = derive(block);
  assert.equal(elements.filter(element => element.type === "video_clip").length, 2);
  const region = elements.find(element => element.props?.title === "Coffee filling the glass")!;
  assert.equal(region.trim_start, 1); assert.equal(region.duration, 12);
  validateBlockRanges(block);
  const original = option(block);
  for (const item of resolveBlockSettings(block)) {
    if (item.setting.kind !== "number") continue;
    for (const value of [item.range.min, item.range.max]) {
      const tuned = applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: item.field, value }]);
      const inset = tuned.operations.find(item => item.block_ref?.role === "region")!.create_visual!.mask_inset as number[];
      assert.ok(inset[0]! + inset[2]! < 1 && inset[1]! + inset[3]! < 1, `${item.field} at ${value} keeps the area open`);
    }
  }
  assert.deepEqual(applyProposalNumericOverrides(original, []).operations, original.operations);
});

test("main dials lead the card; sound dials leave a card with no sound", () => {
  const main = blockReviewChanges(liquidFixture(), 0).filter(change => change.control_tier === "main").map(change => change.label);
  assert.deepEqual(main, ["Second take timing", "Expand edge", "Edge softness", "Sound level"]);
  const silent = liquidFixture({ sound: undefined });
  assert.ok(!blockReviewChanges(silent, 0).some(change => change.field.startsWith("sound_")));
  assert.equal(compileBlock(silent).filter(item => item.create_audio).length, 0);
  validateBlockRanges(silent);
});

test("missing handles, a closed area and reversed lanes fail with actionable errors", () => {
  assert.throws(() => compileBlock(liquidFixture({ matched: { source_url: `${media}/pour.mp4`, source_duration_seconds: 10, source_start_seconds: 1 } })), /Second take needs 12s/);
  assert.throws(() => compileBlock(liquidFixture({ main: { source_url: `${media}/phone.mp4`, source_duration_seconds: 11 } })), /Main take needs/);
  assert.throws(() => compileBlock(liquidFixture({ region_inset: [.5, .1, .5, .1] })), /at least 5%/);
  assert.throws(() => compileBlock(liquidFixture({ lane_order_keys: ["visual_0", "visual_1"] })), /region above the main take/);
  assert.throws(() => compileBlock(liquidFixture({ sound: { source_start_seconds: 9, source_end_seconds: 8 } })), /end after it starts/);
});
