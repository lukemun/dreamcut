import assert from "node:assert/strict";
import test from "node:test";
import { impactStepBlock as block } from "./proposal-blocks-stomp";
import { editorAgentOptionSchema } from "./timeline-editor-agent-apply";
const raw={source_url:"/api/projects/fixture/media/stomp.mp4",source_duration_seconds:12,source_start_seconds:2,duration_seconds:5,panel_scale:.31640625,lane_order_keys:["visual_1","visual_0"],impacts:[{source_time_seconds:3,drop_percent:5},{source_time_seconds:4,drop_percent:15},{source_time_seconds:6,drop_percent:25}]};
function compile(settings={},fps=30,inputs={}){return block.compile(block.inputs.parse({...raw,...inputs}),{distance:100,descent_frames:2,volume:100,...settings},{fps,seed:"stomp-test",block_id:"stomp"});}
function visual(settings={},fps=30,inputs={}){const operations=compile(settings,fps,inputs).map(({block_ref,...o})=>o);return editorAgentOptionSchema.parse({id:"stomp",label:"Stomp",summary:"Measured contacts",recommended:true,operations}).operations[1].create_visual!;}
test("continuous source and audio stay at 1x; holds and contacts use exact output frames",()=>{
 const v=visual();assert.equal(v.source_start_seconds,2);assert.equal(v.source_end_seconds,7);assert.equal(v.playback_rate,1);assert.equal(v.volume,1);
 const k=v.transition_keyframes!.media_offset_y!;assert.deepEqual(k.slice(0,3),[{t:0,v:0,ease:"linear"},{t:28/30,v:0,ease:"linear"},{t:1,v:.1,ease:"linear"}]);assert.equal(k.at(-1)!.t,149/30);assert.equal(k.at(-1)!.v,.9);
});
test("all dial endpoints parse, preserve contacts/source duration and stable identity at 24/30/60fps",()=>{
 for(const fps of [24,30,60])for(const distance of [0,100])for(const descent_frames of [1,12])for(const volume of [0,100]){
 const s={distance,descent_frames,volume};const v=visual(s,fps);assert.equal(v.source_end_seconds,7);assert.equal(v.volume,volume/100);
 const keys=v.transition_keyframes!.media_offset_y!;for(const t of [1,2,4])assert.ok(keys.some(k=>k.t===t));
 if(distance===0)assert.ok(keys.every(k=>k.v===0));
 assert.deepEqual(compile(s,fps).map(o=>o.element_id),compile({},fps).map(o=>o.element_id));
 }
});
test("nearby contacts clamp motion duration without duplicate keys or shifted contacts",()=>{
 const v=visual({descent_frames:12},30,{impacts:[{source_time_seconds:3,drop_percent:5},{source_time_seconds:3+1/30,drop_percent:5}]});
 const keys=v.transition_keyframes!.media_offset_y!;assert.equal(new Set(keys.map(k=>k.t)).size,keys.length);assert.ok(keys.some(k=>k.t===31/30&&k.v===.2));
});
test("invalid handles and contact ordering refuse",()=>{
 assert.throws(()=>compile({},30,{duration_seconds:11}),/source handles/);
 for(const marks of [[2],[7],[3,3],[4,3]])assert.throws(()=>compile({},30,{impacts:marks.map(source_time_seconds=>({source_time_seconds,drop_percent:5}))}),/Contacts/);
});
