import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {verifyArtifact,trackOwnedChild,terminateOwnedChild,runLocalSuite,defaultModelRoot} from './local-model-suite.mjs';

test('models downloaded under the OpenEdit folder stay in use until a DreamCut folder exists',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-model-root-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 assert.equal(defaultModelRoot(home),path.join(home,'.local/share/dreamcut/models'));
 await fs.mkdir(path.join(home,'.local/share/openedit/models'),{recursive:true});
 assert.equal(defaultModelRoot(home),path.join(home,'.local/share/openedit/models'));
 await fs.mkdir(path.join(home,'.local/share/dreamcut/models'),{recursive:true});
 assert.equal(defaultModelRoot(home),path.join(home,'.local/share/dreamcut/models'));
});

test('hashes actual bytes and rejects same-length changed weights',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'oe-model-identity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'fixture.gguf'),bytes=Buffer.from('original');await fs.writeFile(file,bytes);
 const entry={filename:'fixture.gguf',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const receipt=await verifyArtifact(file,entry);assert.equal(receipt.sha256,entry.sha256);
 await fs.writeFile(file,'modified');await assert.rejects(verifyArtifact(file,entry),/SHA-256 mismatch/);
});
test('owned child is closed before termination returns, including SIGKILL escalation',async()=>{
 const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);console.log('ready')"],{stdio:['ignore','pipe','ignore']});
 const owned=trackOwnedChild(child);await once(child.stdout,'data');
 await terminateOwnedChild(owned,{termGraceMs:20,killGraceMs:1000});
 assert.equal(owned.isClosed,true);assert.equal(child.signalCode,'SIGKILL');
});
test('artifact failures are recorded per model without launching inference',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'oe-model-preflight-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(dir,'download-manifest.json'),'[]');
 const result=await runLocalSuite({names:['qwen','ministral'],modelRoot:dir,binary:process.execPath,outputRoot:path.join(dir,'output')});
 assert.equal(result.results.length,2);assert(result.results.every(r=>r.status==='blocked' && r.files.length===0));
});
