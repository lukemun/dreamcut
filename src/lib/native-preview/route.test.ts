import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {POST} from '../../app/api/projects/[projectId]/native-preview/route';
test('native endpoint is gated and rejects foreign paths, traversal and cross-origin access',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-preview-route-'));const previous=process.env.TIMELINE_PROJECTS_DIR,flag=process.env.DREAMCUT_NATIVE_PREVIEW;
 const call=(body:unknown,origin?:string)=>POST(new Request('http://localhost:3143/api/projects/test/native-preview',{method:'POST',headers:{host:'127.0.0.1:3143','content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)}),{params:Promise.resolve({projectId:'test'})});
 try{
  process.env.TIMELINE_PROJECTS_DIR=root;delete process.env.DREAMCUT_NATIVE_PREVIEW;
  assert.equal((await call({})).status,404);
  process.env.DREAMCUT_NATIVE_PREVIEW='1';fs.mkdirSync(path.join(root,'test/media'),{recursive:true});fs.writeFileSync(path.join(root,'test/private.txt'),'private');
  const layer={id:'x',path:'/api/projects/test/media/../private.txt',frame:0,fit:'contain',alpha:false,scale:1,x:0,y:0,opacity:1,mask:[0,0,0,0]};
  const body={session:'e9f832be-5ee9-41d9-a416-97037f4aa53a',scene:{version:1,width:2,height:2,layers:[layer]}};
  const traversal=await call(body,'http://127.0.0.1:3143');assert.equal(traversal.status,400);assert.match(await traversal.text(),/outside project/);
  layer.path='/api/projects/other/media/file.mp4';assert.match(await (await call(body)).text(),/this project/);
  assert.match(await (await call(body,'https://external.invalid')).text(),/Cross-origin/);
  body.scene.width=99999;assert.equal((await call(body)).status,400);
 }finally{if(previous===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;if(flag===undefined)delete process.env.DREAMCUT_NATIVE_PREVIEW;else process.env.DREAMCUT_NATIVE_PREVIEW=flag;fs.rmSync(root,{recursive:true,force:true});}
});

test('native source batches retain the same local-only boundary and reject duplicate ids',async()=>{
 const {POST:batch}=await import('../../app/api/projects/[projectId]/native-frames/route');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-batch-route-')),previous=process.env.TIMELINE_PROJECTS_DIR,flag=process.env.DREAMCUT_NATIVE_PREVIEW;
 const call=(body:unknown,origin?:string)=>batch(new Request('http://localhost:3143/api/projects/test/native-frames',{method:'POST',headers:{host:'127.0.0.1:3143','content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)}),{params:Promise.resolve({projectId:'test'})});
 try{
  process.env.TIMELINE_PROJECTS_DIR=root;delete process.env.DREAMCUT_NATIVE_PREVIEW;assert.equal((await call({})).status,404);
  process.env.DREAMCUT_NATIVE_PREVIEW='1';fs.mkdirSync(path.join(root,'test/media'),{recursive:true});fs.writeFileSync(path.join(root,'test/private.txt'),'private');
  const frame={id:'x',source:'/api/projects/test/media/../private.txt',time:0,alpha:false},body={session:'e9f832be-5ee9-41d9-a416-97037f4aa53a',maxDimension:480,frames:[frame]};
  assert.match(await(await call(body)).text(),/outside project/);
  frame.source='/api/projects/other/media/a.mp4';assert.match(await(await call(body)).text(),/this project/);
  assert.match(await(await call(body,'https://other.invalid')).text(),/Cross-origin/);
  body.frames=[frame,frame];assert.match(await(await call(body)).text(),/Duplicate/);
 }finally{if(previous===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;if(flag===undefined)delete process.env.DREAMCUT_NATIVE_PREVIEW;else process.env.DREAMCUT_NATIVE_PREVIEW=flag;fs.rmSync(root,{recursive:true,force:true});}
});

test('native release is gated, scoped and validates its session and origin',async()=>{
 const {DELETE:release}=await import('../../app/api/projects/[projectId]/native-frames/route');
 const flag=process.env.DREAMCUT_NATIVE_PREVIEW;
 const call=(session:string,origin?:string)=>release(new Request('http://localhost:3143/api/projects/test/native-frames',{method:'DELETE',headers:{host:'localhost:3143','content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify({session})}),{params:Promise.resolve({projectId:'test'})});
 try{
  delete process.env.DREAMCUT_NATIVE_PREVIEW;assert.equal((await call('invalid')).status,404);
  process.env.DREAMCUT_NATIVE_PREVIEW='1';assert.equal((await call('invalid')).status,400);
  assert.equal((await call('e9f832be-5ee9-41d9-a416-97037f4aa53a','https://other.invalid')).status,400);
  assert.equal((await call('e9f832be-5ee9-41d9-a416-97037f4aa53a')).status,204);
 }finally{if(flag===undefined)delete process.env.DREAMCUT_NATIVE_PREVIEW;else process.env.DREAMCUT_NATIVE_PREVIEW=flag;}
});
