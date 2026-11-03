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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "behind-object-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const [name, duration] of [["splash.mp4", 5.366667], ["jump.mp4", 6.266667], ["Splash.wav", 0.611823]] as const) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration, alpha: false });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const media = "/api/projects/fixture/media";
const mask = { source_url: `${media}/grid-mattes/d3422b99`, source_start_seconds: 0, fps: 30, frame_count: 161, width: 540, height: 960, source_sha256: "053779db1481323aa2bf898bebcdab8aa6eed76d58e29b32077c33444d0de277" };
fs.mkdirSync(path.join(internalGridMatteDirectory("fixture"), "d3422b99"), { recursive: true });
fs.writeFileSync(path.join(internalGridMatteDirectory("fixture"), "d3422b99", "manifest.json"), JSON.stringify({ binding: mask, masks: [] }));
const JUMP = "3e6ac609-9bb9-455b-a6ed-b2f62635b94d";
/** The approved Cup Jump card (proposal 20261102T234425-9e701056, option cup-jump) as block inputs. */
function cupJumpFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "cup", kind: "behind_object_vanish", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    object_take: { source_url: `${media}/splash.mp4`, source_duration_seconds: 5.366667, source_start_seconds: 8 / 30 },
    duration_seconds: 97 / 30,
    performance: { source_url: `${media}/jump.mp4`, source_duration_seconds: 6.266667 },
    pieces: [{ source_start_seconds: 3.5, source_end_seconds: 4.6, speed: 1, title: "Jump from the chair" }, { source_start_seconds: 4.6, source_end_seconds: 5, speed: 1.5, title: "Jump, last moment faster" }],
    band_inset: [0, 0, .4, 0], object_mask: mask, cutout_id: "d3422b99",
    sound: { source_url: `${media}/Splash.wav`, source_duration_seconds: .611823, source_sha256: "e046459b3eb05c632e00bfda4db33b5b0c6d44213088973b17f16bce5b37ca98", source_end_seconds: .611823, offset_seconds: -1 / 30, fade_out_seconds: .05 },
    titles: { object_take: "Cup splash take", sound: "Splash" },
    lanes: { object_take: { lane_key: "visual_1", lane_index: 1 }, pieces: [{ lane_key: "visual_2", lane_index: 2 }, { lane_key: "visual_3", lane_index: 3 }], sound: { lane_key: "sound_effect_0", lane_index: 0 } },
    lane_order_keys: ["sound_effect_0", "visual_3", "visual_2", "visual_1", "visual_0"], remove_element_ids: [JUMP], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "cup-jump", label: "Cup Jump", summary: "Cup Jump", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(30, () => deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option(block).operations, "fixture").timeline.elements);
const close = (actual: unknown, expected: number, message?: string, tolerance = 1e-9) => assert.ok(Math.abs((actual as number) - expected) < tolerance, `${message ?? ""} ${actual} ≠ ${expected}`);
const ops = (operations: ReturnType<typeof compileBlock>, role: string) => operations.filter(item => item.block_ref.role === role);
const op = (operations: ReturnType<typeof compileBlock>, role: string) => ops(operations, role)[0]!;

test("compiles the approved Cup Jump card: splash take, two jump pieces windowed behind its cup, splash a frame before the vanish", () => {
  const operations = compileBlock(cupJumpFixture());
  assert.deepEqual(operations.map(item => item.block_ref.role), ["remove", "lane_order", "object_take", "piece", "piece", "sound"]);
  assert.equal(op(operations, "remove").element_id, JUMP);
  assert.deepEqual((op(operations, "lane_order").set_lane_order as { lane_order_keys: string[] }).lane_order_keys, ["sound_effect_0", "visual_3", "visual_2", "visual_1", "visual_0"]);
  const base = op(operations, "object_take"), splash = base.create_visual as Record<string, unknown>;
  close(splash.source_start_seconds, .266667, "splash in", 1e-6); close(splash.source_end_seconds, 3.5, "splash out", 1e-6);
  assert.deepEqual([splash.timeline_start, splash.volume, splash.lane_key, splash.lane_index, splash.title], [0, 0, "visual_1", 1, "Cup splash take"]);
  const card = [[3.5, 4.6, 1, 0, "visual_2", "Jump from the chair"], [4.6, 5, 1.5, 1.1, "visual_3", "Jump, last moment faster"]] as const;
  ops(operations, "piece").forEach((item, index) => {
    const piece = item.create_visual as Record<string, unknown>, [from, to, rate, at, laneKey, title] = card[index]!;
    close(piece.source_start_seconds, from, `piece ${index} in`); close(piece.source_end_seconds, to, `piece ${index} out`); close(piece.timeline_start, at, `piece ${index} at`);
    assert.deepEqual([piece.playback_rate, piece.lane_key, piece.title, piece.volume, piece.source_url], [rate, laneKey, title, 0, `${media}/jump.mp4`]);
    (piece.mask_inset as number[]).forEach((value, side) => close(value, [0, 0, .4, 0][side]!, `inset ${side}`));
    close(piece.mask_feather, .015);
    assert.equal(piece.subject_window_parent_id, base.element_id);
    assert.deepEqual(piece.subject_window_mask, mask);
    assert.deepEqual([piece.subject_window_mode, piece.subject_window_expand, piece.subject_window_feather, piece.subject_window_strength], ["outside", 2, 2, 1]);
  });
  const sound = op(operations, "sound").create_audio as Record<string, unknown>;
  close(sound.timeline_start, 40 / 30, "splash one frame before the 41-frame vanish");
  assert.deepEqual([sound.source_start_seconds, sound.source_end_seconds, sound.volume, sound.fade_in, sound.fade_out, sound.lane_key, sound.title], [0, .611823, 1, 0, .05, "sound_effect_0", "Splash"]);
  assert.equal(sound.source_sha256, "e046459b3eb05c632e00bfda4db33b5b0c6d44213088973b17f16bce5b37ca98");
  const last = ops(operations, "piece")[1]!;
  assert.equal((sound.follows_visual as { element_id: string }).element_id, last.element_id);
  close((sound.follows_visual as { offset_seconds: number }).offset_seconds, 40 / 30 - 1.1);
});

test("speed keeps each piece's action and carries the vanish and its splash; timing dials slip their own take", () => {
  const faster = compileBlock(setBlockSetting(cupJumpFixture(), "speed.1", 2));
  const fast = ops(faster, "piece")[1]!.create_visual as Record<string, number>;
  close(fast.source_start_seconds, 4.6); close(fast.source_end_seconds, 5); close(fast.timeline_start, 1.1);
  close((op(faster, "sound").create_audio as Record<string, number>).timeline_start, 1.1 + 6 / 30 - 1 / 30, "splash follows the earlier vanish");
  const later = compileBlock(setBlockSetting(cupJumpFixture(), "performance_timing_frames", 15));
  ops(later, "piece").forEach((item, index) => close((item.create_visual as Record<string, number>).source_start_seconds, [3.5, 4.6][index]! - .5, `piece ${index} reads earlier`));
  assert.deepEqual(op(later, "object_take"), op(compileBlock(cupJumpFixture()), "object_take"), "your take timing never touches the object take");
  // The splash take has 8 frames of handle before it: later splash clamps there; earlier reads later source.
  close((op(compileBlock(setBlockSetting(cupJumpFixture(), "object_timing_frames", 30)), "object_take").create_visual as Record<string, number>).source_start_seconds, 0);
  close((op(compileBlock(setBlockSetting(cupJumpFixture(), "object_timing_frames", -15)), "object_take").create_visual as Record<string, number>).source_start_seconds, 23 / 30);
  close((op(compileBlock(setBlockSetting(cupJumpFixture(), "sound_timing_frames", 5)), "sound").create_audio as Record<string, number>).timeline_start, 46 / 30, "Sound timing counts from the vanish");
});

test("derives through proposal validation; every dial endpoint compiles and resets to the authored card", () => {
  const block = cupJumpFixture({ remove_element_ids: [] });
  const elements = derive(block);
  assert.equal(elements.filter(element => element.type === "video_clip").length, 3);
  const fast = elements.find(element => element.props?.title === "Jump, last moment faster")!;
  close(fast.timeline_start, 1.1); close(fast.duration, 8 / 30, "8 frames at 1.5x", 1e-6);
  validateBlockRanges(block);
  const original = option(block);
  for (const item of resolveBlockSettings(block)) {
    if (item.setting.kind !== "number") continue;
    for (const value of [item.range.min, item.range.max]) {
      const tuned = applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: item.field, value }]);
      const pieces = tuned.operations.filter(entry => entry.block_ref?.role === "piece").map(entry => entry.create_visual as Record<string, number>);
      const splash = tuned.operations.find(entry => entry.block_ref?.role === "object_take")!.create_visual as Record<string, number>;
      const end = pieces.at(-1)!.timeline_start + (pieces.at(-1)!.source_end_seconds - pieces.at(-1)!.source_start_seconds) / pieces.at(-1)!.playback_rate;
      assert.ok(end < 97 / 30 + 1e-6, `${item.field} at ${value} vanishes inside the splash window`);
      assert.ok(splash.source_start_seconds >= 0 && splash.source_start_seconds + end <= 161 / 30 + 1e-6, `${item.field} at ${value} stays inside the cup's cut-out`);
    }
  }
  assert.deepEqual(applyProposalNumericOverrides(original, []).operations, original.operations);
});

test("main dials lead the card; sound dials leave a card with no sound", () => {
  const main = blockReviewChanges(cupJumpFixture(), 0).filter(change => change.control_tier === "main").map(change => change.label);
  assert.deepEqual(main, ["Your take timing", "Speed Jump from the chair", "Speed Jump, last moment faster", "Object take timing", "Expand edge", "Edge softness", "Window strength", "Sound level", "Sound timing"]);
  const silent = cupJumpFixture({ sound: undefined });
  assert.ok(!blockReviewChanges(silent, 0).some(change => change.field.startsWith("sound_")));
  assert.equal(compileBlock(silent).filter(item => item.create_audio).length, 0);
  validateBlockRanges(silent);
});

test("a performance past the window, an uncovered object take and reversed lanes fail with actionable errors", () => {
  assert.throws(() => compileBlock(cupJumpFixture({ duration_seconds: 1 })), /must end inside the 1s object-take window/);
  assert.throws(() => compileBlock(cupJumpFixture({ object_mask: { ...mask, frame_count: 30 } })), /cut-out covers 0-1s/);
  assert.throws(() => compileBlock(cupJumpFixture({ object_take: { source_url: `${media}/splash.mp4`, source_duration_seconds: 3, source_start_seconds: 8 / 30 } })), /Object take needs/);
  assert.throws(() => compileBlock(cupJumpFixture({ lane_order_keys: ["sound_effect_0", "visual_1", "visual_3", "visual_2", "visual_0"] })), /every piece above the object take/);
  assert.throws(() => compileBlock(cupJumpFixture({ pieces: [{ source_start_seconds: 5, source_end_seconds: 7 }] })), /past the end of the performance take/);
  assert.throws(() => compileBlock(cupJumpFixture({ lanes: { pieces: [{ lane_key: "visual_2", lane_index: 2 }] } })), /one lane per piece/);
});
