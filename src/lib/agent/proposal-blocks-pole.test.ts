import assert from "node:assert/strict";
import test from "node:test";
import { blockDefinition, compileBlock, type BlockInstance } from "./proposal-blocks";
import { staticSceneSplitBlock } from "./proposal-blocks-pole";
import { settingDefault, type BlockSettings } from "./proposal-block-kit";
import { editorAgentCreateVisualSchema } from "./timeline-editor-agent-apply";
const input = (extra = {}) => staticSceneSplitBlock.inputs.parse({ base: {source_url:"/api/projects/pole-contract/media/base.mp4",source_duration_seconds:10,source_start_seconds:1}, replacement:{source_url:"/api/projects/pole-contract/media/replacement.mp4",source_duration_seconds:10,source_start_seconds:2}, duration_seconds:4,seam_percent:48,lane_order_keys:["visual_1","visual_0"],...extra });
function compile(settings:BlockSettings = {}, extra = {}, fps=30) {
  const i = input(extra), defaults = Object.fromEntries(Object.entries(staticSceneSplitBlock.settings).map(([key,s]) => [key,settingDefault(s.default,i,0,{})]));
  return staticSceneSplitBlock.compile(i,{...defaults,...settings},{fps,seed:"pole-test",block_id:"pole"});
}
const visuals = (settings:BlockSettings = {}, extra = {}, fps=30) => compile(settings,extra,fps).filter(o => o.create_visual).map(o => editorAgentCreateVisualSchema.parse(o.create_visual));
test("two native continuous takes restore full opacity and preserve base audio and source clock",()=>{
  const [base,upper] = visuals();
  assert.equal(base!.source_start_seconds,1);assert.equal(base!.source_end_seconds,5);assert.equal(base!.volume,1);
  assert.equal(upper!.source_start_seconds,2);assert.equal(upper!.source_end_seconds,6);assert.equal(upper!.volume,0);
  assert.equal(upper!.media_opacity,undefined);assert.deepEqual(upper!.mask_inset,[.48875,0,0,0]);assert.equal(upper!.mask_line_rotation,-90);
});
test("all dial extremes and side choices remain valid native operations, and slip never changes base",()=>{
  const original=visuals()[0];
  for (const end of ["min","max"] as const) {
    const settings=Object.fromEntries(Object.entries(staticSceneSplitBlock.settings).flatMap(([k,s])=>s.kind==="number"?[[k,s[end]]]:[]));
    for(const side of ["left","right"]) {const [base,upper]=visuals({...settings,side});assert.deepEqual(base,original);assert.ok(Math.abs(upper!.source_end_seconds!-upper!.source_start_seconds!-4)<1e-9);}
  }
});
test("frame slips use the output rate at24/30/60fps and defaults reset deterministically",()=>{
  for(const fps of [24,30,60]) {
    const b=visuals({}, {}, fps),t=visuals({slip_frames:12},{},fps);
    assert.equal(t[1]!.source_start_seconds,2+12/fps);assert.deepEqual(b[0],t[0]);
    assert.deepEqual(compile({slip_frames:0},{},fps),compile({}, {}, fps));
  }
});
test("missing timing handles, reversed lanes, subframe starts and short windows fail",()=>{
  assert.throws(()=>compile({}, {replacement:{source_url:"/api/projects/pole-contract/media/replacement.mp4",source_duration_seconds:5,source_start_seconds:0}}),/twelve output frames/);
  assert.throws(()=>compile({}, {base:{source_url:"/api/projects/pole-contract/media/base.mp4",source_duration_seconds:3,source_start_seconds:1}}),/Base take/);
  assert.throws(()=>input({lane_order_keys:["visual_0","visual_1"]}),/replacement above base/);
  assert.throws(()=>compile({}, {timeline_start:.01}),/frame grid/);
  assert.throws(()=>compile({}, {duration_seconds:.01}),/two output frames/);
});

test("the public proposal registry compiles the same native route",()=>{
 assert.equal(blockDefinition("static_scene_split",1),staticSceneSplitBlock);
 const instance:BlockInstance={block_id:"pole",kind:"static_scene_split",version:1,frame_rate:30,seed:"pole-test",inputs:input(),settings:{}};
 assert.deepEqual(compileBlock(instance),compile());
});

test("portrait and landscape split geometry keeps the feathered line at the measured canvas x",async()=>{
 const {gpuRotatedLineMask}=await import("../gpu-preview/feather-mask");
 for(const canvas of [{width:1080,height:1920},{width:1920,height:1080}])for(const seam of [25,50,75])for(const side of ["left","right"]){
  const upper=visuals({seam,side},{canvas})[1]!;const [top,right,bottom,left]=upper.mask_inset!;
  const plan=gpuRotatedLineMask({top:top!,right:right!,bottom:bottom!,left:left!},upper.mask_feather!,upper.mask_line_rotation!,canvas.width,canvas.height)!;
  assert.ok(plan);assert.ok(Math.abs(plan[2]/plan[0]-canvas.width*seam/100)<1e-6);assert.ok(plan[3]>0);
 }
});
