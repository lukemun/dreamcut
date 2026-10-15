import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCodexToolTrial } from './lib/codex-tool-trial.mjs';

async function fixture(mode, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-eval-test-'));
  const bin = path.join(dir,'codex');
  fs.writeFileSync(bin, `#!${process.execPath}\nimport readline from 'node:readline';\nconst send=x=>console.log(JSON.stringify(x));\nreadline.createInterface({input:process.stdin}).on('line',line=>{\n const m=JSON.parse(line);\n if(m.method==='initialize')send({id:m.id,result:{}});\n if(m.method==='thread/start'){\n  if(m.params.environments.length||m.params.runtimeWorkspaceRoots.length||m.params.config.features.shell_tool||m.params.config.web_search!=='disabled')throw Error('Isolation missing');\n  send({id:m.id,result:{model:${JSON.stringify(mode==='fallback'?'other':'gpt-6-sol')},thread:{id:'trial'}}});\n }\n if(m.method==='turn/start'){send({id:m.id,result:{}}); ${mode==='timeout'?'':`send({id:90,method:'item/tool/call',params:{tool:${JSON.stringify(mode==='forbidden'?'exec':'read_state')},arguments:{}}});`} }\n if(m.id===90&&!m.method){\n  ${mode==='forbidden'?"if(m.result.success)throw Error('Forbidden tool allowed');":"if(!m.result.success)throw Error('Expected tool success');"}\n  send({method:'turn/completed',params:{turn:{status:${JSON.stringify(mode==='failed'?'failed':'completed')},error:${mode==='failed'?"{message:'Provider refused model'}":'null'}}}});\n }\n});`);
  fs.chmodSync(bin,0o700);
  const previous=process.env.DREAMCUT_CODEX_EXECUTABLE; process.env.DREAMCUT_CODEX_EXECUTABLE=bin;
  try { await run({cwd:dir,codexHome:dir,model:'gpt-6-sol',instructions:'test',prompt:'test',tools:[{name:'read_state',description:'read',inputSchema:{type:'object'}}],dispatch:async()=>({ok:true}),timeoutMs:mode==='timeout'?100:3000}); }
  finally {if(previous===undefined)delete process.env.DREAMCUT_CODEX_EXECUTABLE;else process.env.DREAMCUT_CODEX_EXECUTABLE=previous;fs.rmSync(dir,{recursive:true,force:true});}
}
test('dynamic tool roundtrip with environment disabled',()=>fixture('ok',async options=>{const result=await runCodexToolTrial(options);assert.equal(result.toolCalls,1);assert.equal(result.model,'gpt-6-sol');}));
test('unknown tools never reach dispatch',()=>fixture('forbidden',async options=>{options.dispatch=async()=>{throw Error('must not dispatch')};const result=await runCodexToolTrial(options);assert.equal(result.toolCalls,1);}));
test('model fallback is rejected',()=>fixture('fallback',options=>assert.rejects(runCodexToolTrial(options),/refusing model fallback/)));
test('failed turns remain failures',()=>fixture('failed',options=>assert.rejects(runCodexToolTrial(options),/Provider refused model/)));
test('timeout terminates child',()=>fixture('timeout',options=>assert.rejects(runCodexToolTrial(options),/timed out/)));
