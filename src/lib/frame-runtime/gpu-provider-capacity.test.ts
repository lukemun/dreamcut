import test from 'node:test';
import assert from 'node:assert/strict';
import {decodedSampleInterval} from '../gpu-preview/sample-time';
import {BrowserFrameProvider} from '../gpu-preview/browser-frame-provider';

function fixture(){
 const provider=new BrowserFrameProvider(1);
 // Isolate admission/ownership from browser demux and codec APIs.
 const state=provider as unknown as {sessions:Map<string,any>;retained:Map<string,any>;capacityWaiters:Set<()=>void>;session:(source:any)=>any;notifyCapacity:()=>void};
 let opened=0,disposed=0;
 const session={busy:1,used:0,tail:Promise.resolve(),input:{dispose(){disposed++;}},sink:Promise.resolve({async *samplesAtTimestamps(){}})};
 state.sessions.set('occupied',session);
 state.session=(source)=>{opened++;state.retained.clear();state.sessions.set(source.key,session);return session;};
 return {provider,state,session,get opened(){return opened;},get disposed(){return disposed;}};
}
const source={key:'next',url:'/next.mp4',validationUrl:'/next.mp4'};
test('busy decoder capacity waits and resumes without exceeding the source limit',async()=>{
 const f=fixture(),controller=new AbortController();
 const pending=f.provider.decode(source,[],controller.signal,()=>assert.fail('No samples requested'));
 assert.equal(f.opened,0);assert.equal(f.state.capacityWaiters.size,1);
 f.session.busy=0;f.state.notifyCapacity();await pending;
 assert.equal(f.opened,1);assert.equal(f.session.busy,0);assert.equal(f.state.capacityWaiters.size,0);
 f.provider.close();assert.equal(f.disposed,1);
});
test('cancelled capacity waits cannot open or receive a decoder',async()=>{
 const f=fixture(),controller=new AbortController();
 const pending=f.provider.decode(source,[],controller.signal,()=>assert.fail());
 controller.abort();await assert.rejects(pending,{name:'AbortError'});
 assert.equal(f.opened,0);assert.equal(f.state.capacityWaiters.size,0);f.provider.close();
});
test('closing wakes capacity waiters and rejects without opening more decoders',async()=>{
 const f=fixture();const pending=f.provider.decode(source,[],new AbortController().signal,()=>assert.fail());
 f.provider.close();await assert.rejects(pending,/Frame provider closed/);
 assert.equal(f.opened,0);assert.equal(f.state.capacityWaiters.size,0);
});
test('multiple waiters recheck capacity after a shared wakeup',async()=>{
 const f=fixture();let admitted=0;
 f.state.session=(source)=>{assert.equal(f.session.busy,0);admitted++;f.state.retained.clear();f.state.sessions.set(source.key,f.session);return f.session;};
 const requests=[0,1,2].map(i=>f.provider.decode({...source,key:`next-${i}`},[],new AbortController().signal,()=>assert.fail()));
 assert.equal(f.state.capacityWaiters.size,3);f.session.busy=0;f.state.notifyCapacity();
 await Promise.all(requests);assert.equal(admitted,3);assert.equal(f.session.busy,0);
 assert.equal(f.state.capacityWaiters.size,0);f.provider.close();
});
test('a request for an existing source queues on its sink without needing another slot',async()=>{
 const f=fixture();
 await f.provider.decode({...source,key:'occupied'},[],new AbortController().signal,()=>assert.fail());
 assert.equal(f.opened,1);assert.equal(f.state.capacityWaiters.size,0);
 assert.equal(f.session.busy,1);f.provider.close();
});

test('decode timings separate capacity, queue and initialization and report only completed work',async()=>{
 const f=fixture(),rows:import('../gpu-preview/browser-frame-provider').GpuVideoDecodeTiming[]=[];
 let release!:(sink:any)=>void;f.session.sink=new Promise(resolve=>{release=resolve;});
 const pending=f.provider.decode(source,[],new AbortController().signal,()=>assert.fail(),row=>rows.push(row));
 assert.equal(rows.length,0);f.session.busy=0;f.state.notifyCapacity();
 await Promise.resolve();assert.equal(rows.length,0);
 release({async *samplesAtTimestamps(){}});await pending;
 assert.equal(rows.length,1);assert.equal(rows[0].sourceKey,source.key);assert.equal(rows[0].requestedFrames,0);assert.equal(rows[0].sessionReused,false);
 const phases=[rows[0].capacityMs,rows[0].queueMs,rows[0].initializationMs,rows[0].decodeMs];
 assert.ok(phases.every(v=>Number.isFinite(v)&&v>=0));
 assert.ok(Math.abs(phases.reduce((a,b)=>a+b,0)-rows[0].totalMs)<1e-6);
 f.provider.close();
});

test('cancelled initialization releases capacity without reporting successful decode timing',async()=>{
 const f=fixture(),controller=new AbortController();let reports=0;
 let release!:(sink:any)=>void;f.session.sink=new Promise(resolve=>{release=resolve;});
 f.session.busy=0;
 const pending=f.provider.decode(source,[],controller.signal,()=>assert.fail(),()=>{reports++;});
 await Promise.resolve();controller.abort();
 release({async *samplesAtTimestamps(){assert.fail('Cancelled initialization must not decode');}});
 await assert.rejects(pending,{name:'AbortError'});
 assert.equal(reports,0);assert.equal(f.session.busy,0);f.provider.close();
});

test('first-picture timing is distinct from finishing a multi-frame decode batch', async () => {
 const f=fixture();f.session.busy=0;
 let finishSecond!:()=>void,secondStarted!:()=>void,received=0;
 const waiting=new Promise<void>(resolve=>{secondStarted=resolve;});
 let row:import('../gpu-preview/browser-frame-provider').GpuVideoDecodeTiming|undefined;
 (f.session as any).samples={bytes:4,interval:(sample:any)=>decodedSampleInterval(sample.timestamp,sample.duration),close(){},async read(timeUs:number){
  if(timeUs>0)await new Promise<void>(done=>{finishSecond=done;secondStarted();});
  return {timestamp:timeUs/1e6,duration:1/30,close(){},toVideoFrame(){return {codedWidth:1,codedHeight:1,close(){}};}};
 }};
 f.state.sessions.delete('occupied');f.state.sessions.set(source.key,f.session);
 const pending=f.provider.decode(source,[0,33333],new AbortController().signal,frame=>{received++;frame.release();},value=>{row=value;});
 await Promise.race([waiting,pending]);
 assert.equal(received,1);assert.equal(row,undefined);
 finishSecond();await pending;
 assert.equal(received,2);
 const result=row as import('../gpu-preview/browser-frame-provider').GpuVideoDecodeTiming|undefined;
 assert.ok(result&&result.firstFrameMs!==null&&result.firstFrameMs>=0&&result.firstFrameMs<=result.decodeMs);
 f.provider.close();
});

function retainedFixture(limit=2){
 const provider=new BrowserFrameProvider(1,'no-preference','sequential',limit);
 const state=provider as unknown as {sessions:Map<string,any>;retained:Map<string,any>;tick:number};
 const make=(key:string)=>{let disposed=0;const source={key,url:`/${key}.mp4`,validationUrl:`/${key}.mp4`};const session={source,busy:0,used:++state.tick,tail:Promise.resolve(),input:{dispose(){disposed++;}},sink:Promise.resolve({async *samplesAtTimestamps(){}})};return {source,session,get disposed(){return disposed;}};};
 const a=make('a'),b=make('b');state.sessions.set('a',a.session);state.retained.set('b',b.session);
 return {provider,state,a,b,make};
}
test('retained source reuse waits for retirement and protects the requested entry from eviction',async()=>{
 const f=retainedFixture();let finish!:()=>void;const timings:any[]=[];
 (f.a.session as any).samples={bytes:4,close(){return new Promise<void>(resolve=>{finish=resolve;});}};
 const pending=f.provider.decode(f.b.source,[],new AbortController().signal,()=>assert.fail(),row=>timings.push(row));
 await Promise.resolve();assert.equal(f.state.sessions.size,1);assert.equal(f.state.sessions.has('b'),false);
 finish();await pending;
 assert.equal(f.state.sessions.get('b'),f.b.session);assert.equal(f.state.retained.get('a'),f.a.session);
 assert.equal((f.a.session as any).samples,undefined);assert.equal(timings[0].sessionReused,true);
 assert.equal(f.provider.encodedCacheBudgetBytes,8*1024*1024);
 f.provider.close();assert.equal(f.a.disposed,1);assert.equal(f.b.disposed,1);assert.equal(f.provider.encodedCacheBudgetBytes,0);
});
test('cancelled retained-source acquisition cannot revive after cleanup finishes',async()=>{
 const f=retainedFixture();let finish!:()=>void;
 (f.a.session as any).samples={close(){return new Promise<void>(resolve=>{finish=resolve;});}};
 const abort=new AbortController(),pending=f.provider.decode(f.b.source,[],abort.signal,()=>assert.fail());
 abort.abort();await assert.rejects(pending,{name:'AbortError'});
 finish();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.state.sessions.size,0);assert.ok(f.state.retained.size<=f.provider.maxRetainedSources);
 f.provider.close();assert.equal(f.a.disposed,1);assert.equal(f.b.disposed,1);
});
test('provider close during retirement cannot resurrect cached source state',async()=>{
 const f=retainedFixture();let finish!:()=>void;
 (f.a.session as any).samples={close(){return new Promise<void>(resolve=>{finish=resolve;});}};
 const pending=f.provider.decode(f.b.source,[],new AbortController().signal,()=>assert.fail());
 // close() can call the reader twice, as a real reader's close is idempotent.
 const done=finish;(f.a.session as any).samples.close=()=>Promise.resolve();
 f.provider.close();await assert.rejects(pending,/closed/);done();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.state.sessions.size,0);assert.equal(f.state.retained.size,0);assert.equal(f.a.disposed,1);assert.equal(f.b.disposed,1);
});
test('retained source identity and cleanup failures fail closed',async()=>{
 const f=retainedFixture();(f.a.session as any).samples={async close(){throw Error('retirement failed');}};
 await assert.rejects(f.provider.decode(f.b.source,[],new AbortController().signal,()=>assert.fail()),/retirement failed/);
 assert.equal(f.state.sessions.size,0);assert.equal(f.a.disposed,1);f.provider.close();
 const g=retainedFixture();g.state.sessions.delete('a');
 await assert.rejects(g.provider.decode({...g.b.source,url:'/changed.mp4',validationUrl:'/changed.mp4'},[],new AbortController().signal,()=>assert.fail()),/identity reused/);
 g.a.session.input.dispose();g.provider.close();
});

test('retained cache evicts bounded old state without evicting the requested source',async()=>{
 const f=retainedFixture(1);
 await f.provider.decode(f.b.source,[],new AbortController().signal,()=>assert.fail());
 assert.equal(f.state.sessions.get('b'),f.b.session);assert.equal(f.a.disposed,1);
 assert.equal(f.state.retained.size,0);f.provider.close();assert.equal(f.b.disposed,1);
});

test('a request for the source currently retiring waits rather than reusing its closing stream',async()=>{
 const f=retainedFixture();let finish!:()=>void,reports=0;
 (f.a.session as any).samples={close(){return new Promise<void>(resolve=>{finish=resolve;});}};
 const b=f.provider.decode(f.b.source,[],new AbortController().signal,()=>assert.fail(),()=>{reports++;});
 const a=f.provider.decode(f.a.source,[],new AbortController().signal,()=>assert.fail(),()=>{reports++;});
 await Promise.resolve();assert.equal(reports,0);assert.equal(f.a.session.busy,1);
 finish();await Promise.all([a,b]);assert.equal(reports,2);f.provider.close();
 assert.equal(f.a.disposed,1);assert.equal(f.b.disposed,1);
});


test('reuse telemetry does not count a retained session evicted during capacity wait',async()=>{
 const f=fixture();
 const cached={...f.session,input:{dispose(){}}};
 f.state.retained.set(source.key,cached);
 let timing:import('../gpu-preview/browser-frame-provider').GpuVideoDecodeTiming|undefined;
 const pending=f.provider.decode(source,[],new AbortController().signal,()=>assert.fail(),row=>{timing=row;});
 assert.equal(f.state.capacityWaiters.size,1);
 // Another request can retire a source and evict this entry before admission.
 f.state.retained.delete(source.key);cached.input.dispose();
 f.session.busy=0;f.state.notifyCapacity();await pending;
 assert.ok(timing);assert.equal(timing.sessionReused,false);
 f.provider.close();
});

test('layered preview retains eight forward streams across successive lookahead batches',async()=>{
 const {GPU_PREVIEW_SOURCE_LIMIT}=await import('../gpu-preview/browser-frame-provider');
 const provider=new BrowserFrameProvider(GPU_PREVIEW_SOURCE_LIMIT);
 const state=provider as unknown as {sessions:Map<string,any>};
 let retired=0,disposed=0;
 const sources=Array.from({length:8},(_,index)=>({key:`layer-${index}`,url:`/${index}.webm`,validationUrl:`/${index}.webm`}));
 for(const source of sources)state.sessions.set(source.key,{
  source,busy:0,used:0,tail:Promise.resolve(),input:{dispose(){disposed++;}},sink:Promise.resolve({}),
  samples:{bytes:4,interval:(sample:any)=>decodedSampleInterval(sample.timestamp,sample.duration),async close(){retired++;},async read(timeUs:number){return {
   timestamp:timeUs/1e6,duration:1/30,close(){},toVideoFrame(){return {codedWidth:1,codedHeight:1,close(){}};},
  };}},
 });
 try{
  for(const time of [0,33333,66667])await Promise.all(sources.map(source=>provider.decode(source,[time],new AbortController().signal,frame=>frame.release())));
  assert.equal(retired,0,'No live layer may lose its forward decoder between batches');
  assert.equal(state.sessions.size,8);
 }finally{provider.close();}
 assert.equal(retired,8);assert.equal(disposed,8);
});
