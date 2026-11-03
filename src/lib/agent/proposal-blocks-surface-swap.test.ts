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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "surface-swap-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const [name, duration] of [["door.mov", 73.663333], ["carp.mp4", 32.5], ["water.wav", 61.849146]] as const) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration, alpha: false });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const media = "/api/projects/fixture/media";
const mask = { source_url: `${media}/grid-mattes/25c0f90e`, source_start_seconds: 0, fps: 29.9742069776913, frame_count: 2208, width: 540, height: 960, source_sha256: "63da5d858a724d5263e2ec97d169bb2dd02656886fb23686bfa57bff1b5a1999" };
fs.mkdirSync(path.join(internalGridMatteDirectory("fixture"), "25c0f90e"), { recursive: true });
fs.writeFileSync(path.join(internalGridMatteDirectory("fixture"), "25c0f90e", "manifest.json"), JSON.stringify({ binding: mask, masks: [] }));
const TAKE = "5f7a38ca-0000-4000-8000-000000000000";
/** The approved House Pond card (proposal 20261102T233142-2b3d7fbd, option pond-floor) as block inputs. */
function housePondFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "pond", kind: "surface_swap", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    main: { source_url: `${media}/door.mov`, source_duration_seconds: 73.663333, source_start_seconds: 53.62 },
    duration_seconds: 13.27,
    insert: { source_url: `${media}/carp.mp4`, source_duration_seconds: 32.5 },
    surface_mask: mask, cutout_id: "25c0f90e",
    placement: { scale: 1.375, offset_x: -.09, offset_y: .565 }, edge: { expand_px: 24, feather_px: 2 },
    sound: { source_url: `${media}/water.wav`, source_duration_seconds: 61.849146, source_sha256: "61663a4fc9b7d9f0f97a849e8244cf20262ce59d6e70db0395a092b1d956c760" },
    titles: { main: "Back door take", insert: "Carp pond", sound: "Water spilling into a pond" },
    lane_order_keys: ["visual_1", "visual_0", "sound_effect_0"], remove_element_ids: [TAKE], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "pond-floor", label: "Pond", summary: "Pond", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(30, () => deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option(block).operations, "fixture").timeline.elements);
const close = (actual: unknown, expected: number, message?: string, tolerance = 1e-9) => assert.ok(Math.abs((actual as number) - expected) < tolerance, `${message ?? ""} ${actual} ≠ ${expected}`);
const op = (operations: ReturnType<typeof compileBlock>, role: string) => operations.find(item => item.block_ref.role === role)!;
const visual = (operations: ReturnType<typeof compileBlock>, role: string) => op(operations, role).create_visual as Record<string, unknown>;

test("compiles the approved House Pond card: door take, carp clip inside the floor cut-out, water sound at 0 dB", () => {
  const operations = compileBlock(housePondFixture());
  assert.deepEqual(operations.map(item => item.block_ref.role), ["remove", "lane_order", "main", "insert", "sound"]);
  assert.equal(op(operations, "remove").element_id, TAKE);
  assert.deepEqual((op(operations, "lane_order").set_lane_order as { lane_order_keys: string[] }).lane_order_keys, ["visual_1", "visual_0", "sound_effect_0"]);
  const main = visual(operations, "main");
  // 13.27 s is 398.1 frames: the window snaps to 398 (13.267 s), as the applied timeline holds.
  close(main.source_start_seconds, 53.62); close(main.source_end_seconds, 53.62 + 398 / 30);
  assert.deepEqual([main.timeline_start, main.volume, main.lane_key, main.title], [0, 1, "visual_0", "Back door take"]);
  const pond = visual(operations, "insert");
  close(pond.source_end_seconds, 398 / 30);
  assert.deepEqual([pond.source_start_seconds, pond.timeline_start, pond.volume, pond.lane_key, pond.title, pond.source_url], [0, 0, 0, "visual_1", "Carp pond", `${media}/carp.mp4`]);
  close(pond.media_scale, 1.375); close(pond.media_offset_x, -.09); close(pond.media_offset_y, .565);
  assert.equal(pond.subject_window_parent_id, op(operations, "main").element_id);
  assert.deepEqual(pond.subject_window_mask, mask);
  assert.deepEqual([pond.subject_window_mode, pond.subject_window_expand, pond.subject_window_feather, pond.subject_window_strength], ["inside", 24, 2, 1]);
  const sound = op(operations, "sound").create_audio as Record<string, unknown>;
  close(sound.source_end_seconds, 398 / 30, "sound ends with the window");
  assert.deepEqual([sound.timeline_start, sound.source_start_seconds, sound.volume, sound.fade_in, sound.fade_out, sound.lane_key, sound.title],
    [0, 0, 1, 0, 0, "sound_effect_0", "Water spilling into a pond"]);
  assert.deepEqual(sound.follows_visual, { element_id: op(operations, "insert").element_id, offset_seconds: 0 });
});

test("placement and edge dials reach the inserted clip only; the main take never changes", () => {
  const tuned = compileBlock(setBlockSetting(setBlockSetting(setBlockSetting(housePondFixture(), "scale", 2), "offset_y", 10), "surface_expand", 0));
  const pond = visual(tuned, "insert") as Record<string, number>;
  assert.deepEqual([pond.media_scale, pond.subject_window_expand], [2, 0]);
  close(pond.media_offset_y, .1);
  assert.deepEqual(op(tuned, "main"), op(compileBlock(housePondFixture()), "main"));
  assert.equal(visual(compileBlock(setBlockSetting(housePondFixture(), "window_strength", 0)), "insert").subject_window_strength, 0);
});

test("derives through proposal validation; every dial endpoint compiles and resets to the authored card", () => {
  const block = housePondFixture({ remove_element_ids: [] });
  const elements = derive(block);
  assert.equal(elements.filter(element => element.type === "video_clip").length, 2);
  close(elements.find(element => element.props?.title === "Carp pond")!.duration, 398 / 30, "pond", 1e-6);
  validateBlockRanges(block);
  const original = option(block);
  for (const item of resolveBlockSettings(block)) {
    if (item.setting.kind !== "number") continue;
    for (const value of [item.range.min, item.range.max]) applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: item.field, value }]);
  }
  assert.deepEqual(applyProposalNumericOverrides(original, []).operations, original.operations);
});

test("main dials lead the card; sound dials leave a card with no sound", () => {
  const main = blockReviewChanges(housePondFixture(), 0).filter(change => change.control_tier === "main").map(change => change.label);
  assert.deepEqual(main, ["Size", "Horizontal position", "Vertical position", "Expand edge", "Sound level"]);
  const silent = housePondFixture({ sound: undefined });
  assert.ok(!blockReviewChanges(silent, 0).some(change => change.field.startsWith("sound_")));
  assert.equal(compileBlock(silent).filter(item => item.create_audio).length, 0);
  validateBlockRanges(silent);
});

test("a short insert, an uncovered window and reversed lanes fail with actionable errors", () => {
  assert.throws(() => compileBlock(housePondFixture({ insert: { source_url: `${media}/carp.mp4`, source_duration_seconds: 10 } })), /Inserted clip needs/);
  assert.throws(() => compileBlock(housePondFixture({ surface_mask: { ...mask, frame_count: 1800 } })), /surface cut-out covers 0-60/);
  assert.throws(() => compileBlock(housePondFixture({ lane_order_keys: ["visual_0", "visual_1", "sound_effect_0"] })), /insert above the main take/);
});
