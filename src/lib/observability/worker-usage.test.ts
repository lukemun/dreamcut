import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWorkerUsageAudit} from './worker-usage';
test('worker receipts preserve usage through chunk splits without retaining private content',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'worker-usage-'));
 try{const audit=createWorkerUsageAudit('codex',dir);
 const line=JSON.stringify({type:'turn.completed',usage:{input_tokens:100,output_tokens:20,cached_input_tokens:80,secret:123},prompt:'PRIVATE',reasoning:'PRIVATE'});
 audit.chunk(line.slice(0,30));audit.chunk(line.slice(30)+'\n');audit.finish('completed',0);
 const raw=fs.readFileSync(audit.file,'utf8'),r=JSON.parse(raw);assert.equal(r.status,'completed');assert.deepEqual(r.usage,[{input_tokens:100,output_tokens:20,cached_input_tokens:80}]);assert.ok(!raw.includes('PRIVATE'));assert.ok(!raw.includes('secret'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed or interrupted workers have explicit unknown usage instead of zero',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'worker-usage-'));
 try{const audit=createWorkerUsageAudit('claude',dir);audit.chunk('{"type":"result","private":"not stored"}');audit.finish('failed',1);const r=JSON.parse(fs.readFileSync(audit.file,'utf8'));assert.equal(r.status,'failed');assert.equal(r.usage.length,0);assert.match(r.coverage,/unavailable/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
