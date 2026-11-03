import test from "node:test";
import assert from "node:assert/strict";
import { actorRevealInputs, actorRevealBlock } from "./proposal-blocks-actor-reveal";
import { CAPTION_FONT_PRESETS } from "../timeline/captions";
import { editorAgentOptionSchema } from "./timeline-editor-agent-apply";
import { buildCompositingLaneOrder } from "../timeline/compositing-lanes";
const input = actorRevealInputs.parse({
 source: {source_url:"/api/projects/fixture/media/walk.mp4",source_duration_seconds:12},
 foreground:{source_url:"/api/projects/fixture/media/cutout.webm",source_duration_seconds:8,source_offset_seconds:2,original_source_url:"/api/projects/fixture/media/walk.mp4"},
 source_start_seconds:3,duration_seconds:6,timeline_start:2,text:"REVEALED",font:CAPTION_FONT_PRESETS[0],
 boundary:[{source_seconds:3,x:0},{source_seconds:4,x:.1},{source_seconds:5,x:.4},{source_seconds:7,x:.95}],
 lane_order_keys:["visual_2","visual_1","captions_1","visual_0"],
});
const settings={edge:0,feather:.5,text_size:100,text_width:70,volume:100};
const compile=(s=settings,i=input)=>actorRevealBlock.compile(i,s,{fps:30,seed:"actor-reveal-test",block_id:"reveal"});

test("actor wake compiles editable text between synchronized cover and foreground on the same source clock",()=>{
 const ops=compile();
 const parsed=editorAgentOptionSchema.parse({id:"reveal",label:"Reveal",summary:"Reveal native text",recommended:true,operations:ops.map(({block_ref, ...o})=>o)});
 assert.equal(parsed.operations.length,5);
 const visuals=parsed.operations.filter(o=>o.create_visual).map(o=>o.create_visual!);
 assert.deepEqual(visuals.map(v=>v.source_start_seconds),[3,3,1]);
 assert.deepEqual(visuals.map(v=>v.source_end_seconds),[9,9,7]);
 assert.deepEqual(visuals.map(v=>v.volume),[1,0,0]);
 assert.ok(visuals.every(v=>v.playback_rate===1&&v.timeline_start===2));
 assert.equal(parsed.operations[2]!.create_text?.text,"REVEALED");
 assert.deepEqual(buildCompositingLaneOrder({visualLaneKeys:["visual_0","visual_1","visual_2"],captionLaneKeys:["captions_1"],persistedLaneOrderKeys:input.lane_order_keys}),["visual_0","captions_1","visual_1","visual_2"]);
 const mask=visuals[1]!.mask_inset_keyframes!;
 assert.deepEqual(mask.map(p=>p.t),[0,1,2,4,6]);
 assert.deepEqual(mask.map(p=>p.v[3]),[0,.1,.4,.95,.95]);
});

test("dial boundaries preserve source windows and IDs while changing only intended dependencies",()=>{
 const original=compile();
 for(const edge of [-5,0,5])for(const feather of [0,5])for(const text_size of [25,200]){
  const ops=compile({...settings,edge,feather,text_size,volume:0});
  assert.deepEqual(ops.map(o=>o.element_id),original.map(o=>o.element_id));
  const parsed=editorAgentOptionSchema.parse({id:"sweep",label:"Sweep",summary:"Sweep",recommended:true,operations:ops.map(({block_ref, ...o})=>o)});
  for(const [j,op] of parsed.operations.entries())if(op.create_visual){
   const before=original[j]!.create_visual as Record<string,unknown>;
   assert.equal(op.create_visual.source_start_seconds,before.source_start_seconds);
   assert.equal(op.create_visual.source_end_seconds,before.source_end_seconds);
  }
 }
 assert.deepEqual(compile(),original);
});

test("wrong source identity, exhausted alpha handles, reordered lanes and nonmonotone boundary marks fail closed",()=>{
 assert.equal(actorRevealInputs.safeParse({...input,foreground:{...input.foreground,original_source_url:"other"}}).success,false);
 assert.equal(actorRevealInputs.safeParse({...input,foreground:{...input.foreground,source_duration_seconds:4}}).success,false);
 assert.equal(actorRevealInputs.safeParse({...input,lane_order_keys:["captions_1","visual_2","visual_1","visual_0"]}).success,false);
 assert.equal(actorRevealInputs.safeParse({...input,boundary:[{source_seconds:3,x:.8},{source_seconds:7,x:.2}]}).success,false);
 assert.throws(()=>compile(settings,{...input,timeline_start:2.01}),/frame grid/);
});

test("registered block compiles through the normal option schema with bound dials",()=>{
 const option=editorAgentOptionSchema.parse({id:"normal",label:"Object Reveal",summary:"Reveal",recommended:true,operations:[],blocks:[{
  block_id:"actor",kind:"actor_wake_reveal",version:1,seed:"test",frame_rate:30,inputs:input,settings:{},
 }]});
 assert.equal(option.operations.length,5);
 assert.equal(option.operations[2]!.create_text!.text,"REVEALED");
 assert.equal(option.operations[3]!.create_visual!.mask_inset_keyframes!.length,5);
});
test("supplied source-matched green view uses native key and tolerates unused fractional source handles",()=>{
 const keyed={...input,source:{...input.source,source_duration_seconds:12.1121},foreground:{...input.foreground,source_duration_seconds:8.1121,chroma_key_color:"#02ff49"}};
 for(const key_tolerance of [0,100]){
  const option=editorAgentOptionSchema.parse({id:"keyed",label:"Object Reveal",summary:"Reveal",recommended:true,operations:[],blocks:[{block_id:"keyed",kind:"actor_wake_reveal",version:1,seed:"s",frame_rate:30,inputs:keyed,settings:{key_tolerance,key_softness:8,key_spill:25}}]});
  const foreground=option.operations.find(o=>o.block_ref?.role==="foreground")!.create_visual!;
  assert.equal(foreground.chroma_key_color,"#02ff49");assert.equal(foreground.chroma_key_tolerance,key_tolerance/100);
  assert.equal(foreground.has_alpha,undefined);assert.equal(foreground.source_start_seconds,1);
 }
});
test("measured text anchor keeps native X/Y controls and does not mix preset placement",()=>{
 const keyed={...input,text_origin:{x:.15,y:.386}};
 const option=editorAgentOptionSchema.parse({id:"placed",label:"Object Reveal",summary:"Reveal",recommended:true,coordinate_fallback_reason:"Measured wall title has no matching semantic preset or stationary scene anchor.",operations:[],blocks:[{block_id:"placed",kind:"actor_wake_reveal",version:1,seed:"s",frame_rate:30,inputs:keyed,settings:{text_x:15,text_y:38.6}}]});
 const text=option.operations.find(o=>o.create_text)!.create_text!;
 assert.equal(text.absX,.15);assert.equal(text.absY,.386);assert.equal(text.positionPreset,undefined);
});
test("approved Object Reveal card: a traced cut-out of the original take is the foreground, with no key and no key dials",()=>{
 // Proposal 20261103T005818-cdc5329f (object-reveal-supplied-9e20), approved 2026-11-02: cutout_prepare afcff172 (take 4.9-11.1 s) replaced the green-screen key.
 const take="/api/projects/object-reveal-supplied-9e20/media/sources/ObjectReveal_SHOT01.mp4";
 const xs=[.0481,.0519,.0593,.0667,.0741,.0889,.1111,.1296,.1444,.163,.1778,.1926,.2037,.2185,.237,.2519,.2704,.2815,.3111,.3407,.3741,.4,.4222,.4407,.4556,.4704,.4815,.4889,.4926,.5,.5074,.5148,.5222,.5296,.537,.5444,.5556,.563,.5741,.5852,.5963,.6074,.6185,.6259,.637,.6444,.6519,.6593,.6704,.6815,.6963,.7111,.7296,.7481,.7667,.7815,.8,.8148,.8259,.8333,.8407,.8481,.8556,.8593,.863,.8667,.8704,.8704,.8741,.8741,.8778,.8778,.8815,.8815,.8852,.8926,.8963,.9037,.9074,.9111,.9148,.9148,.9185,.9222,.9259,.9296,.9333,.937,.9407,.9444];
 const inputs={source:{source_url:take,source_duration_seconds:12.1121},
  foreground:{source_url:"/api/projects/object-reveal-supplied-9e20/media/cutouts/ObjectReveal_SHOT01-cutout-afcff172.webm",source_duration_seconds:6.2062,source_offset_seconds:4.9,original_source_url:take},
  source_start_seconds:5.066666666666666,duration_seconds:5.966666666666667,timeline_start:0,text:"TYLER",font:"inter",position:"center",color:"#ffffff",
  lane_order_keys:["visual_2","visual_1","captions_1","visual_0"],text_origin:{x:.157,y:.38},boundary:xs.map((x,k)=>({source_seconds:Math.round((76+k)/14.985*1e4)/1e4,x}))};
 const option=editorAgentOptionSchema.parse({id:"actor-reveal",label:"Object Reveal",summary:"Reveal",recommended:true,coordinate_fallback_reason:"Measured wall title.",operations:[],blocks:[{
  block_id:"actor-reveal",kind:"actor_wake_reveal",version:1,seed:"1ffe564f05c90c71",frame_rate:30,inputs,settings:{text_size:188,text_width:70,volume:0,text_x:15.7,text_y:38}}]});
 const byRole=(role:string)=>option.operations.find(o=>o.block_ref?.role===role)!;
 // Same element ids as the applied card.
 assert.deepEqual(["order","base","text","cover","foreground"].map(role=>byRole(role).element_id),
  ["ffc0b46c-d528-5546-af7b-806541929482","a488bbbe-80ca-5d13-bcd9-21fa6a3ea067","b298cad1-f336-55d8-817a-94121026dcbf","de01dd13-08bc-5c4c-a8bc-652e4db84c5d","120ae98e-c53d-5b21-8e8c-ff2ed96c33af"]);
 const foreground=byRole("foreground").create_visual!;
 assert.equal(foreground.has_alpha,true);assert.equal(foreground.chroma_key_color,undefined);
 assert.ok(Math.abs(foreground.source_start_seconds!-.16666666666666607)<1e-9&&Math.abs(foreground.source_end_seconds!-6.133333333333333)<1e-9);
 const cover=byRole("cover").create_visual!;
 assert.equal(cover.mask_inset_keyframes!.length,92);assert.equal(cover.mask_feather,.005);
 assert.deepEqual(cover.mask_inset_keyframes!.at(-1)!.v,[0,0,0,.9444]);
 const text=byRole("text").create_text!;
 assert.deepEqual([text.text,text.fontSizePx,text.absX,text.absY,text.maxWidth],["TYLER",188,.157,.38,.7]);
 assert.equal(byRole("base").create_visual!.volume,0);
 const keyDials=Object.entries(actorRevealBlock.settings).filter(([,setting])=>setting.hidden?.(actorRevealInputs.parse(inputs))).map(([name])=>name);
 assert.deepEqual(keyDials,["key_tolerance","key_softness","key_spill"]);
});
