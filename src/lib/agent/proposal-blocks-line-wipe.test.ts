import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {writePreparation} from "../local-store/media-preparation";
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"line-wipe-test-"));
process.env.TIMELINE_PROJECTS_DIR=scratch;
for(const [source,duration] of [["a.mp4",6.006],["b.mp4",8.008]] as const){
 const folder=path.join(scratch,"fixture","media");fs.mkdirSync(folder,{recursive:true});const p=path.join(folder,source);fs.writeFileSync(p,"unit fixture, never a reconstruction input");const stat=fs.statSync(p);
 writePreparation("fixture",{recipe:"editor-media-v1",source,size:stat.size,mtime:stat.mtimeMs,state:"ready",preview:source,render:source,duration,alpha:false});
}
process.on("exit",()=>fs.rmSync(scratch,{recursive:true,force:true}));
import assert from "node:assert/strict";
import test from "node:test";
import {compileBlock,type BlockInstance} from "./proposal-blocks";
import {editorAgentOptionSchema,deriveProposalTimeline} from "./timeline-editor-agent-apply";
import {mediaPictureAtFrame,mediaPicturePlan} from "../timeline/media-picture-plan";
import {resolveLineMaskRotationAtTime,resolveMaskInsetAtTime} from "../timeline/media-transform";
import type {TimelineFile} from "../local-store/store";
const inputs={outgoing:{source_url:"/api/projects/fixture/media/a.mp4",source_duration_seconds:6.006,source_start_seconds:1,source_end_seconds:4},incoming:{source_url:"/api/projects/fixture/media/b.mp4",source_duration_seconds:8.008,source_start_seconds:2},duration_seconds:4,boundary:[{source_seconds:1,top:0,angle:0},{source_seconds:2,top:.2,angle:8},{source_seconds:3,top:.9,angle:-3}],lane_order_keys:["visual_1","visual_0"]};
const instance=(settings={},extra={}):BlockInstance=>({block_id:"wipe",kind:"object_led_line_wipe",version:1,seed:"line-test",frame_rate:30,settings,inputs:{...inputs,...extra}});
function result(settings={},extra={}){const operations=compileBlock(instance(settings,extra));const option=editorAgentOptionSchema.parse({id:"wipe",label:"Wipe",summary:"Object-led reveal",recommended:true,operations:[],blocks:[instance(settings,extra)]});return {operations,timeline:deriveProposalTimeline({elements:[],transitions:[]} as unknown as TimelineFile,option.operations,"fixture").timeline};}
test("native two-take mask follows source marks and preserves the final playable frame through its tail",()=>{
 const {timeline}=result(),[incoming,outgoing]=timeline.elements;
 assert.equal(incoming.duration,4);assert.equal(outgoing.duration,4);
 assert.equal(outgoing.trim_start,1);assert.equal(outgoing.trim_end,2);
 assert.equal(resolveMaskInsetAtTime(outgoing.props,2).top,.9);assert.equal(resolveLineMaskRotationAtTime(outgoing.props,2),-3);
 const plan=mediaPicturePlan(outgoing);assert.equal(plan.overflowDurationFrames,30);
 const tail=mediaPictureAtFrame(outgoing,119)!;assert.equal(tail.phase,"tail");assert.ok(tail.sourceTimeSeconds<4);assert.ok(tail.sourceTimeSeconds>3.9);
 assert.equal(incoming.volume,0);assert.equal(outgoing.volume,0);
});
test("all dials validate, slip clamps to real handles and reset is deterministic",()=>{
 const base=result();for(const settings of [{incoming_timing:-60},{incoming_timing:60},{feather:1,edge_offset:-1,align_x:-2,align_y:2},{mode:"off"}]){
 const next=result(settings);assert.equal(next.timeline.elements[1].trim_start,1);assert.equal(next.timeline.elements[1].duration,4);assert.equal(next.timeline.elements[0].duration,4);
 }
 assert.equal(result({incoming_timing:-60}).timeline.elements[0].trim_start,0);
 assert.equal(result({incoming_timing:60}).timeline.elements[0].trim_start,4);
 assert.deepEqual(resolveMaskInsetAtTime(result({edge_offset:1}).timeline.elements[1].props,0),{top:0,right:0,bottom:0,left:0});
 assert.equal(result({mode:"off"}).timeline.elements[1].props?.keyframes,undefined);
 assert.deepEqual(result().operations,base.operations);
});
test("invalid source marks, short handles, off-grid windows and reversed lanes refuse construction",()=>{
 assert.throws(()=>result({}, {incoming:{...inputs.incoming,source_duration_seconds:5}}),/coverage/);
 assert.throws(()=>result({}, {boundary:[{source_seconds:3,top:.2,angle:0},{source_seconds:2,top:.9,angle:0}]}),/increase/);
 assert.throws(()=>result({}, {outgoing:{...inputs.outgoing,source_end_seconds:7}}),/inside/);
 assert.throws(()=>result({}, {timeline_start:.01}),/project frames/);
 assert.throws(()=>result({}, {lane_order_keys:["visual_0","visual_1"]}),/above/);
});

import {applyProposalNumericOverrides} from "./proposal-overrides";
import {proposalControlInventory} from "./proposal-control-inventory";
test("native end-hold dial changes only held duration and preserves the playable source window",()=>{
 const operations=compileBlock(instance()).filter(o=>o.create_visual).map(({block_ref,...op})=>op);
 const option=editorAgentOptionSchema.parse({id:"hold",label:"Hold",summary:"Native ending",recommended:true,operations,review_controls:[{operation_index:1,target:"create_visual",field:"trailing_hold_seconds"}]});
 const empty={elements:[],transitions:[]} as unknown as TimelineFile;
 assert.ok(proposalControlInventory(empty,option)[1].controls.some(c=>c.field==="trailing_hold_seconds"&&c.selected));
 for(const hold of [0,.5,2]){
  const tuned=applyProposalNumericOverrides(option,[{operation_index:1,target:"create_visual",field:"trailing_hold_seconds",value:hold}]);
  const clip=deriveProposalTimeline(empty,tuned.operations,"fixture").timeline.elements[1];
  assert.equal(clip.duration,3+hold);assert.equal(clip.trim_start,1);assert.equal(clip.trim_end,2);
  assert.equal(mediaPicturePlan(clip).overflowDurationFrames,hold*30);
 }
});
