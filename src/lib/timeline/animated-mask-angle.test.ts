import assert from "node:assert/strict";
import test from "node:test";
import { commitLineMaskRotationAtTime, resolveLineMaskRotationAtTime, clearMediaKeyframes } from "./media-transform";
import { transitionKeyframesSchema } from "./transition-effects";
import { resolveMediaScene } from "./resolved-media-scene";
import { deriveProposalTimeline, editorAgentOptionSchema } from "../agent/timeline-editor-agent-apply";
import type { TimelineFile } from "../local-store/store";

const track = [{t:0,v:-30},{t:1,v:30,ease:"hold" as const},{t:2,v:90}];
test("angle changes on the clip clock and supports backward/repeated seeks",()=>{
 const props={mask_line_rotation:12,keyframes:{mask_line_rotation:track}};
 assert.deepEqual([0,1,2,.5,0,1.5,.5].map(t=>resolveLineMaskRotationAtTime(props,t)),[-30,30,90,0,-30,30,0]);
 assert.equal(resolveLineMaskRotationAtTime({mask_line_rotation:400},5),180);
 assert.equal(resolveLineMaskRotationAtTime({mask_line_rotation:NaN},5),0);
});
test("angle commit/reset changes the active key without erasing other moments",()=>{
 const props={mask_line_rotation:12,keyframes:{mask_line_rotation:track}};
 const edited=commitLineMaskRotationAtTime(props,1,70);
 assert.equal(resolveLineMaskRotationAtTime(edited,1),70);
 assert.equal(resolveLineMaskRotationAtTime(edited,0),-30);
 const reset=commitLineMaskRotationAtTime(edited,1,0);
 assert.equal(resolveLineMaskRotationAtTime(reset,1),0);
 assert.equal(resolveLineMaskRotationAtTime(reset,2),90);
 assert.equal(resolveLineMaskRotationAtTime(clearMediaKeyframes(reset),1),12);
});
test("proposal preserves keyed angle and Standard resolves moving mask without moving picture",()=>{
 const option=editorAgentOptionSchema.parse({id:"wipe",label:"Wipe",summary:"Follow the stick",recommended:true,operations:[{element_id:"00000000-0000-4000-8000-000000000051",create_visual:{type:"still",source_url:"/api/projects/fixture/media/synthetic.png",timeline_start:0,duration_seconds:3,lane_key:"visual_1",lane_index:0,mask_inset:[.5,0,0,0],transition_keyframes:{mask_line_rotation:track}}}]});
 const props=deriveProposalTimeline({elements:[],transitions:[]} as unknown as TimelineFile,option.operations,"fixture").timeline.elements[0].props!;
 assert.deepEqual((props.keyframes as Record<string,unknown>).mask_line_rotation,track);
 const first=resolveMediaScene(props,0,{width:1080,height:1920});
 const last=resolveMediaScene(props,2,{width:1080,height:1920});
 assert.notEqual(first.styles.outer.maskImage,last.styles.outer.maskImage);
 assert.deepEqual(first.transform,last.transform);
 assert.throws(()=>transitionKeyframesSchema.parse({mask_line_rotation:[{t:0,v:0},{t:1,v:181}]}));
});

import { evaluateGpuScene, admitGpuScene } from "../gpu-preview/scene";
import { gpuSceneDraws } from "../gpu-preview/scene-draws";
import type { CompositionElement } from "../render/composition-adapters";

test("GPU draw packet uses clip time, independent of the trimmed source clock",()=>{
 const element:CompositionElement={id:"angle",type:"video_clip",source_url:"/fixture.mp4",timeline_start:5,duration:3,lane_key:"visual_0",lane_index:0,volume:0,trim_start:7,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{source_duration_seconds:12,mask_inset:[.5,0,0,0],keyframes:{mask_line_rotation:track},preview_source_url:"/fixture.mp4",preview_proxy_validation:{contract:"preview-proxy-v1",url:"/fixture.mp4",ok:true,width:320,height:320}}};
 assert.equal(admitGpuScene([element],"fixture").supported,true);
 const plans=[150,210,165,180,150].map(frame=>{
  const scene=evaluateGpuScene([element],[],frame,1080,1920,"fixture");
  const layer=scene.layers[0];assert.equal(layer.kind,"video");if(layer.kind!=="video")throw Error("Missing video");
  const frames=new Map([[layer.element.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33334,bytes:409600,value:{displayWidth:1080,displayHeight:1920} as VideoFrame,release(){}}]]);
  return gpuSceneDraws(scene,frames,()=>undefined)[0];
 });
 assert.deepEqual(plans[0],plans[4],"backward seek reproduces packet");
 assert.notDeepEqual(plans[0].lineMask,plans[1].lineMask,"angle changes mask plane");
 assert.deepEqual(plans[0].transform,plans[1].transform,"picture remains fixed");
 assert.equal(plans[2].lineMask,undefined,"zero-degree midpoint uses axis mask");
});
