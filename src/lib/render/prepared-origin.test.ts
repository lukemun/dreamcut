import assert from 'node:assert/strict';
import test from 'node:test';
import {POST, GET, DELETE} from '../../app/api/projects/[projectId]/prepared-preview/route';
test('prepared preview rejects cross-origin starts, reads and cancellation before accessing project state',async()=>{
 for(const handler of [POST,GET,DELETE]) {
  for(const headers of [{origin:'https://foreign.invalid'},{origin:'null'},{'sec-fetch-site':'cross-site'}]) {
   const response=await handler(new Request('http://127.0.0.1:3123/api/projects/missing/prepared-preview',{headers}),{params:Promise.resolve({projectId:'missing'})});
   assert.equal(response.status,400); assert.match(await response.text(),/Cross-origin/);
  }
 }
 const response=await POST(new Request('http://127.0.0.1:3123/api/projects/missing/prepared-preview',{headers:{origin:'http://127.0.0.1:3123','sec-fetch-site':'same-origin'}}),{params:Promise.resolve({projectId:'missing'})});
 assert.doesNotMatch(await response.text(),/Cross-origin/);
});


test('browser-facing Host survives Next internal URL reconstruction without trusting forwarded headers',async()=>{
 for(const handler of [POST,GET,DELETE]) {
  const call=(headers:Record<string,string>)=>handler(new Request('http://localhost:3143/api/projects/missing/prepared-preview',{headers}),{params:Promise.resolve({projectId:'missing'})});
  const legitimate=await call({host:'127.0.0.1:3143',origin:'http://127.0.0.1:3143','sec-fetch-site':'same-origin'});
  assert.doesNotMatch(await legitimate.text(),/Cross-origin|requires the local editor/);
  for(const origin of ['http://127.0.0.1:3144','http://localhost:3143','https://foreign.invalid','null']) {
   assert.match(await (await call({host:'127.0.0.1:3143',origin,'x-forwarded-host':new URL('https://foreign.invalid').host})).text(),/Cross-origin/);
  }
  assert.match(await (await call({host:'foreign.invalid',origin:'http://foreign.invalid'})).text(),/requires the local editor/);
  assert.match(await (await call({host:'127.0.0.1:3143','sec-fetch-site':'cross-site'})).text(),/Cross-origin/);
 }
});
