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
  const compiled=await compileCaptionProposal(project,input);assert.equal(compiled.persisted,false);assert.equal(compiled.operation.replace_captions!.cues[0].timeline_start,5);assert.deepEqual(compiled.operation.replace_captions!.source_element_ids,[sourceId]);
  await assert.rejects(()=>compileCaptionProposal(project,{...input,expected_revision:"old"}),/working cut changed/);
  assert.equal(fs.readFileSync(path.join(dir,"timeline.json"),"utf8"),timelineBefore);
  const now=new Date().toISOString(),event={schema_version:1,event:"dreamcut.tool_dispatch",call_id:randomUUID(),session_id:randomUUID(),request_id:"1",tool:"media_readiness",contract_version:1,started_at:now,finished_at:now,duration_ms:3,success:true};
  recordToolEvent(event);recordToolEvent(event);assert.equal(toolUsage().observed_calls,1);
  recordToolEvent({...event,call_id:randomUUID(),event:"openedit.tool_dispatch"});assert.equal(toolUsage().observed_calls,2,"pre-rename tool events still count");
 }finally{for(const key of ["TIMELINE_PROJECTS_DIR","DREAMCUT_PROFILE_DIR","MEDIA_PREPARATION_AUTOSTART","AGENT_PREPARATION_AUTOSTART"]){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}fs.rmSync(root,{recursive:true,force:true});}
});
