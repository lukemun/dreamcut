import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {mediaReadiness} from "./media-readiness";
import {timelineEvidence,timelineEvidenceStamp} from "./timeline-evidence";
import {compileCaptionProposal} from "./caption-proposal-compile";
import {expandCompiledOperations} from "./compiled-operations";
import {enqueuePreparation,preparationJobsDir} from "./preparation-jobs";
import {sha256} from "../media-analysis/custom-cutout";
import {timelineRevision} from "./timeline-editor-agent-apply";
import {recordToolEvent,toolUsage} from "../observability/tool-events";

test("tools preserve timeline, source identity, stale evidence checks and accounting",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"tool-capabilities-")),old={...process.env};
 process.env.TIMELINE_PROJECTS_DIR=root;process.env.DREAMCUT_PROFILE_DIR=path.join(root,"profile");process.env.MEDIA_PREPARATION_AUTOSTART="0";process.env.AGENT_PREPARATION_AUTOSTART="0";
 try{
  const project="fixture",dir=path.join(root,project),media=path.join(dir,"media"),instruments=path.join(dir,"instruments");fs.mkdirSync(media,{recursive:true});fs.mkdirSync(instruments,{recursive:true});
  const sourceId=randomUUID();fs.writeFileSync(path.join(media,"source.mp4"),"fixture source bytes");
  fs.writeFileSync(path.join(dir,"timeline.json"),JSON.stringify({schema_version:1,elements:[{id:sourceId,type:"video_clip",source_url:`/api/projects/${project}/media/source.mp4`,timeline_start:5,duration:3,trim_start:1,trim_end:0,playback_rate:1,props:{source_duration_seconds:4},removed_at:null}],transitions:[]}));fs.writeFileSync(path.join(dir,"metadata.json"),"{}");
  const timelineBefore=fs.readFileSync(path.join(dir,"timeline.json"),"utf8");
  assert.equal((await mediaReadiness(project,{source:"source.mp4"})).state,"not_prepared");
  const preparing=await mediaReadiness(project,{source:"source.mp4",action:"prepare"});assert.equal(preparing.state,"preparing");assert.equal((await mediaReadiness(project,{source:"source.mp4",action:"prepare"})).reused,true);
  await assert.rejects(()=>mediaReadiness(project,{source:"../source.mp4"}),/inside/);
  await assert.rejects(()=>enqueuePreparation(project,{kind:"speech",source:"source.mp4",mode:"align"}),/reviewed transcript/);
  const imageFile=path.join(instruments,"sample.png");await sharp({create:{width:64,height:64,channels:3,background:"red"}}).png().toFile(imageFile);
  const report={projectId:project,evidenceStamp:await timelineEvidenceStamp(project),states:[{frame:1,atSeconds:1/30,stillPath:imageFile,read:{stillSha256:await sha256(imageFile)}}]};
  fs.writeFileSync(path.join(instruments,"frame-state.json"),JSON.stringify(report));
  const image=await timelineEvidence(project,{report:"frame-state.json"});assert.equal(image.image.type,"image");assert.equal(image.cells.length,1);
  fs.appendFileSync(imageFile,"changed");await assert.rejects(()=>timelineEvidence(project,{report:"frame-state.json"}),/changed after/);
  fs.appendFileSync(path.join(media,"source.mp4"),"source changed");await assert.rejects(()=>timelineEvidence(project,{report:"frame-state.json"}),/fingerprint/);
  const jobId=randomUUID(),jobDir=path.join(preparationJobsDir(project),jobId);fs.mkdirSync(jobDir,{recursive:true});
  const alignment=path.join(jobDir,"alignment.json");fs.writeFileSync(alignment,JSON.stringify([{word:"Hello",start:1,end:1.5},{word:"world.",start:1.6,end:2.2}]));
  fs.writeFileSync(path.join(jobDir,"job.json"),JSON.stringify({id:jobId,key:"fixture",state:"completed",input:{kind:"speech",source:"source.mp4",mode:"align",reviewed_text:"Hello world."},source:"source.mp4",source_hash:await sha256(path.join(media,"source.mp4")),created_at:new Date().toISOString(),result:{method:"mfa",alignment_path:path.relative(dir,alignment)},artifacts:[{path:path.relative(dir,alignment),sha256:await sha256(alignment)}]}));
  const input={job_id:jobId,source_element_id:sourceId,expected_revision:timelineRevision(project),style:{font_preset:"teko",font_size_px:64,style_variant:"bold_outline",position_preset:"bottom_center",max_width:0.8}};
  const compiled=await compileCaptionProposal(project,{...input,include_cues:true});const replacement=compiled.operations![0]!.replace_captions!;
  assert.equal(replacement.cues[0]!.timeline_start,5);assert.deepEqual(replacement.source_element_ids,[sourceId]);
  // Shipped defaults: one word at a time, at a fixed size.
  assert.equal(compiled.cue_count,2);assert.equal(replacement.timing_mode,"single_word");assert.equal(replacement.word_limit,1);assert.equal(replacement.font_sizing,"fixed");
  // No punctuation on screen unless asked for; the cue text keeps the aligned words.
  assert.equal(replacement.hide_punctuation,true);assert.equal(replacement.cues[1]!.text,"world.");
  const punctuated=await compileCaptionProposal(project,{...input,hide_punctuation:false,include_cues:true});assert.equal(punctuated.operations![0]!.replace_captions!.hide_punctuation,false);
  const phrase=await compileCaptionProposal(project,{...input,word_limit:4,include_cues:true});assert.equal(phrase.cue_count,1);assert.equal(phrase.operations![0]!.replace_captions!.timing_mode,"phrase");
  const unstyled=await compileCaptionProposal(project,{job_id:jobId,source_element_id:sourceId,expected_revision:timelineRevision(project)});
  assert.equal(unstyled.style_source,"product_default");assert.equal(unstyled.operations,undefined,"cues stay stored unless asked for");
  // A card names the stored compile instead of pasting its cues; the compile's dials come with it.
  const card={expected_revision:timelineRevision(project),options:[{id:"captions",operations_from:[{compile_id:compiled.compile_id}],operations:[]}]};
  const expanded=expandCompiledOperations(project,card) as {options:{operations:unknown[];review_controls:unknown[];operations_from?:unknown}[]};
  assert.deepEqual(expanded.options[0]!.operations,compiled.operations);assert.equal(expanded.options[0]!.operations_from,undefined);
  assert.deepEqual(expanded.options[0]!.review_controls,compiled.review_controls);
  assert.throws(()=>expandCompiledOperations(project,{...card,expected_revision:"old"}),/another revision/);
  assert.throws(()=>expandCompiledOperations(project,{...card,options:[{id:"captions",operations_from:[{compile_id:randomUUID()}],operations:[]}]}),/No stored compile/);
  await assert.rejects(()=>compileCaptionProposal(project,{...input,expected_revision:"old"}),/working cut changed/);
  assert.equal(fs.readFileSync(path.join(dir,"timeline.json"),"utf8"),timelineBefore);
  // A talk cut into clips (pauses removed) captions every clip from the one alignment; no caption spans a cut.
  const firstId=randomUUID(),secondId=randomUUID(),clip={type:"video_clip",source_url:`/api/projects/${project}/media/source.mp4`,playback_rate:1,props:{source_duration_seconds:4},removed_at:null};
  fs.writeFileSync(path.join(dir,"timeline.json"),JSON.stringify({schema_version:1,elements:[{...clip,id:secondId,timeline_start:10,duration:2.45,trim_start:1.55,trim_end:0},{...clip,id:firstId,timeline_start:0,duration:0.55,trim_start:1,trim_end:2.45}],transitions:[]}));
  const multi=await compileCaptionProposal(project,{job_id:jobId,source_element_ids:[secondId,firstId],expected_revision:timelineRevision(project),include_cues:true});
  const multiCues=multi.operations![0]!.replace_captions!.cues;
  assert.deepEqual(multiCues.map(cue=>cue.timing_source.element_id),[firstId,secondId]);
  assert.equal(multiCues[0]!.timeline_start,0);assert.ok(Math.abs(multiCues[1]!.timeline_start-10.05)<1e-9);
  assert.deepEqual(multi.operations![0]!.replace_captions!.source_element_ids,[firstId,secondId]);
  await assert.rejects(()=>compileCaptionProposal(project,{job_id:jobId,source_element_id:firstId,source_element_ids:[secondId],expected_revision:timelineRevision(project)}),/not both/);
  const now=new Date().toISOString(),event={schema_version:1,event:"dreamcut.tool_dispatch",call_id:randomUUID(),session_id:randomUUID(),request_id:"1",tool:"media_readiness",contract_version:1,started_at:now,finished_at:now,duration_ms:3,success:true};
  recordToolEvent(event);recordToolEvent(event);assert.equal(toolUsage().observed_calls,1);
  recordToolEvent({...event,call_id:randomUUID(),event:"openedit.tool_dispatch"});assert.equal(toolUsage().observed_calls,2,"pre-rename tool events still count");
 }finally{for(const key of ["TIMELINE_PROJECTS_DIR","DREAMCUT_PROFILE_DIR","MEDIA_PREPARATION_AUTOSTART","AGENT_PREPARATION_AUTOSTART"]){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}fs.rmSync(root,{recursive:true,force:true});}
});
