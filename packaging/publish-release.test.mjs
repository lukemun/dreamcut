import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReusedArchive } from './publish-release.mjs';

test('checks private GitHub assets through authenticated release metadata', async () => {
  const archive={url:'https://github.com/owner/private/releases/download/v0.2.0/base.tar.gz',file:'base.tar.gz',bytes:42};
  const readRelease=(repo,tag)=>{ assert.equal(repo,'owner/private');assert.equal(tag,'v0.2.0');return {assets:[{name:'base.tar.gz',size:42}]}; };
  await verifyReusedArchive(archive,{readRelease,request:()=>assert.fail('no anonymous GitHub request')});
  await assert.rejects(verifyReusedArchive({...archive,bytes:43},{readRelease}),/wrong size/);
  await assert.rejects(verifyReusedArchive(archive,{readRelease:()=>({assets:[]})}),/missing/);
});
test('external mirrors never receive GitHub credentials', async () => {
  let called=false;
  await verifyReusedArchive({url:'https://downloads.example/base.tar.gz'}, {
    readRelease:()=>assert.fail('no credentials outside GitHub'),
    request:async (url,options)=>{called=true;assert.equal(options.method,'HEAD');assert.equal(options.headers,undefined);return {ok:true};},
  });
  assert.ok(called);
});
