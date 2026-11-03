import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeActivity, redactActivity, createActivityMonitor } from "./agent-activity";
const stamp = "2026-09-30T20:00:00Z";
test("Codex wrapper code remains a request; image output is delivery, not model vision", () => {
  const events = normalizeActivity({ timestamp: stamp, type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "a", input: 'await tools.exec_command({cmd: "python cutout.py"})' } }, "codex", "s", 0);
  assert.equal(events[0].boundary, "outside-tool-contract");
  assert.ok(events[0].hints?.includes("nested tool code; execution unverified"));
  const result = normalizeActivity({ timestamp: stamp, type: "response_item", payload: { type: "function_call_output", call_id: "a", output: [{type:"input_image", image_url:"data:image/png;base64,ABC"}, {type:"text",text:"done"}] } }, "codex", "s", 12)[0];
  assert.equal(result.image_payloads, 1); assert.equal(result.output, "done\n");
  assert.ok(!JSON.stringify(result).includes("ABC"));
  assert.deepEqual(normalizeActivity({type:"response_item",payload:{type:"reasoning",text:"private"}},"codex","s",20),[]);
});
test("Claude tool calls and errors match; prose and thinking are excluded", () => {
  const call = normalizeActivity({timestamp:stamp,type:"assistant",message:{content:[{type:"thinking",thinking:"private"},{type:"tool_use",id:"a",name:"Bash",input:{command:"ffmpeg -version"}}]}},"claude","s",0);
  assert.equal(call.length,1); assert.equal(call[0].call_id,"a");
  const result=normalizeActivity({timestamp:stamp,type:"user",message:{content:[{type:"tool_result",tool_use_id:"a",is_error:true,content:"failed"}]}},"claude","s",1);
  assert.equal(result[0].error,true); assert.equal(result[0].call_id,"a");
});
test("credentials and binary content are excluded from saved diagnostics", () => {
  const value=redactActivity('OPENAI_API_KEY="secret-value" token: abc Bearer xyz sk-test123 data:image/png;base64,YWJj');
  for(const secret of ['secret-value','abc','xyz','sk-test123','YWJj']) assert.ok(!value.includes(secret));
});
test("incremental capture excludes unrelated sessions, waits for partial lines and resumes without duplicates", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"activity-test-"));
  const workspace=path.join(root,"repo"), sessions=path.join(root,".codex","sessions");
  fs.mkdirSync(workspace);fs.mkdirSync(sessions,{recursive:true});
  const source=path.join(sessions,"one.jsonl"), directory=path.join(root,"out");
  const header=JSON.stringify({type:"session_meta",payload:{cwd:fs.realpathSync(workspace)}})+"\n";
  const event=JSON.stringify({timestamp:stamp,type:"response_item",payload:{type:"function_call",name:"apply_patch",call_id:"x",arguments:"patch"}});
  fs.writeFileSync(source,header+event.slice(0,30));
  fs.writeFileSync(path.join(sessions,"other.jsonl"),JSON.stringify({type:"session_meta",payload:{cwd:"/unrelated"}})+"\n"+event+"\n");
  const prior=process.env.CODEX_HOME;delete process.env.CODEX_HOME;
  let monitor: ReturnType<typeof createActivityMonitor> | undefined;
  try {
    monitor=createActivityMonitor({workspace,directory,home:root,since:"2026-09-30T00:00:00Z"});
    assert.equal(monitor.tick().imported,0);
    assert.throws(()=>createActivityMonitor({workspace,directory,home:root}),/already running/);
    fs.appendFileSync(source,event.slice(30)+"\n");assert.equal(monitor.tick().imported,1);
    assert.equal(monitor.tick().imported,0);monitor.close();
    monitor=createActivityMonitor({workspace,directory,home:root});assert.equal(monitor.tick().imported,0);
    const index=JSON.parse(fs.readFileSync(path.join(monitor.directory,"index.json"),"utf8"));
    assert.equal(index.sessions.length,1);
    assert.ok(fs.readFileSync(index.sessions[0].report,"utf8").includes("apply_patch"));
  } finally {monitor?.close();if(prior!==undefined)process.env.CODEX_HOME=prior;fs.rmSync(root,{recursive:true,force:true});}
});
test("a repeated source record has a stable identity and normal MCP names stay separate", () => {
  const record={timestamp:stamp,type:"response_item",payload:{type:"function_call",name:"mcp__dreamcut__proposal_create",arguments:{project_id:"fixture"},call_id:"p"}};
  const first=normalizeActivity(record,"codex","source",100)[0];
  assert.equal(first.id,normalizeActivity(record,"codex","source",100)[0].id);
  assert.notEqual(first.id,normalizeActivity(record,"codex","source",101)[0].id);
  assert.equal(first.boundary,"mcp");
});
test("large image-bearing results count delivery without retaining base64", () => {
  const payload="A".repeat(12*1024*1024);
  const event=normalizeActivity({timestamp:stamp,type:"response_item",payload:{type:"custom_tool_call_output",call_id:"large",output:[{type:"input_image",image_url:"data:image/png;base64,"+payload}]}},"codex","s",42)[0];
  assert.equal(event.image_payloads,1);assert.ok(JSON.stringify(event).length<500);
});

test('capture reads image records larger than one chunk without skipping the next usage record',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'activity-large-')),workspace=path.join(root,'repo'),sessions=path.join(root,'.codex','sessions');fs.mkdirSync(workspace);fs.mkdirSync(sessions,{recursive:true});
 const header=JSON.stringify({type:'session_meta',payload:{cwd:fs.realpathSync(workspace)}})+'\n';
 const result=JSON.stringify({timestamp:stamp,type:'response_item',payload:{type:'custom_tool_call_output',call_id:'large',output:[{type:'input_image',image_url:'data:image/png;base64,'+'A'.repeat(17*1024*1024)}]}})+'\n';
 fs.writeFileSync(path.join(sessions,'one.jsonl'),header+result);
 const prior=process.env.CODEX_HOME;delete process.env.CODEX_HOME;let monitor:ReturnType<typeof createActivityMonitor>|undefined;
 try{monitor=createActivityMonitor({workspace,directory:path.join(root,'out'),home:root,since:'2026-09-30'});monitor.tick();assert.equal(monitor.tick().imported,1);
 const index=JSON.parse(fs.readFileSync(path.join(monitor.directory,'index.json'),'utf8'));assert.equal(index.sessions[0].gaps,0);assert.equal(index.sessions[0].pending_bytes,0);
 }finally{monitor?.close();if(prior!==undefined)process.env.CODEX_HOME=prior;fs.rmSync(root,{recursive:true,force:true});}
});

test('long sessions pass the former storage cap and failed writes do not advance capture',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'activity-durable-')),workspace=path.join(root,'repo'),sessions=path.join(root,'.codex','sessions');fs.mkdirSync(workspace);fs.mkdirSync(sessions,{recursive:true});
 const header=JSON.stringify({type:'session_meta',payload:{cwd:fs.realpathSync(workspace)}})+'\n';
 const events=Array.from({length:800},(_,i)=>JSON.stringify({timestamp:stamp,type:'response_item',payload:{type:'function_call',name:'test',call_id:String(i),arguments:'x'.repeat(12000)}})).join('\n')+'\n';
 fs.writeFileSync(path.join(sessions,'one.jsonl'),header+events);
 const prior=process.env.CODEX_HOME;delete process.env.CODEX_HOME;let monitor:ReturnType<typeof createActivityMonitor>|undefined;
 try{monitor=createActivityMonitor({workspace,directory:path.join(root,'out'),home:root,since:'2026-09-30'});
 const original=fs.writeFileSync;const mock=t.mock.method(fs,'writeFileSync',((file:any,...args:any[])=>{if(typeof file==='number')throw Error('disk full');return (original as any)(file,...args);}) as any);
 assert.throws(()=>monitor!.tick(),/disk full/);mock.mock.restore();assert.equal(monitor.tick().imported,800);assert.equal(monitor.tick().imported,0);
 const index=JSON.parse(fs.readFileSync(path.join(monitor.directory,'index.json'),'utf8'));assert.equal(index.sessions[0].gaps,0);assert.equal(index.sessions[0].pending_bytes,0);
 monitor.close();monitor=createActivityMonitor({workspace,directory:path.join(root,'out'),home:root,rebuild:true});assert.equal(monitor.tick().imported,800);assert.equal(monitor.tick().imported,0);
 }finally{monitor?.close();if(prior!==undefined)process.env.CODEX_HOME=prior;fs.rmSync(root,{recursive:true,force:true});}
});
