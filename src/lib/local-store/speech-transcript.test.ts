import test from "node:test";
import assert from "node:assert/strict";
import { buildGeneratedCaptions } from "./generate-captions";
import { cleanSpeechPauses, regroupSpeech, removeSpeechFillers } from "./speech-transcript";
import { speechTranscript, speechPauses, speechFillers, speechWordMatches } from "@/lib/timeline/speech-transcript";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { deriveProposalTimeline } from "@/lib/agent/timeline-editor-agent-apply";

const source = {id:"11111111-1111-4111-8111-111111111111",project_id:"transcript-test",type:"video_clip",source_url:"/speech.mov",lane_key:"visual_0",lane_index:0,timeline_start:0,duration:8,trim_start:0,trim_end:0,volume:1,playback_rate:1,props:{source_duration_seconds:8},removed_at:null,position_locked:false} as TimelineElement;
const words=[{word:"Here",start:0.3,end:0.6},{word:"is",start:0.7,end:0.9},{word:"one.",start:1,end:1.4},{word:"Another",start:3,end:3.4},{word:"sentence.",start:3.5,end:4},{word:"Finally.",start:6,end:6.6}];
const fixture=()=>({elements:[structuredClone(source),...buildGeneratedCaptions(source,words,1)],transitions:[]});
test("a frame-rounded word cut retains neighboring words in both captions and transcript",()=>{
 const touching=[{word:"Keep",start:0.2,end:0.713},{word:"cut",start:0.713,end:1.017},{word:"neighbors",start:1.017,end:1.6}];
 const before={elements:[structuredClone(source),...buildGeneratedCaptions(source,touching,3)],transitions:[]};
 const after=deriveProposalTimeline(before,[{element_id:source.id,rationale:"Cut middle word",source_range_cut:{source_start_seconds:0.713,source_end_seconds:1.017,removed_segment_id:"22222222-2222-4222-8222-222222222222",inserted_element_id:"33333333-3333-4333-8333-333333333333",max_affected_elements:20}}],"transcript-test").timeline;
 const groups=speechTranscript(after.elements,"visual_0");
 assert.deepEqual(groups.flatMap(group=>group.words.map(word=>word.text)),["Keep","neighbors"]);
 assert.equal(groups.flatMap(group=>group.captions.map(caption=>caption.props?.text)).join(" "),"Keep neighbors");
});
test("grouping preserves every word, source timing, style and valid lanes at each word limit",()=>{
 for(const limit of [1,2,3,6,12]){
  const before=fixture(); for(const c of before.elements.slice(1))c.props={...c.props,styleVariant:"neon",fontPreset:"orbitron",fontSizePx:77};
  const after=regroupSpeech(before,"visual_0",limit);
  const group=speechTranscript(after.elements,"visual_0")[0]!;
  assert.deepEqual(group.words.map(w=>[w.text,Number(w.start.toFixed(6)),Number(w.end.toFixed(6))]),words.map(w=>[w.word,w.start,w.end]));
  for(const c of group.captions){assert.ok(String(c.props?.text).split(/\s+/).length<=limit);assert.equal(c.props?.styleVariant,"neon");assert.equal(c.props?.fontSizePx,77);assert.equal(c.lane_key,"captions_0");}
  assert.equal(before.elements.filter(e=>!e.removed_at).length,7);
 }
});
test("pause cleanup uses aligned silence, cuts all later lanes and preserves every spoken word",()=>{
 const before=fixture();
 const pauses=speechPauses(before.elements,"visual_0",0.6,0.2);assert.equal(pauses.length,2);
 const after=cleanSpeechPauses(before,"visual_0",0.6,0.2,"transcript-test").timeline;
 assert.equal(speechPauses(after.elements,"visual_0",0.6,0.2).length,0);
 assert.deepEqual(speechTranscript(after.elements,"visual_0").flatMap(g=>g.words.map(w=>w.text)),words.map(w=>w.word));
 assert.ok(Math.abs(Math.max(...after.elements.filter(e=>!e.removed_at).map(e=>e.timeline_start+e.duration))-4.8)<0.04);
 assert.equal(source.duration,8);
});
test("one pause deletes independently; locked content and invalid grouping refuse",()=>{
 const before=fixture();const pause=speechPauses(before.elements,"visual_0")[0]!;
 const after=cleanSpeechPauses(before,"visual_0",0.6,0.2,"transcript-test",[pause.start]);assert.equal(after.count,1);
 assert.equal(speechPauses(after.timeline.elements,"visual_0").length,1);
 assert.throws(()=>regroupSpeech(before,"visual_0",0),/Words per line/);
 before.elements[1]!.position_locked=true;
 assert.throws(()=>regroupSpeech(before,"visual_0",2),/Unlock/);
 assert.throws(()=>cleanSpeechPauses(before,"visual_0",0.6,0.2,"transcript-test"),/locked/);
});
test("filler removal cuts hesitation runs once each and keeps every other word",()=>{
 const spoken=[{word:"Um,",start:0.3,end:0.5},{word:"so",start:0.6,end:0.8},{word:"uh",start:1,end:1.2},{word:"UMM...",start:1.3,end:1.6},{word:"like",start:1.8,end:2},{word:"this.",start:2.1,end:2.5}];
 const before={elements:[structuredClone(source),...buildGeneratedCaptions(source,spoken,1)],transitions:[]};
 const fillers=speechFillers(before.elements,"visual_0");
 assert.deepEqual(fillers.map(f=>[f.first,f.last,f.text]),[[0,0,"Um,"],[2,3,"uh UMM..."]]);
 assert.equal(fillers[0]!.sourceStart,0.26);
 const after=removeSpeechFillers(before,"visual_0","transcript-test");
 assert.equal(after.count,2);
 assert.deepEqual(speechTranscript(after.timeline.elements,"visual_0").flatMap(g=>g.words.map(w=>w.text)),["so","like","this."]);
 assert.equal(speechFillers(after.timeline.elements,"visual_0").length,0);
 assert.throws(()=>removeSpeechFillers(after.timeline,"visual_0","transcript-test"),/No filler words/);
});
test("word search ignores case and punctuation and matches phrases in order",()=>{
 const said=[{text:"Here"},{text:"is"},{text:"one."},{text:"Is"},{text:"it?"}];
 assert.deepEqual(speechWordMatches(said,"IS"),[{first:1,last:1},{first:3,last:3}]);
 assert.deepEqual(speechWordMatches(said,"is it"),[{first:3,last:4}]);
 assert.deepEqual(speechWordMatches(said,"  "),[]);
});
