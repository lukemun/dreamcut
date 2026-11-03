import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hyperspeed-unit-"));
process.env.TIMELINE_PROJECTS_DIR = scratch;
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
import { writePreparation } from "../local-store/media-preparation";
import { projectMediaDir } from "../local-store/paths";
import test from "node:test";
import assert from "node:assert/strict";
import { hyperspeedInputs, hyperspeedWindows } from "./proposal-blocks-hyperspeed";
import { validateBlockRanges, setBlockSetting, type BlockInstance } from "./proposal-blocks";
import { deriveProposalTimeline, editorAgentOptionSchema } from "./timeline-editor-agent-apply";
import { speedStepDuration, timelineTimeToSourceTime, speedAtTimelineTime } from "../timeline/speed-steps";
import { timelineElementPatchSchema } from "../timeline/contracts";

export const fixture = (portrait = false): BlockInstance => ({ block_id: "hyper", kind: "hyperspeed", version: 1, seed: "hyperspeed-test", frame_rate: portrait ? 24 : 30,
  settings: {}, inputs: { source: { source_url: "https://example.com/hyperspeed-take.mp4", source_duration_seconds: portrait ? 49 : 24,
    source_start_seconds: portrait ? 5 : 1, source_end_seconds: portrait ? 45 : 23 },
    fast_start_source_seconds: portrait ? 8 : 3, fast_end_source_seconds: portrait ? 41 : 21, timeline_start: portrait ? 2 : 0 } });
const compile = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "hyper", label: "Hyperspeed", summary: "Bounded retime", recommended: true, operations: [], blocks: [block] });

test("Hyperspeed keeps contiguous source windows and frame-aligned normal handles on two independent durations/fps", () => {
  for (const portrait of [false, true]) {
    const block = fixture(portrait);
    assert.doesNotThrow(() => validateBlockRanges(block));
    for (const speed of [1, 4, 15, 16]) {
      const project = `hyper-${block.frame_rate}`;
      const mediaDir = projectMediaDir(project);
      fs.mkdirSync(mediaDir, { recursive: true });
      fs.writeFileSync(path.join(mediaDir, "take.mp4"), "unit fixture; no pixel claims");
      const stat = fs.statSync(path.join(mediaDir, "take.mp4"));
      writePreparation(project, { recipe: "editor-media-v1", source: "take.mp4", size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: "take.mp4", render: "take.mp4", duration: portrait ? 49 : 24, alpha: false });
      const bound = { ...block, inputs: { ...block.inputs, source: { ...(block.inputs.source as object), source_url: `/api/projects/${project}/media/take.mp4` } } };
      const option = compile(setBlockSetting(bound, "speed", speed));
      fs.mkdirSync(path.join(scratch, project), { recursive: true });
      fs.writeFileSync(path.join(scratch, project, "metadata.json"), JSON.stringify({ frame_rate: block.frame_rate, delivery_target: "web", hidden_lane_keys: [] }));
      fs.writeFileSync(path.join(scratch, project, "timeline.json"), JSON.stringify({ elements: [], transitions: [] }));
      const clips = deriveProposalTimeline({ elements: [], transitions: [] }, option.operations, project).timeline.elements;
      assert.equal(clips.length, 3);
      assert.deepEqual(clips.map(c => c.playback_rate === 1), [true, speed === 1, true]);
      for (const [i, clip] of clips.entries()) {
        assert.ok(clip.playback_rate! <= speed + 1e-6);
        assert.ok(Math.abs(speedStepDuration(clip) - clip.duration) < 1e-5);
        for (let frame = 0; frame < Math.round(clip.duration * block.frame_rate!); frame++) {
          const s = timelineTimeToSourceTime(clip, frame / block.frame_rate!);
          assert.ok(s >= clip.trim_start! && s < Number(clip.props.source_duration_seconds) - clip.trim_end! + 1e-6);
        }
        if (i) {
          const prev = clips[i - 1]!;
          assert.ok(Math.abs(prev.timeline_start + prev.duration - clip.timeline_start) < 1e-5);
          assert.ok(Math.abs(Number(prev.props.source_duration_seconds) - prev.trim_end! - clip.trim_start!) < 1e-5);
        }
      }
      assert.equal(clips[1]!.volume, 0);
      assert.equal(clips[0]!.volume, 1);
      assert.equal(clips[2]!.volume, 1);
      assert.equal(clips[1]!.props.directional_blur_x, speed === 1 ? 0 : 108);
      const again = compile(setBlockSetting(bound, "speed", speed));
      assert.deepEqual(again.operations, option.operations);
      assert.deepEqual(compile(block).blocks?.[0]?.settings, {});
    }
  }
});

test("audio policy, blur off/axis, stable identities and reset survive recompilation", () => {
  const original = fixture();
  const a = compile(original);
  const changed = compile({ ...original, settings: { speed: 16, blur: 0, audio: "silent", volume: 200 } });
  assert.deepEqual(changed.operations.map(o => o.element_id), a.operations.map(o => o.element_id));
  assert.ok(changed.operations.every(o => o.create_visual?.volume === 0));
  assert.equal(changed.operations[1]!.create_visual?.directional_blur_x, 0);
  const vertical = compile({ ...original, settings: { blur: 100, blur_axis: "vertical" } });
  assert.equal(vertical.operations[1]!.create_visual?.directional_blur_y, 1080);
  assert.equal(vertical.operations[1]!.create_visual?.directional_blur_x, 0);
  assert.deepEqual(compile(original), a);
});

test("bad source bounds, missing handles, unaligned marks and invalid speed fail closed", () => {
  const input = hyperspeedInputs.parse(fixture().inputs);
  for (const end of [3, 25, NaN]) assert.equal(hyperspeedInputs.safeParse({ ...input, fast_end_source_seconds: end }).success, false);
  assert.throws(() => hyperspeedWindows({ ...input, fast_start_source_seconds: 3.01 }, 15, 30), /frame grid/);
  for (const speed of [0, 16.1, Infinity]) assert.throws(() => hyperspeedWindows(input, speed, 30), /1–16/);
  assert.throws(() => compile({ ...fixture(), settings: { speed: 17 } }), /outside/);
});

test("shared speed clock admits 15–16x without the old silent 4x clamp", () => {
  const clip = { duration: 4, trim_start: 1, trim_end: 1, playback_rate: 1,
    props: { source_duration_seconds: 34, keyframes: { playback_rate: [{ t: 1, source_t: 2, v: 15 }, { t: 3, source_t: 32, v: 1 }] } } };
  assert.equal(speedAtTimelineTime(clip, 1.5), 15);
  assert.equal(timelineTimeToSourceTime(clip, 2), 17);
  assert.equal(speedStepDuration(clip), 4);
  assert.ok(timelineElementPatchSchema.safeParse({ playback_rate: 16 }).success);
  assert.ok(timelineElementPatchSchema.safeParse({ playback_rate: 77 }).success);
  assert.equal(timelineElementPatchSchema.safeParse({ playback_rate: 100.01 }).success, false);

});

test("prepared temporal blur stays on the retimed source clock and has a real off/reset dial",()=>{
 const original=fixture();
 const inputs={...original.inputs,temporal_blur:{source_url:"https://example.com/temporal.mp4",source_duration_seconds:24,original_source_url:"https://example.com/hyperspeed-take.mp4",frame_rate:30,sample_frames:15},lane_order_keys:["visual_1","visual_0"]};
 const base={...original,inputs};
 for(const speed of [1,4,15,16])for(const blur of [0,100]){
  const option=compile({...base,settings:{speed,blur}});
  const fast=option.operations.find(o=>o.block_ref?.role==="fast")!.create_visual!;
  const overlay=option.operations.find(o=>o.block_ref?.role==="fast_blur")!.create_visual!;
  assert.deepEqual([overlay.source_start_seconds,overlay.source_end_seconds,overlay.timeline_start,overlay.playback_rate],[fast.source_start_seconds,fast.source_end_seconds,fast.timeline_start,fast.playback_rate]);
  assert.equal(overlay.volume,0);assert.equal(overlay.media_opacity,speed===1?0:blur/100);
  assert.equal(fast.directional_blur_x,0);assert.equal(fast.directional_blur_y,0);
 }
 assert.equal(compile(base).operations.find(o=>o.block_ref?.role==="fast_blur")!.create_visual!.media_opacity,1);
 assert.throws(()=>compile({...base,inputs:{...inputs,temporal_blur:{...inputs.temporal_blur,original_source_url:"wrong"}}}),/original source/);
 assert.throws(()=>compile({...base,inputs:{...inputs,temporal_blur:{...inputs.temporal_blur,frame_rate:24}}}),/cadence/);
 assert.throws(()=>compile({...base,inputs:{...inputs,lane_order_keys:["visual_0","visual_1"]}}),/lane/);
});
