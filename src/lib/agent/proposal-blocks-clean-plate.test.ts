import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileBlock, resolveBlockSettings, setBlockSetting, validateBlockRanges, type BlockInstance } from "./proposal-blocks";
import { deriveProposalTimeline, editorAgentOptionSchema } from "./timeline-editor-agent-apply";
import { applyProposalReviewOverrides, applyProposalNumericOverrides } from "./proposal-overrides";
import type { TimelineFile } from "../local-store/store";
import { writePreparation } from "../local-store/media-preparation";
import { projectMediaDir } from "../local-store/paths";
import { withFrameRate } from "../timeline/frame-rate-scope";
import { createProject, readMetadata, writeMetadata } from "../local-store/store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-plate-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;
createProject("fixture", "web");
for (const name of ["hero.mp4", "plate.mp4"]) {
  const file = path.join(projectMediaDir("fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "prepared contract fixture");
  fs.writeFileSync(file + ".preview.mp4", "preview fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration: 9, alpha: false });
}
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const empty = { elements: [], transitions: [] } as unknown as TimelineFile;
export function revealFixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "object-appear", kind: "clean_plate_reveal", version: 1, frame_rate: 30, seed: "test", settings: {}, inputs: {
    hero: { source_url: "/api/projects/fixture/media/hero.mp4", source_duration_seconds: 8, source_start_seconds: 1 },
    clean_plate: { source_url: "/api/projects/fixture/media/plate.mp4", source_duration_seconds: 9, source_start_seconds: 2 },
    duration_seconds: 4, reveal_seconds: 2,
    patch: { left: .55, right: .85, top: .4, bottom: .8 },
    lane_order_keys: ["visual_1", "visual_0"], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "reveal", label: "Object Appear", summary: "Reveal at the gesture", recommended: true, operations: [], blocks: [block] });
const derive = (block: BlockInstance) => withFrameRate(block.frame_rate ?? 30, () => deriveProposalTimeline(empty, option(block).operations, "fixture").timeline.elements);

test("continuous hero and silent local patch retain independent source windows and exact reveal frame", () => {
  const elements = derive(revealFixture());
  const hero = elements.find(e => e.props?.title === "Continuous performance")!;
  const patch = elements.find(e => e.props?.title === "Clean plate patch")!;
  assert.equal(elements.length, 2);
  assert.equal(hero.duration, 4); assert.equal(hero.trim_start, 1); assert.equal(hero.volume, 1);
  assert.equal(patch.duration, 2); assert.equal(patch.trim_start, 2); assert.equal(patch.volume, 0);
  const edges = patch.props!.mask_inset as number[];
  [.4, .15, .2, .55].forEach((v, i) => assert.ok(Math.abs(edges[i]! - v) < 1e-9));
  const tuned = derive(setBlockSetting(revealFixture(), "reveal_shift_frames", 7));
  const withoutDates = ({ created_at: _created, updated_at: _updated, ...rest }: typeof hero) => rest;
  assert.deepEqual(withoutDates(tuned.find(e => e.id === hero.id)!), withoutDates(hero), "timing dial never cuts or retimes hero");
  assert.equal(tuned.find(e => e.id === patch.id)!.duration, 67 / 30);
});

test("every advertised dial endpoint compiles through proposal validation, with safe combined mask corners", () => {
  const block = revealFixture();
  validateBlockRanges(block);
  for (const endpoint of ["min", "max"] as const) {
    let tuned = block;
    for (const setting of resolveBlockSettings(block)) {
      tuned = setBlockSetting(tuned, setting.field, setting.range[endpoint]);
      option(tuned);
    }
    const patch = derive(tuned).find(e => e.props?.title === "Clean plate patch")!;
    const [top, right, bottom, left] = patch.props!.mask_inset as number[];
    assert.ok(top! + bottom! < 1 && left! + right! < 1);
  }
});

test("shared proposal overrides recompile and reset timing, geometry and alignment deterministically", () => {
  const block = revealFixture(), original = option(block);
  const tuned = applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: block.block_id, field: "align_x", value: 10 }]);
  assert.equal(tuned.operations.find(o => o.create_visual?.title === "Clean plate patch")!.create_visual!.media_offset_x, .2);
  const reset = applyProposalNumericOverrides(tuned, [{ operation_index: 0, target: "block", block_id: block.block_id, field: "align_x", value: 0 }]);
  assert.deepEqual(reset.operations, original.operations);
});

test("short windows support a hidden patch and fully covered endpoints without zero-duration clips", () => {
  for (const fps of [24, 30, 60]) {
    writeMetadata("fixture", { ...readMetadata("fixture"), frame_rate: fps }, "fixture");
    const block = { ...revealFixture({ duration_seconds: 2 / fps, reveal_seconds: 1 / fps }), frame_rate: fps };
    validateBlockRanges(block);
    const immediate = derive(setBlockSetting(block, "reveal_shift_frames", -30));
    assert.equal(immediate.length, 2);
    assert.equal(immediate.find(e => e.volume === 0)!.props!.media_opacity, 0);
    assert.equal(derive(setBlockSetting(block, "reveal_shift_frames", 30)).find(e => e.volume === 0)!.duration, 2 / fps);
  }
  writeMetadata("fixture", { ...readMetadata("fixture"), frame_rate: 30 }, "fixture");
});

test("still plates work; missing handles, inverted patches and reversed lanes fail with actionable errors", () => {
  const still = revealFixture({ clean_plate: { type: "still", source_url: "/api/projects/fixture/media/empty.png", source_duration_seconds: 4 } });
  assert.equal(derive(still).find(e => e.type === "still")!.duration, 2);
  assert.throws(() => compileBlock(revealFixture({ hero: { source_url: "/hero.mp4", source_duration_seconds: 2 } })), /Hero needs/);
  assert.throws(() => compileBlock(revealFixture({ clean_plate: { source_url: "/plate.mp4", source_duration_seconds: 1 } })), /Clean plate needs/);
  assert.throws(() => compileBlock(revealFixture({ patch: { left: .8, right: .4, top: .4, bottom: .8 } })), /Patch must/);
  assert.throws(() => compileBlock(revealFixture({ lane_order_keys: ["visual_0", "visual_1"] })), /patch above/);
  assert.throws(() => compileBlock(revealFixture({ reveal_seconds: 6 })), /Reveal must/);
});

test("short supplied empty take supports a longer continuous hero when every reveal endpoint fits", () => {
  const block = revealFixture({hero:{source_url:"/api/projects/fixture/media/hero.mp4",source_duration_seconds:9.676333},clean_plate:{source_url:"/api/projects/fixture/media/plate.mp4",source_duration_seconds:5.472133},duration_seconds:9.6,reveal_seconds:2});
  for(const shift of [-30,0,30]) {
    const elements=derive(setBlockSetting(block,"reveal_shift_frames",shift));
    assert.equal(elements.find(e=>e.volume===1)!.duration,9.6);
    assert.equal(elements.find(e=>e.volume===0)!.duration,2+shift/30);
  }
  assert.throws(()=>compileBlock(revealFixture({duration_seconds:4,reveal_seconds:3,clean_plate:{source_url:"/api/projects/fixture/media/plate.mp4",source_duration_seconds:3.5}})),/Clean plate needs 4s/);
});


test("review tuning can cross an immediate reveal without changing operation scope", () => {
  const initial = option(revealFixture({ reveal_seconds: .5 }));
  const proposal = { options: [initial], caps: { max_mutations: 10000 } };
  const tuned = applyProposalReviewOverrides(proposal as Parameters<typeof applyProposalReviewOverrides>[0], "reveal", [{ operation_index: 0, target: "block", field: "reveal_shift_frames", value: -30 }]);
  assert.equal(tuned.options[0]!.operations.length, initial.operations.length);
  const patch = tuned.options[0]!.operations.find(op => op.block_ref?.role === "patch");
  assert.equal(patch?.create_visual?.media_opacity, 0);
});
