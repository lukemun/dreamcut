import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrameLookahead} from '../gpu-preview/lookahead';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('presentation consumes a sample before its sequential batch finishes',async()=>{
 const queue=new FrameLookahead(),end=deferred();let deliver!:(t:number,d:number)=>void;let calls=0;
 queue.start(new Map([['rgb',[10,20,30]]]),async(_,__,signal,ready)=>{calls++;deliver=ready;await end.promise;assert.equal(signal.aborted,false);});
 const first=queue.wait('rgb',10,new AbortController().signal);deliver(0,20);
 assert.equal(await first,true);assert.equal(queue.active,true);assert.equal(queue.has('rgb',20),true);
 queue.start(new Map([['rgb',[40]]]),async()=>{calls++;});assert.equal(calls,1);
 end.resolve();await tick();assert.equal(queue.active,false);
});
test('a cancelled presentation leaves shared decode available to its successor',async()=>{
 const queue=new FrameLookahead(),end=deferred();let deliver!:(t:number,d:number)=>void;
 queue.start(new Map([['rgb',[10]]]),async(_,__,___,ready)=>{deliver=ready;await end.promise;});
 const abort=new AbortController(),old=queue.wait('rgb',10,abort.signal);abort.abort();await assert.rejects(old);
 const next=queue.wait('rgb',10,new AbortController().signal);deliver(10,1);assert.equal(await next,true);end.resolve();
});
test('seek cancellation resolves waiters and late old completion cannot remove a new batch',async()=>{
 const queue=new FrameLookahead(),oldEnd=deferred(),newEnd=deferred();let late!:(t:number,d:number)=>void;
 queue.start(new Map([['rgb',[10]]]),async(_,__,___,ready)=>{late=ready;await oldEnd.promise;});
 const pending=queue.wait('rgb',10,new AbortController().signal);queue.cancel();assert.equal(await pending,false);
 queue.start(new Map([['rgb',[20]]]),async()=>{await newEnd.promise;});
 late(0,100);oldEnd.resolve();await tick();assert.equal(queue.has('rgb',20),true);assert.equal(queue.active,true);
 queue.cancel();newEnd.resolve();
});
test('a speculative failure or incomplete batch allows a foreground retry',async()=>{
 const queue=new FrameLookahead(),end=deferred();
 queue.start(new Map([['rgb',[10]]]),async()=>{await end.promise;throw Error('decode failed');});
 const pending=queue.wait('rgb',10,new AbortController().signal);end.resolve();assert.equal(await pending,false);await tick();assert.equal(queue.active,false);
 assert.equal(await queue.wait('missing',10,new AbortController().signal),false);
});
test('coverage is source-specific and half-open',async()=>{
 const queue=new FrameLookahead(),end=deferred();let deliver!:(t:number,d:number)=>void;
 queue.start(new Map([['rgb',[10,20]],['mask',[10]]]),async(source,_,__,ready)=>{if(source==='rgb')deliver=ready;await end.promise;});
 const first=queue.wait('rgb',10,new AbortController().signal);deliver(10,10);assert.equal(await first,true);
 assert.equal(queue.has('rgb',20),true);assert.equal(queue.has('mask',10),true);queue.cancel();end.resolve();
});

test('a slow incoming source does not prevent a completed source from refilling',async()=>{
 const queue=new FrameLookahead(),slow=deferred(),calls:string[]=[];
 queue.start(new Map([['incoming',[100]],['playing',[10]]]),async(source,times,signal,ready)=>{
  calls.push(source);if(source==='incoming')await slow.promise;
  assert.equal(signal.aborted,false);ready(times[0],1);
 });
 await tick();assert.equal(queue.active,true);
 queue.start(new Map([['incoming',[101]],['playing',[11]]]),async(source,times,signal,ready)=>{calls.push(source);assert.equal(signal.aborted,false);ready(times[0],1);});
 assert.deepEqual(calls,['incoming','playing','playing']);
 assert.equal(queue.has('incoming',100),true);
 slow.resolve();await tick();assert.equal(queue.active,false);
});

test('a synchronous speculative failure releases its source for a later request',async()=>{
 const queue=new FrameLookahead();
 queue.start(new Map([['source',[0]]]),()=>{throw Error('failed before first await');});
 assert.equal(queue.active,false);
 let calls=0;queue.start(new Map([['source',[0]]]),async()=>{calls++;});await tick();assert.equal(calls,1);
});
