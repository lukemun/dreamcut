import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { codexOutputSchema, runWorker, runWorkerProcess, type WorkerAdapter } from "./worker-runner";

test("URL fields use a compatible wire schema without losing result validation", async () => {
  const original = z.toJSONSchema(z.object({ sources: z.array(z.object({ url: z.string().url() }).strict()) }).strict());
  const wire = codexOutputSchema(original);
  assert.ok(JSON.stringify(original).includes('"format":"uri"'));
  assert.ok(!JSON.stringify(wire).includes('"format":"uri"'));
  const schema = z.object({ sources: z.array(z.object({ url: z.string().url() }).strict()) }).strict();
  const adapter: WorkerAdapter = { id: "schema-check", access: ["read-only"], run: async () => ({ sources: [{ url: "not a URL" }] }) };
  await assert.rejects(runWorker(request, schema, adapter));
  adapter.run = async () => ({ sources: [{ url: "https://example.com/reference" }] });
  assert.equal((await runWorker(request, schema, adapter)).sources.length, 1);
  assert.deepEqual(codexOutputSchema({ properties: { date: { format: "date-time" } } }), { properties: { date: { format: "date-time" } } });
});

const request = { prompt: "Inspect only", cwd: process.cwd(), access: "read-only" as const, timeoutMs: 1000 };
test("worker contract is provider independent and validates results", async () => {
  const adapter: WorkerAdapter = { id: "local-tool", access: ["read-only"], run: async input => {
    assert.equal(input.prompt, request.prompt); assert.ok(input.schema); return { count: 2 };
  } };
  assert.deepEqual(await runWorker(request, z.object({ count: z.number() }), adapter), { count: 2 });
  await assert.rejects(runWorker(request, z.object({ count: z.string() }), adapter));
  await assert.rejects(runWorker({ ...request, access: "workspace-write" }, z.object({}), adapter), /cannot enforce/);
});
test("process adapter supports stdin and cancellation", async () => {
  assert.equal(await runWorkerProcess(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], request, "payload"), "payload");
  const controller = new AbortController();
  const running = runWorkerProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { ...request, signal: controller.signal }, "");
  controller.abort();
  await assert.rejects(running, /cancelled/);
  await assert.rejects(runWorkerProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { ...request, timeoutMs: 30 }, ""), /timed out/);
});

test('owned Codex worker emits a durable native usage receipt without the collector',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const {codexWorker}=await import('./worker-runner');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'worker-receipt-')),exe=path.join(root,'fake-codex');
 fs.writeFileSync(exe,`#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2);if(!args.includes('--json'))process.exit(2);
process.stdin.resume();process.stdin.on('end',()=>{fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'{"ok":true}');console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-thread'}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,output_tokens:20,cached_input_tokens:80}}));});
`,{mode:0o700});
 const prior={profile:process.env.DREAMCUT_PROFILE_DIR,capture:process.env.DREAMCUT_ACTIVITY_CAPTURE,exe:process.env.DREAMCUT_CODEX_EXECUTABLE};
 process.env.DREAMCUT_PROFILE_DIR=root;process.env.DREAMCUT_ACTIVITY_CAPTURE='1';process.env.DREAMCUT_CODEX_EXECUTABLE=exe;
 try{
  assert.deepEqual(await codexWorker.run({prompt:'PRIVATE-FIXTURE',cwd:root,schema:{type:'object'},timeoutMs:5000,access:'read-only'}),{ok:true});
  const files=fs.readdirSync(path.join(root,'worker-usage'));assert.equal(files.length,1);
  const text=fs.readFileSync(path.join(root,'worker-usage',files[0]),'utf8'),receipt=JSON.parse(text);
  assert.equal(receipt.status,'completed');assert.equal(receipt.thread_id,'fixture-thread');assert.equal(receipt.usage[0].input_tokens,100);assert.ok(!text.includes('PRIVATE-FIXTURE'));
 }finally{
  for(const [key,value] of Object.entries({DREAMCUT_PROFILE_DIR:prior.profile,DREAMCUT_ACTIVITY_CAPTURE:prior.capture,DREAMCUT_CODEX_EXECUTABLE:prior.exe})){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  fs.rmSync(root,{recursive:true,force:true});
 }
});
