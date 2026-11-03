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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-launch-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const [name, duration, alpha] of [["take.mp4", 11.333333, false], ["copy.webm", 1, true], ["leg.webm", .9, true], ["hit.wav", .6, false]] as const) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration, alpha });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const media = "/api/projects/fixture/media";
const TAKE = "65f46995-7f56-4bf5-9687-5e131d45092e";
/** The approved Kick Away card (proposal 20261103T021727-49eac408, option kick-away) as block inputs. */
function kickFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "kick", kind: "copy_launch", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    take: { source_url: `${media}/take.mp4`, source_duration_seconds: 11.333333 },
    action_start_seconds: .233333, contact_seconds: 1.3, loop_seconds: 4,
    spot: { inset: [.2, 0, .1, .3], feather: .03 },
    copy: { source_url: `${media}/copy.webm`, source_duration_seconds: 1, take_offset_seconds: 4.8, window_seconds: .55 },
    front: { source_url: `${media}/leg.webm`, source_duration_seconds: .9, take_offset_seconds: 1 },
    titles: { take: "The kick", spot: "His copy waiting on the spot", copy: "Copy flying away", front: "Kicking leg in front" },
    lane_order_keys: ["visual_3", "visual_2", "visual_1", "visual_0"], remove_element_ids: [TAKE], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "kick-away", label: "Kick away and loop", summary: "Kick", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(30, () => deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option(block).operations, "fixture").timeline.elements);
const close = (actual: unknown, expected: number, message?: string, tolerance = 1e-4) => assert.ok(Math.abs((actual as number) - expected) < tolerance, `${message ?? ""} ${actual} ≠ ${expected}`);
const op = (operations: ReturnType<typeof compileBlock>, role: string, index = 0) => operations.find(item => item.block_ref.role === role && item.block_ref.index === index)!;
const visual = (operations: ReturnType<typeof compileBlock>, role: string) => op(operations, role).create_visual as Record<string, unknown>;
type Key = { t: number; v: number; ease?: string };
const keysOf = (clip: Record<string, unknown>, field: string) => (clip.transition_keyframes as Record<string, Key[] | undefined>)[field];
const flat = (keys: Key[] | undefined) => keys?.map(key => [key.t, key.v, key.ease]);

test("compiles the approved Kick Away card: the kick, the copy waiting in its box, the launch with its path and streak, the leg in front", () => {
  const operations = compileBlock(kickFixture());
  assert.deepEqual(operations.map(item => item.block_ref.role), ["remove", "lane_order", "take", "spot", "copy", "front"]);
  assert.equal(op(operations, "remove").element_id, TAKE);
  const take = visual(operations, "take");
  assert.deepEqual([take.source_start_seconds, take.source_end_seconds, take.timeline_start, take.volume, take.lane_key, take.title], [.233333, 4, 0, 0, "visual_0", "The kick"]);
  const spot = visual(operations, "spot");
  assert.deepEqual([spot.source_start_seconds, spot.timeline_start, spot.mask_inset, spot.mask_feather, spot.lane_key], [4, 0, [.2, 0, .1, .3], .03, "visual_1"]);
  close(spot.source_end_seconds, 5.1, "the box ends at the launch");
  const copy = visual(operations, "copy");
  close(copy.timeline_start, 1.1, "launch one frame after the contact at frame 32");
  close(copy.source_start_seconds, .3); close(copy.source_end_seconds, .85);
  assert.deepEqual([copy.playback_rate, copy.has_alpha, copy.directional_blur_y, copy.lane_key, copy.trailing_hold_seconds], [.25, true, 70, "visual_2", undefined]);
  // The card's keyframes, to the 4-decimal times it was authored with.
  assert.deepEqual(flat(keysOf(copy, "media_offset_y")), [[0, 0, "linear"], [.0333, -.47, "linear"], [.0667, -.5, "linear"], [.1, -.56, "easeOut"], [.3667, -.75, undefined]]);
  assert.deepEqual(flat(keysOf(copy, "media_offset_x")), [[0, 0, "linear"], [.3667, .06, "linear"], [1.1, .2, undefined]]);
  assert.deepEqual(flat(keysOf(copy, "media_scale")), [[0, 1, "linear"], [.0333, .67, "linear"], [.0667, .62, "linear"], [.1, .55, "linear"], [.2333, .35, "linear"], [.3667, .25, "linear"], [.6667, .1, undefined]]);
  assert.deepEqual(flat(keysOf(copy, "media_opacity")), [[0, 1, "hold"], [.6667, 1, "easeIn"], [1.1, 0, undefined]]);
  assert.deepEqual(flat(keysOf(copy, "directional_blur_y")), [[0, 70, "linear"], [.0333, 70, "linear"], [.0667, 35, "linear"], [.1, 10, "linear"], [.1667, 0, undefined]]);
  const front = visual(operations, "front");
  close(front.timeline_start, .766667, "on the take's clock", 1e-5);
  assert.deepEqual([front.source_start_seconds, front.source_end_seconds, front.has_alpha, front.lane_key], [0, .9, true, "visual_3"]);
});

test("launch and loop dials keep the waiting copy's clock continuous into the flight", () => {
  const later = compileBlock(setBlockSetting(kickFixture(), "launch_delay", 4));
  close(visual(later, "copy").timeline_start, 36 / 30);
  close(visual(later, "spot").source_end_seconds, 4 + 36 / 30, "the box runs to the new launch");
  close(visual(later, "copy").source_start_seconds, 4 + 36 / 30 - 4.8, "the copy starts where the box left off");
  const loop = compileBlock(setBlockSetting(kickFixture(), "loop_frame", 3));
  close(visual(loop, "take").source_end_seconds, 4.1);
  close(visual(loop, "spot").source_start_seconds, 4.1, "the loop still joins");
  close(visual(loop, "copy").source_start_seconds, .4);
  // Past the copy's cut-out the loop frame clamps instead of failing.
  const clamped = visual(compileBlock(setBlockSetting(kickFixture(), "loop_frame", -15)), "copy");
  assert.ok((clamped.source_start_seconds as number) >= 0);
});

test("the path dials have off positions; a fast pose holds its last frame through the flight", () => {
  let block = setBlockSetting(kickFixture(), "rise", 0);
  block = setBlockSetting(block, "drift", 0);
  block = setBlockSetting(block, "shrink", 0);
  block = setBlockSetting(block, "blur", 0);
  const still = visual(compileBlock(block), "copy");
  assert.equal(keysOf(still, "media_offset_y"), undefined);
  assert.equal(keysOf(still, "media_offset_x"), undefined);
  assert.equal(keysOf(still, "directional_blur_y"), undefined);
  assert.equal(still.directional_blur_y, undefined);
  assert.ok(keysOf(still, "media_scale")!.every(key => key.v === 1), "no shrink");
  const left = visual(compileBlock(setBlockSetting(kickFixture(), "drift", -10)), "copy");
  assert.equal(keysOf(left, "media_offset_x")!.at(-1)!.v, -.2);
  const longer = visual(compileBlock(setBlockSetting(kickFixture(), "flight_frames", 66)), "copy");
  close(keysOf(longer, "media_opacity")!.at(-1)!.t, 2.2, "the whole path stretches");
  const fast = visual(compileBlock(setBlockSetting(kickFixture(), "flight_speed", 1)), "copy");
  close((fast.source_end_seconds as number) - (fast.source_start_seconds as number) + (fast.trailing_hold_seconds as number), 1.1, "plays then holds to the end of the flight");
});

test("derives through proposal validation; every dial endpoint compiles and resets to the authored card", () => {
  const block = kickFixture({ remove_element_ids: [], sounds: [{ source_url: `${media}/hit.wav`, source_duration_seconds: .6, title: "Hit" }], lane_order_keys: ["visual_3", "visual_2", "visual_1", "visual_0", "sound_effect_0"] });
  const elements = derive(block);
  assert.equal(elements.filter(element => element.type === "video_clip").length, 4);
  close(elements.find(element => element.props?.title === "The kick")!.duration, 113 / 30, "one loop", 1e-3);
  validateBlockRanges(block);
  const original = option(block);
  for (const item of resolveBlockSettings(block)) {
    if (item.setting.kind !== "number") continue;
    for (const value of [item.range.min, item.range.max]) applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: item.field, value }]);
  }
  assert.deepEqual(applyProposalNumericOverrides(original, []).operations, original.operations);
  const main = blockReviewChanges(block, 0).filter(change => change.control_tier === "main").map(change => change.label);
  assert.deepEqual(main, ["Launch after contact", "Flight length", "Rise", "Drift sideways", "Shrink into the distance", "Pose speed", "Streak blur", "Box edge softness", "Level of Hit"]);
});

test("a cut-out that misses the launch frame, a contact outside the take and reversed lanes fail with actionable errors", () => {
  assert.throws(() => compileBlock(kickFixture({ copy: { source_url: `${media}/copy.webm`, source_duration_seconds: .2, take_offset_seconds: 6 } })), /must cover the waiting copy's launch frame/);
  assert.throws(() => compileBlock(kickFixture({ contact_seconds: 4.5 })), /start < contact < loop/);
  assert.throws(() => compileBlock(kickFixture({ lane_order_keys: ["visual_2", "visual_3", "visual_1", "visual_0"] })), /front cut-out above the flying copy/);
  assert.deepEqual(compileBlock(kickFixture({ front: undefined, lane_order_keys: ["visual_2", "visual_1", "visual_0"] })).map(item => item.block_ref.role), ["remove", "lane_order", "take", "spot", "copy"]);
});
