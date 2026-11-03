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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "skyline-cover-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const [name, duration, alpha] of [["stadium.mov", 15.121667, false], ["roofline.webm", 4.937, true]] as const) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration, alpha });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const media = "/api/projects/fixture/media";
const TAKE = "655cef6b-0000-4000-8000-000000000000";
/** The approved Building Jump card (proposal 20261102T235602-f9416d2d, option jump-over) as block inputs. */
function buildingJumpFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "jump", kind: "skyline_cover", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    take: { source_url: `${media}/stadium.mov`, source_duration_seconds: 15.121667 },
    main_start_seconds: .734, duration_seconds: 9.056,
    cover: { source_start_seconds: 10.2, source_end_seconds: 15.121667, playback_rate: .976 },
    cover_inset: [.56, 0, 0, 0],
    edge_cutout: { source_url: `${media}/roofline.webm`, source_duration_seconds: 4.937, take_offset_seconds: 10.2, cutout_id: "507459aa" },
    cover_exposure_ev: .6, fade_seconds: .2,
    titles: { main: "Run and jump", cover: "Empty stadium and grass", edge: "Empty stadium roofline" },
    lane_order_keys: ["visual_2", "visual_1", "visual_0"], remove_element_ids: [TAKE], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "jump-over", label: "Jump over", summary: "Jump over", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(30, () => deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option(block).operations, "fixture").timeline.elements);
const close = (actual: unknown, expected: number, message?: string, tolerance = 1e-9) => assert.ok(Math.abs((actual as number) - expected) < tolerance, `${message ?? ""} ${actual} ≠ ${expected}`);
const op = (operations: ReturnType<typeof compileBlock>, role: string) => operations.find(item => item.block_ref.role === role)!;
const visual = (operations: ReturnType<typeof compileBlock>, role: string) => op(operations, role).create_visual as Record<string, unknown>;

test("compiles the approved Building Jump card: main window, empty-end rectangle and skyline cut-out, brightened, fading out", () => {
  const operations = compileBlock(buildingJumpFixture());
  assert.deepEqual(operations.map(item => item.block_ref.role), ["remove", "lane_order", "main", "cover", "edge"]);
  assert.equal(op(operations, "remove").element_id, TAKE);
  assert.deepEqual((op(operations, "lane_order").set_lane_order as { lane_order_keys: string[] }).lane_order_keys, ["visual_2", "visual_1", "visual_0"]);
  const main = visual(operations, "main");
  close(main.source_start_seconds, .734); close(main.source_end_seconds, .734 + 272 / 30, "the card's 9.056 s (271.68 frames) snaps to 272 frames, 0.3 of a frame past its 9.79 s");
  assert.deepEqual([main.timeline_start, main.volume, main.lane_key, main.title], [0, 1, "visual_0", "Run and jump"]);
  const cover = visual(operations, "cover");
  assert.deepEqual([cover.source_start_seconds, cover.source_end_seconds, cover.playback_rate, cover.timeline_start, cover.volume, cover.lane_key, cover.title],
    [10.2, 15.121667, .976, 0, 0, "visual_1", "Empty stadium and grass"]);
  assert.deepEqual(cover.mask_inset, [.56, 0, 0, 0]);
  assert.deepEqual([cover.mask_feather, cover.color_grade, cover.animationOut], [0, { grade_exposure_ev: .6 }, "fade"]);
  close(cover.animationOutDuration, .2);
  const edge = visual(operations, "edge");
  assert.deepEqual([edge.source_start_seconds, edge.playback_rate, edge.has_alpha, edge.lane_key, edge.color_grade, edge.animationOut, edge.title],
    [0, .976, true, "visual_2", { grade_exposure_ev: .6 }, "fade", "Empty stadium roofline"]);
  // The card ended the cut-out at 4.92 s; the block ends it with the cover (4.921667 s), 0.05 of a frame later.
  close(edge.source_end_seconds, 4.92, "edge out", 2e-3);
  close(edge.animationOutDuration, .2);
});

test("fade timing moves the end of the cover by changing its rate; brightness and fade length reach both layers", () => {
  const later = compileBlock(setBlockSetting(buildingJumpFixture(), "fade_timing_frames", 6));
  const cover = visual(later, "cover") as Record<string, number>, edge = visual(later, "edge") as Record<string, number>;
  close((cover.source_end_seconds - cover.source_start_seconds) / cover.playback_rate, 4.921667 / .976 + .2, "cover ends 6 frames later", 1e-6);
  assert.equal(edge.playback_rate, cover.playback_rate);
  assert.deepEqual([cover.source_start_seconds, cover.source_end_seconds], [10.2, 15.121667], "the same empty footage");
  const bright = compileBlock(setBlockSetting(setBlockSetting(buildingJumpFixture(), "cover_exposure", 1), "fade_frames", 0));
  for (const role of ["cover", "edge"]) {
    assert.deepEqual(visual(bright, role).color_grade, { grade_exposure_ev: 1 });
    assert.equal(visual(bright, role).animationOut, undefined, `${role} cuts with no fade`);
  }
  assert.deepEqual(op(later, "main"), op(compileBlock(buildingJumpFixture()), "main"), "the cover dials never touch the main take");
});

test("derives through proposal validation; every dial endpoint compiles and resets to the authored card", () => {
  const block = buildingJumpFixture({ remove_element_ids: [] });
  const elements = derive(block);
  assert.equal(elements.filter(element => element.type === "video_clip").length, 3);
  const cover = elements.find(element => element.props?.title === "Empty stadium and grass")!;
  // As on the applied timeline (revision 7dfbf776): main 272 frames, both cover layers 151.
  close(cover.duration, 151 / 30, "cover", 1e-6);
  close(elements.find(element => element.props?.title === "Empty stadium roofline")!.duration, 151 / 30, "skyline", 1e-6);
  close(elements.find(element => element.props?.title === "Run and jump")!.duration, 272 / 30, "main", 1e-6);
  validateBlockRanges(block);
  const original = option(block);
  for (const item of resolveBlockSettings(block)) {
    if (item.setting.kind !== "number") continue;
    for (const value of [item.range.min, item.range.max]) {
      const tuned = applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: item.field, value }]);
      const covered = tuned.operations.find(entry => entry.block_ref?.role === "cover")!.create_visual as Record<string, number> & { mask_inset: number[] };
      assert.ok(covered.mask_inset[0]! + covered.mask_inset[2]! < 1 && covered.mask_inset[1]! + covered.mask_inset[3]! < 1, `${item.field} at ${value} keeps the cover open`);
      assert.ok((covered.source_end_seconds - covered.source_start_seconds) / covered.playback_rate <= 272 / 30 + 1e-6, `${item.field} at ${value} ends inside the main window`);
    }
  }
  assert.deepEqual(applyProposalNumericOverrides(original, []).operations, original.operations);
});

test("main dials lead the card; a cover without a skyline cut-out is one layer", () => {
  const main = blockReviewChanges(buildingJumpFixture(), 0).filter(change => change.control_tier === "main").map(change => change.label);
  assert.deepEqual(main, ["Fade timing", "Fade length", "Cover top edge", "Cover brightness", "Take sound"]);
  const plain = buildingJumpFixture({ edge_cutout: undefined, lane_order_keys: ["visual_1", "visual_0"] });
  assert.deepEqual(compileBlock(plain).map(item => item.block_ref.role), ["remove", "lane_order", "main", "cover"]);
  validateBlockRanges(plain);
});

test("a cover past the window, an uncovered skyline and reversed lanes fail with actionable errors", () => {
  assert.throws(() => compileBlock(buildingJumpFixture({ duration_seconds: 4 })), /must end inside the 4s main window/);
  assert.throws(() => compileBlock(buildingJumpFixture({ edge_cutout: { source_url: `${media}/roofline.webm`, source_duration_seconds: 3, take_offset_seconds: 10.2 } })), /skyline cut-out must cover/);
  assert.throws(() => compileBlock(buildingJumpFixture({ cover: { source_start_seconds: 10.2, source_end_seconds: 16 } })), /past the end of the take/);
  assert.throws(() => compileBlock(buildingJumpFixture({ lane_order_keys: ["visual_0", "visual_2", "visual_1"] })), /cover lanes above the main take/);
  assert.throws(() => compileBlock(buildingJumpFixture({ cover_inset: [.6, 0, .4, 0] })), /at least 5%/);
});
