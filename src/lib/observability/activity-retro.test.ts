import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildActivityRetroPacket, type ActivityRetroSelection } from "./activity-retro";
import type { Activity } from "./agent-activity";
const session="a".repeat(24), id="b".repeat(24);
const call: Activity={id,kind:"call",call_id:"native",timestamp:"2026-09-30T12:00:00Z",runtime:"codex",source_offset:10,tool:"exec",input:"python repair.py",boundary:"outside-tool-contract"};
const selection: ActivityRetroSelection={project_id:"fixture",checkpoint_id:"export-fixture",selections:[{session,call_event_id:id,role:"media-preparation",relevance:"Prepare the mask for the delivered fixture."}]};
function input() {return {selection,checkpoint:{id:selection.checkpoint_id,revision:"revision",checkpoint:{trigger:"export"}},learning:true,agentRetros:true,exportCompleted:true,sessions:{[session]:{events:[call],gaps:2,pending_bytes:30}}};}
test("disabled review and unsuccessful exports cannot produce candidate evidence",()=>{
  for(const change of [{learning:false},{agentRetros:false},{exportCompleted:false}]) assert.throws(()=>buildActivityRetroPacket({...input(),...change}));
  assert.throws(()=>buildActivityRetroPacket({...input(),checkpoint:{id:"wrong",revision:"r",checkpoint:{trigger:"export"}}}));
});
test("scope must name existing calls and cannot duplicate or invent evidence",()=>{
  assert.throws(()=>buildActivityRetroPacket({...input(),sessions:{}}));
  assert.throws(()=>buildActivityRetroPacket({...input(),selection:{...selection,selections:[selection.selections[0],selection.selections[0]]}}));
  assert.throws(()=>buildActivityRetroPacket({...input(),selection:{...selection,selections:[{...selection.selections[0],role:"coding" as never}]}}));
});
test("missing results stay unknown, gaps survive, and late results produce a new immutable identity",()=>{
  const source=input(), before=buildActivityRetroPacket(source);
  assert.equal(before.evidence[0].result,null);assert.equal(before.evidence[0].session_coverage.gaps,2);
  assert.equal(before.packet_id,buildActivityRetroPacket(source).packet_id);
  source.sessions[session].events.push({...call,id:"c".repeat(24),kind:"result",output:"done"});
  const after=buildActivityRetroPacket(source);
  assert.notEqual(before.packet_id,after.packet_id);assert.equal(before.evidence[0].result,null);
  assert.equal(after.evidence[0].result?.output,"done");
});
test("ambiguous result joins fail instead of attributing another result",()=>{
  const source=input();source.sessions[session].events.push({...call,id:"c".repeat(24),kind:"result"},{...call,id:"d".repeat(24),kind:"result"});
  assert.throws(()=>buildActivityRetroPacket(source),/Ambiguous/);
});
test("CLI writes only a private supplemental packet and reuses the same selection",()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"activity-retro-"));
  const profile=path.join(tmp,"profile"),projects=path.join(tmp,"projects");
  const write=(file:string,value:unknown)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
  try {
    const source=input();
    write(path.join(profile,"preferences.json"),{version:1,learning:true,agent_retros:true,preferences:[]});
    const checkpointPath=path.join(projects,"fixture","memory","retros","export-fixture.json");
    write(checkpointPath,{...source.checkpoint,status:"queued",created_at:"2026-09-30T12:00:00Z"});
    write(path.join(projects,".cache","render-jobs","export-fixture.json"),{status:"completed"});
    const workspace=fs.realpathSync(process.cwd()), key=createHash("sha256").update(workspace).digest("hex").slice(0,24);
    const native="synthetic-session", sessionId=createHash("sha256").update(native).digest("hex").slice(0,24);
    const root=path.join(profile,"agent-activity",key);
    write(path.join(root,"index.json"),{workspace,sessions:[{source:native,gaps:0,pending_bytes:0}]});
    fs.mkdirSync(path.join(root,sessionId));fs.writeFileSync(path.join(root,sessionId,"events.jsonl"),JSON.stringify(call)+"\n");
    const selectionPath=path.join(tmp,"selection.json");write(selectionPath,{...selection,selections:[{...selection.selections[0],session:sessionId}]});
    const before=fs.readFileSync(checkpointPath,"utf8");
    const run=(extra: string[] = [])=>JSON.parse(execFileSync(process.execPath,["--import","tsx","scripts/activity-retro.ts","--selection",selectionPath,...extra],{cwd:process.cwd(),env:{...process.env,DREAMCUT_PROFILE_DIR:profile,TIMELINE_PROJECTS_DIR:projects},encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
    const first=run(), second=run();assert.equal(first.file,second.file);assert.equal(first.destination,"chat-only");
    assert.ok(first.file.startsWith(profile));assert.equal(fs.readFileSync(checkpointPath,"utf8"),before);
    assert.deepEqual(fs.readdirSync(path.join(projects,"fixture","memory")),["retros"]);
    write(selectionPath,{mode:"standalone",task_id:"mask-review",task_description:"Review mask preparation for a tool-only agent.",selections:[{...selection.selections[0],session:sessionId}]});
    fs.rmSync(projects,{recursive:true,force:true});
    write(path.join(profile,"preferences.json"),{version:1,learning:false,agent_retros:false,preferences:[]});
    assert.throws(()=>run());
    const standalone=run(["--standalone"]);
    const packet=JSON.parse(fs.readFileSync(standalone.file,"utf8"));
    assert.equal(packet.mode,"standalone");assert.equal(packet.checkpoint_id,null);
    assert.ok(!fs.existsSync(projects));

  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});

test("standalone requires explicit invocation and a task, but no export or automatic learning",()=>{
  const task={mode:"standalone" as const,task_id:"task",task_description:"Inspect reusable mask correction needs.",selections:selection.selections};
  const args={...input(),selection:task,checkpoint:undefined,learning:false,agentRetros:false,exportCompleted:false};
  assert.throws(()=>buildActivityRetroPacket(args),/explicit request/);
  const packet=buildActivityRetroPacket({...args,standaloneRequested:true});
  assert.equal(packet.mode,"standalone");assert.equal(packet.checkpoint_id,null);
  assert.throws(()=>buildActivityRetroPacket({...args,standaloneRequested:true,selection:{...task,checkpoint_id:"fake"}}));
  assert.throws(()=>buildActivityRetroPacket({...input(),learning:false,standaloneRequested:true}),/disabled/);
});
