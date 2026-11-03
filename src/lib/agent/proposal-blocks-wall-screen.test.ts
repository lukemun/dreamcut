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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "wall-screen-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const [name, duration] of [["wall.mp4", 15.674], ["screen.mp4", 17.207], ["whoosh.wav", 2.115079]] as const) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration, alpha: false });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const media = "/api/projects/fixture/media";
const mask = { source_url: `${media}/grid-mattes/a486d73d`, source_start_seconds: 2.1, fps: 30, frame_count: 381, width: 540, height: 960, source_sha256: "80df61d81f26b389eaeda57361dfe8fcc56edf6be0490844103744073c226e8c" };
fs.mkdirSync(path.join(internalGridMatteDirectory("fixture"), "a486d73d"), { recursive: true });
fs.writeFileSync(path.join(internalGridMatteDirectory("fixture"), "a486d73d", "manifest.json"), JSON.stringify({ binding: mask, masks: [] }));
const TAKE = "9a4f7171-7037-4054-85e6-3fa5ab2bcca1";
/** The approved Wall Hologram card (proposal 20261103T002532-e516136e, option wall-hologram) as block inputs. */
function wallHologramFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "wall", kind: "wall_screen", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    take: { source_url: `${media}/wall.mp4`, source_duration_seconds: 15.674, source_start_seconds: 73 / 30 },
    duration_seconds: 362 / 30,
    screen: { source_url: `${media}/screen.mp4`, source_duration_seconds: 17.207, source_start_seconds: .2 },
    pop_start_seconds: 1.2,
    person_mask: mask, cutout_id: "a486d73d",
    placement: { scale: .6366, offset_x: 0, offset_y: -.3714, rotation_deg: .96, crop: [59 / 1920, 0, 0, 0] },
    reveal: { frames: 10, anchor_px: [0, -63.45] },
    look: { opacity: .8, exposure_ev: .6 }, edge: { expand_px: 0, feather_px: 1 },
    whoosh: { source_url: `${media}/whoosh.wav`, source_duration_seconds: 2.115079, source_sha256: "29ee9274b0b725c865d4cf24af4cb86cb84c1d1d640686e3affae9a6fd7395ea", offset_seconds: -.2 },
    titles: { take: "Wall take", screen: "Phone screen on the wall", person: "Creator in front of the screen", camera: "Wall angle", whoosh: "Cape whoosh" },
    lane_order_keys: ["sound_effect_0", "visual_3", "visual_2", "visual_1", "visual_0"], remove_element_ids: [TAKE], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "wall-hologram", label: "Screen on the wall", summary: "Screen", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(30, () => deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option(block).operations, "fixture").timeline.elements);
const close = (actual: unknown, expected: number, message?: string, tolerance = 1e-4) => assert.ok(Math.abs((actual as number) - expected) < tolerance, `${message ?? ""} ${actual} ≠ ${expected}`);
const op = (operations: ReturnType<typeof compileBlock>, role: string) => operations.find(item => item.block_ref.role === role)!;
const visual = (operations: ReturnType<typeof compileBlock>, role: string) => op(operations, role).create_visual as Record<string, unknown>;
type Key = { t: number; v: number | number[]; ease?: string };
const keysOf = (screen: Record<string, unknown>, field: string) => (screen.transition_keyframes as Record<string, Key[]>)[field];

test("compiles the approved Wall Hologram card: wall take, screen popping open behind the creator, whoosh before it opens", () => {
  const operations = compileBlock(wallHologramFixture());
  assert.deepEqual(operations.map(item => item.block_ref.role), ["remove", "lane_order", "take", "camera", "screen", "person", "whoosh"]);
  assert.equal(op(operations, "remove").element_id, TAKE);
  const take = visual(operations, "take");
  close(take.source_start_seconds, 73 / 30); close(take.source_end_seconds, 14.5);
  assert.deepEqual([take.timeline_start, take.volume, take.lane_key], [0, 0, "visual_0"]);
  const camera = op(operations, "camera").create_shape as Record<string, unknown>;
  assert.deepEqual([camera.shape_kind, camera.media_rotation, camera.lane_key], ["camera", .96, "visual_3"]);
  close(camera.timeline_start, 1.2); close(camera.duration_seconds, 10.86667);
  const screen = visual(operations, "screen");
  assert.equal(screen.camera_id, op(operations, "camera").element_id);
  close(screen.timeline_start, 1.2); close(screen.source_start_seconds, .2); close(screen.source_end_seconds, 11.06667);
  assert.deepEqual([screen.volume, screen.media_blend_mode, screen.media_opacity, screen.lane_key], [1, "normal", .8, "visual_1"]);
  assert.deepEqual(screen.color_grade, { grade_exposure_ev: .6 });
  // The applied card's values, measured on the course demo.
  close(screen.media_scale, .6366); close(screen.media_offset_x, .01106); close(screen.media_offset_y, -.37141);
  close((screen.mask_inset as number[])[0], .01556);
  const scale = keysOf(screen, "media_scale");
  assert.deepEqual(scale.map(key => key.ease), ["hold", "easeOut", undefined]);
  close(scale[0].v, .1); close(scale[1].t, .0273); close(scale[2].t, 1 / 3); close(scale[2].v, .6366);
  const y = keysOf(screen, "media_offset_y");
  close(y[0].v, -.42712); close(y[2].v, -.37141);
  assert.equal(keysOf(screen, "media_offset_x"), undefined, "the screen grows straight down from its anchor");
  const opacity = keysOf(screen, "media_opacity");
  assert.deepEqual(opacity.map(key => key.ease), ["hold", "linear", undefined]);
  close(opacity[1].t, 1 / 60); close(opacity[2].v, .8);
  const crop = screen.mask_inset_keyframes as Key[];
  close((crop[0].v as number[])[0], .23951); close((crop[2].v as number[])[0], .01556);
  assert.deepEqual((crop[2].v as number[]).slice(1), [0, 0, 0]);
  const person = visual(operations, "person");
  assert.deepEqual([person.subject_window_parent_id, person.subject_window_mode, person.subject_window_expand, person.subject_window_feather, person.subject_window_strength, person.volume],
    [op(operations, "take").element_id, "inside", 0, 1, 1, 0]);
  assert.deepEqual(person.subject_window_mask, mask);
  close(person.source_start_seconds, 73 / 30); close(person.source_end_seconds, 14.5);
  const whoosh = op(operations, "whoosh").create_audio as Record<string, unknown>;
  close(whoosh.timeline_start, 1); close(whoosh.source_end_seconds, 2.115079);
  assert.deepEqual([whoosh.volume, whoosh.lane_key, whoosh.title], [1, "sound_effect_0", "Cape whoosh"]);
  assert.equal((whoosh.follows_visual as { element_id: string }).element_id, op(operations, "screen").element_id);
  close((whoosh.follows_visual as { offset_seconds: number }).offset_seconds, -.2);
});

test("timing dials: the pop moves with its whoosh and camera while the recording keeps its clock; length rescales the pop", () => {
  const later = compileBlock(setBlockSetting(wallHologramFixture(), "pop_timing", 6));
  const screen = visual(later, "screen");
  close(screen.timeline_start, 1.4); close(screen.source_start_seconds, .4, "same recording second at the same timeline second");
  close((op(later, "camera").create_shape as Record<string, number>).timeline_start, 1.4);
  close((op(later, "whoosh").create_audio as Record<string, number>).timeline_start, 1.2);
  const content = visual(compileBlock(setBlockSetting(wallHologramFixture(), "recording_timing", -6)), "screen");
  close(content.timeline_start, 1.2); close(content.source_start_seconds, 0);
  const long = keysOf(visual(compileBlock(setBlockSetting(wallHologramFixture(), "reveal_frames", 20)), "screen"), "media_scale");
  close(long[2].t, 2 / 3); close(long[1].t, .0546);
  // Earlier than the recording's start, the screen opens on its first frame instead of failing.
  close(visual(compileBlock(setBlockSetting(wallHologramFixture(), "pop_timing", -30)), "screen").source_start_seconds, 0);
});

test("look and placement dials reach the screen only; the take and the creator never change", () => {
  const base = compileBlock(wallHologramFixture());
  let block = wallHologramFixture();
  for (const [field, value] of [["exposure", 0], ["opacity", 50], ["scale", .5], ["rotation", 0], ["crop_top", 0]] as const) block = setBlockSetting(block, field, value);
  const tuned = compileBlock(block), screen = visual(tuned, "screen");
  assert.deepEqual(screen.color_grade, { grade_exposure_ev: 0 });
  assert.equal(screen.media_opacity, .5); close(keysOf(screen, "media_opacity")[2].v, .5);
  close(screen.media_offset_x, 0, "no turn, no compensation"); close(screen.media_scale, .5);
  assert.equal(screen.mask_inset, undefined);
  assert.equal((op(tuned, "camera").create_shape as Record<string, number>).media_rotation, 0);
  assert.deepEqual(op(tuned, "take"), op(base, "take"));
  assert.deepEqual(op(tuned, "person"), op(base, "person"));
});

test("derives through proposal validation; every dial endpoint compiles and resets to the authored card", () => {
  const block = wallHologramFixture({ remove_element_ids: [] });
  const elements = derive(block);
  assert.equal(elements.filter(element => element.type === "video_clip").length, 3);
  close(elements.find(element => element.props?.title === "Phone screen on the wall")!.duration, 10.86667, "screen", 1e-4);
  validateBlockRanges(block);
  const original = option(block);
  for (const item of resolveBlockSettings(block)) {
    if (item.setting.kind !== "number") continue;
    for (const value of [item.range.min, item.range.max]) applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: item.field, value }]);
  }
  assert.deepEqual(applyProposalNumericOverrides(original, []).operations, original.operations);
  const main = blockReviewChanges(wallHologramFixture(), 0).filter(change => change.control_tier === "main").map(change => change.label);
  assert.deepEqual(main, ["Screen opens", "Pop-open length", "Recording timing", "Screen opacity", "Screen brightness", "Whoosh level", "Screen sound", "Creator edge"]);
});

test("an uncovered take window, a short take and reversed lanes fail with actionable errors", () => {
  assert.throws(() => compileBlock(wallHologramFixture({ person_mask: { ...mask, frame_count: 300 } })), /person cut-out covers 2.1-12.1/);
  assert.throws(() => compileBlock(wallHologramFixture({ take: { source_url: `${media}/wall.mp4`, source_duration_seconds: 12, source_start_seconds: 73 / 30 } })), /take needs/);
  assert.throws(() => compileBlock(wallHologramFixture({ lane_order_keys: ["sound_effect_0", "visual_3", "visual_1", "visual_2", "visual_0"] })), /person above the screen/);
  const silent = wallHologramFixture({ whoosh: undefined });
  assert.equal(compileBlock(silent).filter(item => item.create_audio).length, 0);
  assert.ok(!blockReviewChanges(silent, 0).some(change => change.field.startsWith("whoosh_")));
});
