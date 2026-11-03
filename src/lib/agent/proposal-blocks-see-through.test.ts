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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "see-through-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const [name, duration, alpha] of [["take.mp4", 37.964622, false], ["cutouts/take-cutout.webm", 14.481, true]] as const) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration, alpha });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const media = "/api/projects/fixture/media";
const sha = "ef45ad4d4b2d19f5aa70c95c858267609458dfcd6a85d12e17e6586d7dfa12a0";
/** The approved Ghost card (proposal 20261102T223134-e39026d3, option ghost-rise) as block inputs. */
function ghostFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "ghost", kind: "see_through_copy", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    take: { source_url: `${media}/take.mp4`, source_duration_seconds: 37.964622, source_sha256: sha },
    base_start_seconds: 6.24, duration_seconds: 13.98, copy_start_seconds: .5, clock_offset_seconds: 13.26,
    cutout: { source_url: `${media}/cutouts/take-cutout.webm`, source_duration_seconds: 14.481, take_offset_seconds: 19.5, cutout_id: "a8547f24" },
    copy_line: { source_start_seconds: 22.6, source_end_seconds: 25.6 },
    titles: { base: "Man seated on the bench", copy: "Ghost of the man standing up", line: "Ghost's line" },
    lane_order_keys: ["visual_1", "visual_0", "audio_1"], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "ghost", label: "Ghost", summary: "Ghost", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(30, () => deriveProposalTimeline({ elements: [], transitions: [] } as unknown as TimelineFile, option(block).operations, "fixture").timeline.elements);
const close = (actual: unknown, expected: number, message?: string) => assert.ok(Math.abs((actual as number) - expected) < 1e-9, `${message ?? ""} ${actual} ≠ ${expected}`);
const op = (operations: ReturnType<typeof compileBlock>, role: string) => operations.find(item => item.block_ref.role === role)!;
// The card's 13.98 s window is 419 whole frames at 30 fps; the block frame-quantizes it.
const window = 419 / 30;

test("compiles the approved Ghost card: base window, see-through cut-out on the take's clock, the copy's line on the copy's clock", () => {
  const operations = compileBlock(ghostFixture());
  assert.deepEqual(operations.map(item => item.block_ref.role), ["lane_order", "base", "copy", "line"]);
  assert.deepEqual((op(operations, "lane_order").set_lane_order as { lane_order_keys: string[] }).lane_order_keys, ["visual_1", "visual_0", "audio_1"]);
  const base = op(operations, "base").create_visual as Record<string, unknown>;
  close(base.source_start_seconds, 6.24); close(base.source_end_seconds, 6.24 + window);
  assert.deepEqual([base.timeline_start, base.volume, base.lane_key, base.title], [0, 1, "visual_0", "Man seated on the bench"]);
  const copy = op(operations, "copy").create_visual as Record<string, unknown>;
  close(copy.source_start_seconds, .5); close(copy.source_end_seconds, window); close(copy.timeline_start, .5);
  assert.deepEqual([copy.volume, copy.media_opacity, copy.has_alpha, copy.lane_key, copy.source_url], [0, .5, true, "visual_1", `${media}/cutouts/take-cutout.webm`]);
  // Copy clock = base clock + 13.26 s: base take second 6.74 at 0.5 s, copy take second 20.0 (cut-out 0.5 s).
  close(6.24 + .5 + 13.26 - 19.5, copy.source_start_seconds as number, "clock offset");
  const line = op(operations, "line").create_audio as Record<string, unknown>;
  close(line.timeline_start, 3.1); close(line.source_start_seconds, 22.6); close(line.source_end_seconds, 25.6);
  close(line.fade_in, 1 / 30); close(line.fade_out, .1);
  assert.deepEqual([line.type, line.volume, line.source_url, line.source_sha256, line.lane_key], ["vo_segment", 1, `${media}/take.mp4`, sha, "audio_1"]);
  assert.deepEqual(line.follows_visual, { element_id: op(operations, "copy").element_id, offset_seconds: (line.timeline_start as number) - .5 });
});

test("Line timing moves the copy and its line together across the card's ±15-frame range", () => {
  // The card's Ghost line timing at 0.5 s and 1.5 s: copy source 0.0 / 1.0, line at 3.6 s / 2.6 s.
  for (const [frames, copyStart, lineAt] of [[15, 0, 3.6], [-15, 1, 2.6]] as const) {
    const operations = compileBlock(setBlockSetting(ghostFixture(), "line_timing_frames", frames));
    const copy = op(operations, "copy").create_visual as Record<string, number>, line = op(operations, "line").create_audio as Record<string, number>;
    close(copy.source_start_seconds, copyStart); close(line.timeline_start, lineAt);
    close(line.source_start_seconds, 22.6, "line source stays");
    close(line.timeline_start - copy.timeline_start, (line.source_start_seconds - 19.5) - copy.source_start_seconds, "line on the copy's clock");
  }
  assert.deepEqual(op(compileBlock(setBlockSetting(ghostFixture(), "line_timing_frames", 15)), "base"), op(compileBlock(ghostFixture()), "base"), "timing never touches the base");
  // Handles clamp at the cut-out's ends.
  close((op(compileBlock(setBlockSetting(ghostFixture(), "line_timing_frames", 30)), "copy").create_visual as Record<string, number>).source_start_seconds, 0);
  assert.ok((op(compileBlock(setBlockSetting(ghostFixture(), "line_timing_frames", -30)), "copy").create_visual as Record<string, number>).source_end_seconds <= 14.481 + 1e-9);
});

test("derives through proposal validation; every dial endpoint compiles and resets to the authored card", () => {
  const block = ghostFixture();
  const elements = derive(block);
  assert.equal(elements.filter(element => element.type === "video_clip").length, 2);
  const copy = elements.find(element => element.props?.title === "Ghost of the man standing up")!;
  close(copy.timeline_start, .5); close(copy.trim_start, .5);
  assert.equal(copy.props?.media_opacity, .5);
  validateBlockRanges(block);
  const original = option(block);
  for (const item of resolveBlockSettings(block)) {
    if (item.setting.kind !== "number") continue;
    for (const value of [item.range.min, item.range.max]) applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: item.field, value }]);
  }
  assert.deepEqual(applyProposalNumericOverrides(original, []).operations, original.operations);
});

test("main dials lead the card; line dials leave a card with no line", () => {
  const main = blockReviewChanges(ghostFixture(), 0).filter(change => change.control_tier === "main").map(change => change.label);
  assert.deepEqual(main, ["Opacity", "Line timing", "Copy line level"]);
  const silent = ghostFixture({ copy_line: undefined });
  assert.ok(!blockReviewChanges(silent, 0).some(change => change.field.startsWith("line_") && change.field !== "line_timing_frames"));
  assert.equal(compileBlock(silent).filter(item => item.create_audio).length, 0);
  validateBlockRanges(silent);
});

test("missing take, short cut-out, reversed lanes and a backwards line fail with actionable errors", () => {
  assert.throws(() => compileBlock(ghostFixture({ take: { source_url: `${media}/take.mp4`, source_duration_seconds: 15 }, copy_line: undefined })), /base window needs/);
  assert.throws(() => compileBlock(ghostFixture({ cutout: { source_url: `${media}/cutouts/take-cutout.webm`, source_duration_seconds: 5, take_offset_seconds: 19.5 } })), /cut-out needs/);
  assert.throws(() => compileBlock(ghostFixture({ lane_order_keys: ["visual_0", "visual_1"] })), /copy above the base/);
  assert.throws(() => compileBlock(ghostFixture({ copy_line: { source_start_seconds: 25, source_end_seconds: 24 } })), /end after it starts/);
  assert.throws(() => compileBlock(ghostFixture({ copy_start_seconds: 20 })), /inside the base window/);
});
