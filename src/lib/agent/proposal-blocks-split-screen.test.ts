import assert from "node:assert/strict";
import test from "node:test";
import { compileBlock, resolveBlockSettings, setBlockSetting, validateBlockRanges, type BlockInstance } from "./proposal-blocks";
import { editorAgentOptionSchema } from "./timeline-editor-agent-apply";

const fixture = (inputs = {}): BlockInstance => ({ block_id: "clones", kind: "split_screen", version: 1, frame_rate: 30, seed: "split-test", settings: {}, inputs: {
  left: { source_url: "/api/projects/fixture/media/left.mp4", source_duration_seconds: 15, source_start_seconds: 2 },
  right: { source_url: "/api/projects/fixture/media/right.mp4", source_duration_seconds: 15, source_start_seconds: 5 },
  duration_seconds: 4, lane_order_keys: ["visual_1", "visual_0"], ...inputs,
} });
const option = (b: BlockInstance) => editorAgentOptionSchema.parse({ id: "clones", label: "Clones", summary: "Two live takes", recommended: true, operations: [], blocks: [b] });
const visuals = (b: BlockInstance) => option(b).operations.flatMap(o => o.create_visual ? [o.create_visual] : []);

test("split screen retains two independent continuous 1x source windows and one audio take", () => {
  const [left, right] = visuals(fixture());
  assert.equal(left.source_start_seconds, 2); assert.equal(left.source_end_seconds, 6);
  assert.equal(right.source_start_seconds, 5); assert.equal(right.source_end_seconds, 9);
  assert.equal(left.playback_rate, 1); assert.equal(right.playback_rate, 1);
  assert.equal(left.volume, 1); assert.equal(right.volume, 0);
  assert.equal(left.mask_inset, undefined); assert.deepEqual(right.mask_inset, [0, 0, 0, .5]);
  assert.equal(right.lane_index, 1); assert.equal(left.lane_index, 0);
  for (const audio of ["right", "silent"]) {
    const v = visuals(setBlockSetting(fixture(), "audio", audio));
    assert.deepEqual(v.map(x => x.volume), audio === "right" ? [0, 1] : [0, 0]);
  }
});

test("all advertised endpoints parse and timing tuning retains duration, source bounds and stable identities", () => {
  const base = fixture(); validateBlockRanges(base);
  const authored = option(base);
  for (const dial of resolveBlockSettings(base)) {
    if (dial.setting.kind !== "number") continue;
    for (const value of [dial.range.min, dial.range.max]) {
      const tuned = setBlockSetting(base, dial.field, value);
      const result = option(tuned);
      assert.deepEqual(result.operations.map(o => o.element_id), authored.operations.map(o => o.element_id));
      for (const v of visuals(tuned)) {
        assert.equal(v.source_end_seconds! - v.source_start_seconds!, 4);
        assert.ok(v.source_start_seconds! >= 0 && v.source_end_seconds! <= v.source_duration_seconds!);
      }
      assert.deepEqual(compileBlock(setBlockSetting(tuned, dial.field, dial.value)), compileBlock(base));
    }
  }
});

test("short handled windows clamp source timing at 24/30/60fps without cutting or retiming", () => {
  for (const fps of [24, 30, 60]) {
    const b = { ...fixture({ right: { source_url: "/api/projects/fixture/media/r.mp4", source_duration_seconds: 4.1, source_start_seconds: .05 } }), frame_rate: fps };
    for (const shift of [-30, 30]) {
      const right = visuals(setBlockSetting(b, "timing", shift))[1];
      assert.ok(right.source_start_seconds! >= 0);
      assert.ok(right.source_end_seconds! <= 4.1 + 1e-7);
      assert.equal(right.playback_rate, 1);
      assert.ok(Math.abs(right.source_end_seconds! - right.source_start_seconds! - 4) < 1e-9);
    }
  }
});

test("insufficient source handles and invalid lane contracts refuse instead of baking or hiding errors", () => {
  assert.throws(() => compileBlock(fixture({ duration_seconds: 20 })), /Left take needs/);
  assert.throws(() => compileBlock(fixture({ right: { source_url: "/api/projects/fixture/media/r.mp4", source_duration_seconds: 3 } })), /Right take needs/);
  assert.throws(() => compileBlock(fixture({ lane_order_keys: ["visual_0", "visual_1"] })), /right above left/);
  assert.throws(() => compileBlock(fixture({ lane_order_keys: ["visual_1", "visual_0", "visual_1"] })), /distinct lanes/);
  assert.throws(() => compileBlock(fixture({ duration_seconds: .001 })), /at least one output frame/);
});

test("split-screen softness reaches both renderers on portrait and landscape canvases", async () => {
  const {gpuRotatedLineMask} = await import("../gpu-preview/feather-mask");
  const {maskInsetStyle} = await import("../timeline/media-transform");
  for (const seam of [5,50,95]) for (const width of [1080,1920]) {
    const right = visuals(setBlockSetting(setBlockSetting(fixture(), "seam", seam),"feather",2))[1];
    const mask = {top:0,right:0,bottom:0,left:right.mask_inset![3]};
    const plan = gpuRotatedLineMask(mask,right.mask_feather!,0,width,1080)!;
    assert.equal(plan[0],1); assert.equal(plan[1],0);
    assert.equal(plan[2],seam/100*width);
    assert.ok(plan[3]>0,"softness creates a nonzero pixel ramp");
    assert.match(maskInsetStyle(mask,right.mask_feather!).maskImage!,/linear-gradient\(to right/);
  }
});
