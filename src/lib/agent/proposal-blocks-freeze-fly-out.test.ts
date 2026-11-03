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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeze-fly-out-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const [name, duration, alpha] of [["take.mp4", 11.978633, false], ["cutout.webm", .7007, true], ["boom.mp3", 7.967347, false], ["whoosh.wav", 6.5, false]] as const) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration, alpha });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const media = "/api/projects/fixture/media";
const fps = 29.97002997002997;
const mask = { source_url: `${media}/grid-mattes/8b5ad7d1`, source_start_seconds: 0, fps, frame_count: 359, width: 540, height: 960, source_sha256: "4fa4ec05554222a07c840e556246c4d1da43569276cac9a4f0d7113c5c5c31ff" };
fs.mkdirSync(path.join(internalGridMatteDirectory("fixture"), "8b5ad7d1"), { recursive: true });
fs.writeFileSync(path.join(internalGridMatteDirectory("fixture"), "8b5ad7d1", "manifest.json"), JSON.stringify({ binding: mask, masks: [] }));
const TAKE = "1df7abd5-c482-4929-b10a-4319b2b95b8d";
/** The approved Fly Like Superman card (proposal 20261103T004630-fd95a41a, option fly-up) as block inputs. */
function supermanFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "fly", kind: "freeze_fly_out", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    take: { source_url: `${media}/take.mp4`, source_duration_seconds: 11.978633, source_start_seconds: 2.77 },
    freeze_seconds: 6.406, hold_seconds: 1.9, clean_frame_seconds: 10.67,
    person_mask: mask, cutout_id: "8b5ad7d1", edge: { expand_px: 24, feather_px: 8 },
    shadow: { inset: [.825, .49, .12, .22], feather: .02 },
    cutout: { source_url: `${media}/cutout.webm`, source_duration_seconds: .7007, take_offset_seconds: 6.2, window_seconds: .2 },
    flight: { direction: "up", seconds: .4, distance: 1.9, speed: .25, blur_px: 70, blur_ramp_seconds: .15 },
    sounds: [
      { source_url: `${media}/boom.mp3`, source_duration_seconds: 7.967347, source_sha256: "d4a3181bdf0d7b8d46d4be24118bc4a9f81df7d395888f2ed804c239a2e257a1", offset_seconds: -.16, volume: .56, fade_out: .6, end_with_picture: true, title: "Low boom" },
      { source_url: `${media}/whoosh.wav`, source_duration_seconds: 6.5, source_sha256: "0bce410155516847f61eb63cb7d7778e978eea03b6d17b3ee857ed74a1b091f7", source_start_seconds: 3.2, source_end_seconds: 5, offset_seconds: -.32, fade_out: .2, title: "Whoosh" },
    ],
    titles: { take: "Run and jump", patch: "Empty field inside his outline", shadow: "Empty field over his shadow", flyer: "Him flying up" },
    lane_order_keys: ["visual_3", "visual_2", "visual_1", "visual_0", "sound_effect_0", "sound_effect_1"], remove_element_ids: [TAKE], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "fly-up", label: "Fly up out of the frame", summary: "Fly", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(30, () => deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option(block).operations, "fixture").timeline.elements);
const close = (actual: unknown, expected: number, message?: string, tolerance = 1e-4) => assert.ok(Math.abs((actual as number) - expected) < tolerance, `${message ?? ""} ${actual} ≠ ${expected}`);
const op = (operations: ReturnType<typeof compileBlock>, role: string, index = 0) => operations.find(item => item.block_ref.role === role && item.block_ref.index === index)!;
const visual = (operations: ReturnType<typeof compileBlock>, role: string) => op(operations, role).create_visual as Record<string, unknown>;
const audio = (operations: ReturnType<typeof compileBlock>, index: number) => op(operations, "sound", index).create_audio as Record<string, unknown>;
type Key = { t: number; v: number; ease?: string };
const keysOf = (clip: Record<string, unknown>, field: string) => (clip.transition_keyframes as Record<string, Key[]>)[field];

test("compiles the approved Fly Like Superman card: run-up held at the takeoff, outline and shadow patches, flight out with blur, whoosh and boom", () => {
  const operations = compileBlock(supermanFixture());
  assert.deepEqual(operations.map(item => item.block_ref.role), ["remove", "lane_order", "take", "patch", "shadow", "flyer", "sound", "sound"]);
  assert.equal(op(operations, "remove").element_id, TAKE);
  const take = visual(operations, "take");
  assert.deepEqual([take.source_start_seconds, take.source_end_seconds, take.timeline_start, take.volume, take.lane_key], [2.77, 6.406, 0, 1, "visual_0"]);
  close(take.trailing_hold_seconds, 1.9);
  // The applied card starts the freeze on frame 109 of the 30 fps project (authored 3.636 s).
  const patch = visual(operations, "patch");
  close(patch.timeline_start, 109 / 30); close(patch.source_start_seconds, 10.67); close(patch.source_end_seconds, 10.7034, "one frame", 1e-3); close(patch.trailing_hold_seconds, 1.866, "", 1e-3);
  assert.deepEqual([patch.subject_window_parent_id, patch.subject_window_mode, patch.subject_window_expand, patch.subject_window_feather, patch.subject_window_strength, patch.volume, patch.lane_key],
    [op(operations, "take").element_id, "inside", 24, 8, 1, 0, "visual_1"]);
  assert.deepEqual(patch.subject_window_mask, mask);
  const shadow = visual(operations, "shadow");
  assert.deepEqual([shadow.mask_inset, shadow.mask_feather, shadow.subject_window_mask, shadow.lane_key], [[.825, .49, .12, .22], .02, undefined, "visual_2"]);
  const flyer = visual(operations, "flyer");
  close(flyer.timeline_start, 109 / 30); close(flyer.source_start_seconds, .206); close(flyer.source_end_seconds, .406);
  assert.deepEqual([flyer.playback_rate, flyer.has_alpha, flyer.volume, flyer.directional_blur_y, flyer.lane_key], [.25, true, 0, 70, "visual_3"]);
  const rise = keysOf(flyer, "media_offset_y");
  assert.deepEqual(rise.map(key => key.ease), ["easeIn", undefined]); close(rise[1].t, .4); close(rise[1].v, -1.9);
  const blur = keysOf(flyer, "directional_blur_y");
  assert.deepEqual(blur.map(key => [key.t, key.v, key.ease]), [[0, 0, "easeIn"], [.15, 70, "linear"], [.4, 70, undefined]]);
  // Sounds: the card placed them from the unsnapped 3.636 s; the block times them from the snapped freeze.
  const boom = audio(operations, 0);
  close(boom.timeline_start, 3.476, "boom", 5e-3); close(boom.source_end_seconds, 2.06, "boom ends with the picture");
  close((boom.timeline_start as number) + (boom.source_end_seconds as number), 109 / 30 + 1.9);
  assert.deepEqual([boom.volume, boom.fade_out, boom.lane_key, boom.title], [.56, .6, "sound_effect_0", "Low boom"]);
  const whoosh = audio(operations, 1);
  close(whoosh.timeline_start, 3.316, "whoosh", 5e-3);
  assert.deepEqual([whoosh.source_start_seconds, whoosh.source_end_seconds, whoosh.volume, whoosh.fade_out, whoosh.lane_key], [3.2, 5, 1, .2, "sound_effect_1"]);
});

test("the flying clip's window outlasts the flight at every speed; the freeze moves everything with it", () => {
  const fast = visual(compileBlock(setBlockSetting(supermanFixture(), "flight_speed", 1)), "flyer");
  assert.ok((fast.source_end_seconds as number) - (fast.source_start_seconds as number) >= .4, "full speed still covers the 0.4 s flight");
  const later = compileBlock(setBlockSetting(supermanFixture(), "freeze_timing", 3));
  close(visual(later, "take").source_end_seconds, 6.506);
  close(visual(later, "flyer").source_start_seconds, .306, "the flyer starts on the new freeze frame");
  close(visual(later, "patch").timeline_start, 112 / 30);
  close(audio(later, 1).timeline_start, 112 / 30 - .32);
  // Past the flying cut-out's footage the freeze clamps instead of failing.
  const clamped = visual(compileBlock(setBlockSetting(supermanFixture(), "freeze_timing", 15)), "flyer");
  assert.ok((clamped.source_start_seconds as number) + .2 <= .7007 + 1e-9);
});

test("direction, blur and hold dials reshape the flight and the ending only", () => {
  const base = compileBlock(supermanFixture());
  let block = setBlockSetting(supermanFixture(), "direction", "right");
  block = setBlockSetting(block, "blur", 0);
  const sideways = visual(compileBlock(block), "flyer");
  close(keysOf(sideways, "media_offset_x")[1].v, 1.9);
  assert.equal(keysOf(sideways, "media_offset_y"), undefined);
  assert.equal(sideways.directional_blur_x, undefined, "blur off adds no blur");
  const longer = compileBlock(setBlockSetting(supermanFixture(), "hold_frames", 90));
  close(visual(longer, "take").trailing_hold_seconds, 3);
  close(audio(longer, 0).source_end_seconds, 3.16, "the boom still ends with the picture");
  assert.deepEqual(op(longer, "flyer"), op(base, "flyer"));
});

test("derives through proposal validation; every dial endpoint compiles and resets to the authored card", () => {
  const block = supermanFixture({ remove_element_ids: [] });
  const elements = derive(block);
  assert.equal(elements.filter(element => element.type === "video_clip").length, 4);
  close(elements.find(element => element.props?.title === "Run and jump")!.duration, 166 / 30, "base", 1e-3);
  validateBlockRanges(block);
  const original = option(block);
  for (const item of resolveBlockSettings(block)) {
    if (item.setting.kind !== "number") continue;
    for (const value of [item.range.min, item.range.max]) applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: item.field, value }]);
  }
  assert.deepEqual(applyProposalNumericOverrides(original, []).operations, original.operations);
  const main = blockReviewChanges(supermanFixture(), 0).filter(change => change.control_tier === "main").map(change => change.label);
  assert.deepEqual(main, ["Freeze moment", "Hold after the freeze", "Flight length", "Pose speed", "Streak blur", "Patch edge", "Level of Low boom", "Level of Whoosh"]);
});

test("a freeze the outline cut-out does not cover, a missing empty frame and reversed lanes fail with actionable errors", () => {
  assert.throws(() => compileBlock(supermanFixture({ person_mask: { ...mask, frame_count: 150 } })), /freeze needs take footage/);
  assert.throws(() => compileBlock(supermanFixture({ clean_frame_seconds: 11.97 })), /past the take's end/);
  assert.throws(() => compileBlock(supermanFixture({ lane_order_keys: ["visual_1", "visual_3", "visual_2", "visual_0", "sound_effect_0", "sound_effect_1"] })), /flying clip above the patches/);
  const silent = supermanFixture({ sounds: [], shadow: undefined });
  assert.deepEqual(compileBlock(silent).map(item => item.block_ref.role), ["remove", "lane_order", "take", "patch", "flyer"]);
  // The live-preview mask drift that forced 24 px is fixed; the default is the 10 px the outline needed.
  const plain = supermanFixture({ edge: undefined });
  assert.equal(visual(compileBlock(plain), "patch").subject_window_expand, 10);
});
