import test from "node:test";
import assert from "node:assert/strict";
import { cleanCutInputs, cleanCutBlock } from "./proposal-blocks-clean-cut";
import { editorAgentOptionSchema } from "./timeline-editor-agent-apply";
const input=cleanCutInputs.parse({plate:{source_url:"/api/projects/fixture/media/take.mp4",source_duration_seconds:20,source_start_seconds:15},performance:{source_url:"/api/projects/fixture/media/take.mp4",source_duration_seconds:20,source_start_seconds:2},performance_duration_seconds:4});
const compile=(empty_seconds=2/3,plate_audio="silent",volume=100)=>cleanCutBlock.compile(input,{empty_seconds,plate_audio,volume},{fps:30,seed:"person-appear",block_id:"appear"});
test("hard cut abuts empty and whole landing source with no fades or invented motion",()=>{
 const ops=compile();const option=editorAgentOptionSchema.parse({id:"a",label:"Appear",summary:"Hard cut",recommended:true,operations:ops.map(({block_ref,...o})=>o)});
 const [plate,landing]=option.operations.map(o=>o.create_visual!);
 assert.equal(plate.source_end_seconds,15+2/3);assert.equal(landing.source_start_seconds,2);
 assert.equal(landing.timeline_start,2/3);assert.equal(landing.source_end_seconds,6);
 assert.ok(option.operations.every(o=>o.create_visual!.playback_rate===1));
 assert.equal(plate.volume,0);assert.equal(landing.volume,1);
 assert.ok(!ops.some(o=>o.create_transition||o.props));
});
test("entire lead dial changes only adjacency, preserving selected normal landing and stable IDs",()=>{
 const base=compile();
 for(const hold of [.1,.67,1.23,3])for(const audio of ["silent","original"]){
  const ops=compile(hold,audio,0);const [p,l]=ops.map(o=>o.create_visual as Record<string,number>);
  assert.equal(l.source_start_seconds,2);assert.equal(l.source_end_seconds,6);
  assert.ok(Math.abs(l.timeline_start!-(p.source_end_seconds!-p.source_start_seconds!))<1e-8);
  assert.deepEqual(ops.map(o=>o.element_id),base.map(o=>o.element_id));
 }
 assert.deepEqual(compile(),base);
});
test("insufficient plate/performance handles and non-frame trims fail closed",()=>{
 assert.equal(cleanCutInputs.safeParse({...input,plate:{...input.plate,source_start_seconds:18}}).success,false);
 assert.equal(cleanCutInputs.safeParse({...input,performance_duration_seconds:19}).success,false);
 assert.throws(()=>cleanCutBlock.compile({...input,timeline_start:.01},{empty_seconds:1,volume:100,plate_audio:"silent"},{fps:30,seed:"s",block_id:"b"}),/frame grid/);
});
test("registered clean cut block resolves through ordinary proposal option parsing",()=>{
 const option=editorAgentOptionSchema.parse({id:"a",label:"Appear",summary:"Appear",recommended:true,operations:[],blocks:[{block_id:"appear",kind:"clean_plate_cut",version:1,seed:"test",frame_rate:30,inputs:input,settings:{}}]});
 assert.equal(option.operations.length,2);
 assert.equal(option.operations[1]!.create_visual!.source_start_seconds,2);
});
