import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuPictureQueue} from '../gpu-preview/picture-queue';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('complete pictures prepare ahead without transport requests and stay bounded',async()=>{
 const made:number[]=[],closed:number[]=[];
 const queue=new GpuPictureQueue(async(frame:number)=>{made.push(frame);return {frame,bytes:4,close(){closed.push(frame);}};},()=>{},3,()=>assert.fail());
 assert.equal((await queue.request(10,20)).frame,10);await tick();assert.deepEqual(made,[10,11,12]);
 assert.equal(queue.bytes,12);assert.equal((await queue.request(11,20)).frame,11);await tick();
 assert.deepEqual(made,[10,11,12,13]);assert.deepEqual(closed,[10]);assert.equal(queue.size,3);
 queue.close();assert.deepEqual(closed,[10,11,12,13]);
});
test('a seek discards in-flight old pixels and serves only the new position',async()=>{
 let release!:(value:any)=>void;let cancelled=0,closed=0;
 const queue=new GpuPictureQueue(async(frame:number)=>frame===0?new Promise<any>(resolve=>{release=resolve;}):{frame,bytes:4,close(){closed++;}},()=>{cancelled++;},2,()=>assert.fail());
 const old=queue.request(0,30),rejected=assert.rejects(old,{name:'AbortError'});queue.invalidate();const next=queue.request(20,30);
 release({frame:0,bytes:4,close(){closed++;}});await rejected;assert.equal((await next).frame,20);await tick();assert.equal(closed,1);assert.equal(cancelled,1);queue.close();
});
test('producer errors reject demand and cannot publish a partial picture',async()=>{
 let failure:unknown;const queue=new GpuPictureQueue(async()=>{throw Error('decode failed');},()=>{},2,error=>{failure=error;});
 await assert.rejects(queue.request(0,30),/decode failed/);assert.equal(queue.size,0);assert.ok(failure);queue.close();
});

test('closing while composition is pending releases late pixels and rejects the waiter',async()=>{
 let release!:(value:any)=>void,closed=0;
 const queue=new GpuPictureQueue(()=>new Promise<any>(resolve=>{release=resolve;}),()=>{},2,()=>assert.fail());
 const pending=queue.request(0,3),rejected=assert.rejects(pending,{name:'AbortError'});queue.close();
 release({bytes:4,close(){closed++;}});await rejected;await tick();assert.equal(closed,1);assert.equal(queue.bytes,0);
});

test('startup readiness waits for contiguous pictures, not just one ready frame',async()=>{
 const releases=new Map<number,()=>void>();let ready=false;
 const queue=new GpuPictureQueue(async frame=>{await new Promise<void>(resolve=>releases.set(frame,resolve));return {frame,bytes:4,close(){}};},()=>{},3,()=>assert.fail());
 const first=queue.request(10,12);const buffered=queue.readyAhead(10,3).then(()=>{ready=true;});
 releases.get(10)!();await first;assert.equal(ready,false);await tick();releases.get(11)!();await buffered;assert.equal(ready,true);queue.close();
});
test('seek rejects a startup buffer wait instead of hanging it',async()=>{
 const queue=new GpuPictureQueue(async()=>new Promise<any>(()=>{}),()=>{},3,()=>assert.fail());
 const first=queue.request(0,9);const firstRejected=assert.rejects(first,{name:'AbortError'});
 const buffered=assert.rejects(queue.readyAhead(0,3),{name:'AbortError'});queue.invalidate();await Promise.all([firstRejected,buffered]);queue.close();
});

test('spare producer time caches dense future pictures without evicting the runway',async()=>{
 const made:number[]=[],closed:number[]=[];
 const queue=new GpuPictureQueue(async(frame:number)=>{made.push(frame);return {frame,bytes:4,close(){closed.push(frame);}};},()=>{},3,()=>assert.fail(),{frames:[8,9,10],capacity:2,horizon:20});
 await queue.request(0,15);await tick();assert.deepEqual(made,[0,1,2,8,9]);assert.equal(queue.size,5);
 await queue.request(1,15);await tick();assert.deepEqual(made,[0,1,2,8,9,3]);assert.equal(queue.size,5);
 const atEight=await queue.request(8,15);assert.equal(atEight.frame,8);await tick();assert.equal(made.filter(frame=>frame===8).length,1);assert.equal(queue.size,3);
 queue.invalidate();assert.equal(queue.bytes,0);queue.close();
});

test('an expensive first pass is reused on replay and scene edits discard it',async()=>{
 const made:number[]=[],closed:number[]=[];
 const queue=new GpuPictureQueue(async frame=>{made.push(frame);return {frame,cost:frame===4?400:1,bytes:4,close(){closed.push(frame);}};},()=>{},2,()=>assert.fail(),undefined,{capacity:2,thresholdMs:50,cost:p=>p.cost});
 for(let frame=0;frame<8;frame++){await queue.request(frame,8);await tick();}
 assert.equal(queue.replayStats.retained,1);assert.equal(closed.includes(4),false);
 queue.invalidate(true);
 for(let frame=0;frame<8;frame++){await queue.request(frame,8);await tick();}
 assert.equal(made.filter(f=>f===4).length,1);assert.ok(queue.replayStats.hits>0);
 queue.invalidate();assert.equal(closed.filter(f=>f===4).length,1);assert.equal(queue.bytes,0);
 await queue.request(4,8);assert.equal(made.filter(f=>f===4).length,2);queue.close();
});
test('remembered project costs prepare outside the horizon before startup releases',async()=>{
 const made:number[]=[],release=new Map<number,()=>void>();let ready=false;
 const queue=new GpuPictureQueue(async frame=>{made.push(frame);if(frame===20)await new Promise<void>(r=>release.set(frame,r));return {frame,bytes:4,close(){}};},()=>{},2,()=>assert.fail(),undefined,{capacity:2,thresholdMs:50,cost:()=>1,seeds:[[20,400]]});
 await queue.request(0,30);const startup=queue.readyAhead(0,2).then(()=>{ready=true;});await tick();
 assert.deepEqual(made,[0,1,20]);assert.equal(ready,false);release.get(20)!();await startup;assert.equal(ready,true);
 queue.invalidate(true);assert.equal((await queue.request(20,30)).frame,20);assert.equal(made.filter(f=>f===20).length,1);queue.close();
});
test('replay retention stays bounded and deterministically favors costly frames',async()=>{
 const closed:number[]=[];
 const queue=new GpuPictureQueue(async frame=>({frame,bytes:4,close(){closed.push(frame);}}),()=>{},2,()=>assert.fail(),undefined,{capacity:2,thresholdMs:1,cost:p=>p.frame+1});
 for(let frame=0;frame<20;frame++){await queue.request(frame,20);await tick();assert.ok(queue.size<=4);}
 queue.invalidate(true);assert.equal(queue.size,2);assert.equal(queue.bytes,8);queue.close();assert.equal(new Set(closed).size,20);assert.equal(closed.length,20);
});
test('a real picture wait adds a replay exception even when production looked cheap',async()=>{
 const observations:Array<[number,number]>=[];
 const queue=new GpuPictureQueue(async frame=>({frame,bytes:4,close(){}}),()=>{},2,()=>assert.fail(),undefined,{capacity:2,thresholdMs:50,cost:()=>1,onCost:(f,c)=>observations.push([f,c])});
 await queue.request(5,10);queue.recordPlaybackWait(5,200);assert.equal(queue.replayStats.retained,0);
 queue.recordPlaybackWait(5,400);assert.deepEqual(observations,[[5,400]]);queue.invalidate(true);assert.equal(queue.size,1);queue.close();
});
test('a scene change in the same task as a cached request still prepares the new picture',async()=>{
 // Undo in the editor: the transport re-requests the displayed (cached) frame, which starts a
 // producer pass with nothing to prepare; the scene change then invalidates and requests that
 // frame again before any await. The second request must not be stranded behind the first pass.
 const made:number[]=[];
 const queue=new GpuPictureQueue(async(frame:number)=>{made.push(frame);return {frame,bytes:4,close(){}};},()=>{},1,()=>assert.fail());
 await queue.request(0,30);await tick();assert.deepEqual(made,[0]);
 void queue.request(0,30);queue.invalidate();
 const redrawn=queue.request(0,30);
 const outcome=await Promise.race([redrawn.then(picture=>picture.frame),new Promise(resolve=>setTimeout(()=>resolve('stranded'),200))]);
 assert.equal(outcome,0);assert.deepEqual(made,[0,0]);queue.close();
});
