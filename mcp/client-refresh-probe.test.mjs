import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {gradeRefreshProbe} from './client-refresh-probe.mjs';

test('grader requires ordered hidden/list-change/refreshed/invoked evidence',()=>{
  const events=[{kind:'listed',has_cutout_status:false},{kind:'call',tool:'capability_catalog',action:'load',family:'cutout-preparation'},{kind:'list_changed'},{kind:'listed',has_cutout_status:true},{kind:'call',tool:'cutout_status'},{kind:'probe_result'}];
  assert.equal(gradeRefreshProbe({events}).pass,true);
  for(let i=0;i<events.length;i++)assert.equal(gradeRefreshProbe({events:events.filter((_,j)=>i!==j)}).pass,false);
  assert.equal(gradeRefreshProbe({events:[...events,{kind:'blocked_call'}]}).pass,false);
  assert.equal(gradeRefreshProbe({events:[...events].reverse()}).pass,false);
  assert.equal(gradeRefreshProbe({events:[{kind:'listed',has_cutout_status:true},...events]}).pass,false);
  for(const kind of ['timeout','runtime_error'])assert.equal(gradeRefreshProbe({events:[...events,{kind}]}).pass,false);
});

test('full baseline grader requires exposed initial list and ordered status call',()=>{
  const events=[{kind:'listed',has_cutout_status:true},{kind:'call',tool:'cutout_status'},{kind:'probe_result'}];
  assert.equal(gradeRefreshProbe({profile:'full',events}).pass,true);
  assert.equal(gradeRefreshProbe({profile:'editing',events}).pass,false);
  assert.equal(gradeRefreshProbe({profile:'unknown',events}).pass,false);
  for(let i=0;i<events.length;i++)assert.equal(gradeRefreshProbe({profile:'full',events:events.filter((_,j)=>i!==j)}).pass,false);
  for(const kind of ['blocked_call','timeout','runtime_error'])assert.equal(gradeRefreshProbe({profile:'full',events:[...events,{kind}]}).pass,false);
});

for(const profile of ['editing','full'])test(`isolated production-server probe: ${profile}`,  {timeout:10000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-refresh-')),file=path.join(dir,'receipt.json');
  const child=spawn(process.execPath,['mcp/client-refresh-probe.mjs','serve',file,profile],{stdio:['pipe','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null && child.signalCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}fs.rmSync(dir,{recursive:true,force:true});});
  const pending=new Map();let id=0;
  createInterface({input:child.stdout}).on('line',line=>{const msg=JSON.parse(line);pending.get(msg.id)?.(msg.result);});
  const request=(method,params)=>new Promise(resolve=>{const key=++id;pending.set(key,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
  await request('initialize',{clientInfo:{name:'automated-fixture-not-real-codex',version:'1'}});
  const first=await request('tools/list',{});
  assert.equal(first.tools.some(t=>t.name==='cutout_status'),profile==='full');
  if(profile==='editing')await request('tools/call',{name:'capability_catalog',arguments:{action:'load',id:'cutout-preparation'}});
  assert.equal(gradeRefreshProbe(JSON.parse(fs.readFileSync(file))).pass,false);
  const listed=await request('tools/list',{});assert.ok(listed.tools.some(t=>t.name==='cutout_status'));
  await request('tools/call',{name:'cutout_status',arguments:{project_id:'refresh-probe',job_id:'probe-job'}});
  const grade=gradeRefreshProbe(JSON.parse(fs.readFileSync(file)));assert.equal(grade.pass,true);assert.equal(grade.client.name,'automated-fixture-not-real-codex');assert.equal(grade.profile,profile);assert.equal(JSON.parse(fs.readFileSync(file)).version,2);
  const forbidden=await request('tools/call',{name:'cutout_prepare',arguments:{}});assert.equal(forbidden.isError,true);
  assert.equal(gradeRefreshProbe(JSON.parse(fs.readFileSync(file))).pass,false);
});
