import test from "node:test";import assert from "node:assert/strict";
import {poseCutInputs,poseCutBlock}from"./proposal-blocks-pose-cuts";
import{editorAgentOptionSchema}from"./timeline-editor-agent-apply";
const input=poseCutInputs.parse({source:{source_url:"/api/projects/fixture/media/take.mp4",source_duration_seconds:121.26666666666667},poses:[{label:"Lean by shelves",source_start_seconds:100,frames:8},{label:"Right edge",source_start_seconds:107,frames:4},{label:"Left edge",source_start_seconds:110.5,frames:6},{label:"Close on right",source_start_seconds:114.5,frames:4}],line:{source_start_seconds:117.7,source_end_seconds:121.26666666666667},click:{source_url:"/api/projects/fixture/media/click.wav",source_duration_seconds:.3153125,peak_seconds:.043041666666666666}});
const compile=(pose_frames=[8,4,6,4])=>poseCutBlock.compile(input,{pose_frames,click_volume:45,voice_volume:100},{fps:30,seed:"jump-cuts",block_id:"cuts"});
test("registered pose helper compiles picture and linked supplied clicks through proposal schema",()=>{
 const option=editorAgentOptionSchema.parse({id:"cuts",label:"Jump Cuts",summary:"Cuts",recommended:true,operations:[],blocks:[{block_id:"cuts",kind:"pose_cut_sequence",version:1,seed:"jump-cuts",frame_rate:30,settings:{},inputs:input}]});
 assert.equal(option.operations.filter(o=>o.create_visual).length,5);
 assert.equal(option.operations.filter(o=>o.create_audio).length,4);
 assert.ok(option.operations.every(o=>o.block_ref?.block_id==="cuts"));
});
test("pose sequence preserves normal source windows, reference cut cadence and one voiced line",()=>{
 const option=editorAgentOptionSchema.parse({id:"cuts",label:"Jump Cuts",summary:"Cuts",recommended:true,operations:compile().map(({block_ref,...o})=>o)});
 const videos=option.operations.filter(o=>o.create_visual).map(o=>o.create_visual!);
 assert.deepEqual(videos.map(v=>Math.round(v.timeline_start*30)),[0,8,12,18,22]);
 assert.deepEqual(videos.map(v=>v.volume),[0,0,0,0,1]);assert.ok(videos.every(v=>v.playback_rate===1));
 assert.equal(videos.at(-1)!.source_start_seconds,117.7);assert.equal(videos.at(-1)!.source_end_seconds,input.line.source_end_seconds);
 const clicks=option.operations.filter(o=>o.create_audio).map(o=>o.create_audio!);
 clicks.forEach((a,j)=>{assert.ok(Math.abs(a.timeline_start+input.click!.peak_seconds-videos[j+1]!.timeline_start)<1e-8);assert.equal(a.follows_visual!.element_id,option.operations[j+1]!.element_id);if(j<clicks.length-1)assert.ok(a.timeline_start+(a.source_end_seconds!-a.source_start_seconds)<=clicks[j+1]!.timeline_start+1e-8);});
});
test("every pose dial boundary moves later clips/clicks while keeping source anchors, line and IDs",()=>{
 const ids=compile().map(o=>o.element_id);
 for(const f of [2,12]){const ops=compile([f,f,f,f]);assert.deepEqual(ops.map(o=>o.element_id),ids);const line=ops[4]!.create_visual as Record<string,number>;assert.ok(Math.abs(line.timeline_start!-4*f/30)<1e-8);assert.equal(line.source_start_seconds,117.7);assert.equal(line.source_end_seconds,input.line.source_end_seconds);}
 assert.deepEqual(compile(),compile());
});
test("bad speech window, missing pose handles, late click peak and off-grid marks fail closed",()=>{
 assert.equal(poseCutInputs.safeParse({...input,line:{source_start_seconds:120,source_end_seconds:119}}).success,false);
 const c={fps:30,seed:"s",block_id:"b"},s={pose_frames:[8,4,6,4],click_volume:45,voice_volume:100};
 assert.throws(()=>poseCutBlock.compile({...input,poses:[{...input.poses[0]!,source_start_seconds:121.2},...input.poses.slice(1)]},s,c),/handles/);
 assert.throws(()=>poseCutBlock.compile({...input,click:{...input.click!,peak_seconds:.1}},s,c),/Click peak/);
 assert.throws(()=>poseCutBlock.compile({...input,timeline_start:.01},s,c),/frame-aligned/);
});
test("sparse supplied clicks preserve silent joins, stable identities and tails across skipped cues",()=>{
 const settings={pose_frames:[8,4,6,4],click_volume:45,voice_volume:100},context={fps:30,seed:"jump-cuts",block_id:"cuts"};
 const full=poseCutBlock.compile(input,settings,context);
 const sparse=poseCutBlock.compile({...input,click:{...input.click!,enabled_cuts:[true,false,true,false]}},settings,context);
 const sounds=sparse.filter(o=>o.create_audio);
 assert.deepEqual(sounds.map(o=>o.block_ref.index),[0,2]);
 assert.deepEqual(sounds.map(o=>o.element_id),full.filter(o=>o.create_audio&&[0,2].includes(o.block_ref.index)).map(o=>o.element_id));
 assert.equal((sounds[0]!.create_audio as {source_end_seconds:number}).source_end_seconds,input.click!.source_duration_seconds);
 assert.equal(poseCutBlock.compile({...input,click:{...input.click!,enabled_cuts:[false,false,false,false]}},settings,context).filter(o=>o.create_audio).length,0);
 assert.equal(poseCutInputs.safeParse({...input,click:{...input.click!,enabled_cuts:[true]}}).success,false);
});
