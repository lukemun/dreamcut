import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuImageBlobCache} from '../gpu-preview/image-frame';
import {GpuPreviewRuntime} from '../gpu-preview/runtime';
import {GpuFrameController} from '../gpu-preview/frame-controller';
import {FrameStore} from '../gpu-preview/frame-store';
import {FrameLookahead} from '../gpu-preview/lookahead';

function fixture(ready:Promise<void>=Promise.resolve()){
 const lookahead=new FrameLookahead(),imageLookahead=new FrameLookahead(),resourceAbort=new AbortController();
 const sceneCache=new Map(),closed:string[]=[];
 const imageBlobs=new GpuImageBlobCache();
 const closeImages=imageBlobs.close.bind(imageBlobs);imageBlobs.close=()=>{closed.push('images');closeImages();};
 const runtime=Object.assign(Object.create(GpuPreviewRuntime.prototype),{elements:[],fps:30,
  recentLookaheadDecodes:[],elements:[],laneOrder:[],width:320,height:320,fps:30,scope:'test',sceneCache,
  frames:new GpuFrameController(new FrameStore<VideoFrame>(100)),closed:false,
  decodeAbort:new AbortController(),lookahead,imageLookahead,resourceAbort,
  imageBlobs,captionMasks:{close(){closed.push('caption-masks');}},gridAssets:{close(){closed.push('grid');}},windowAssets:{close(){closed.push('window');}},windowPrefetches:new Map(),lutAssets:{close(){closed.push('lut');}},provider:{close(){closed.push('provider');}},text:{close(){closed.push('text');}},
  compositor:{ready,draw(){},close(){closed.push('compositor');}},
 }) as GpuPreviewRuntime;
 return {runtime,lookahead,imageLookahead,resourceAbort,sceneCache,closed};
}
test('evaluated lookahead scenes are shared with presentation and bounded across long cuts',()=>{
 const f=fixture(),first=f.runtime.scene(0);
 assert.equal(f.runtime.scene(0),first);
 for(let frame=1;frame<1000;frame++)f.runtime.scene(frame);
 assert.equal(f.sceneCache.size,64);assert.equal(f.sceneCache.has(0),false);
 const prior=f.runtime.scene(999);
 f.runtime.updateScene([],[]);
 assert.equal(f.sceneCache.size,0);assert.notEqual(f.runtime.scene(999),prior);
 f.runtime.close();assert.equal(f.sceneCache.size,0);
});
test('pipeline readiness cannot publish an old seek or a closed session',async()=>{
 let resolve!:()=>void;const ready=new Promise<void>(done=>{resolve=done;});
 const f=fixture(ready);
 const old=f.runtime.present(0,'old');
 const oldRejected=assert.rejects(old);
 const current=f.runtime.present(12,'new');
 assert.equal(f.runtime.lastPresentation,undefined);
 resolve();await oldRejected;assert.equal(await current,true);
 assert.equal(f.runtime.lastPresentation?.frame,12);f.runtime.close();
 let finish!:()=>void;const closing=fixture(new Promise<void>(done=>{finish=done;}));
 const pending=closing.runtime.present(0,'closing');const rejected=assert.rejects(pending);
 closing.runtime.close();finish();await rejected;
 assert.equal(closing.runtime.lastPresentation,undefined);
});
test('shader compilation rejection remains a foreground failure',async()=>{
 const f=fixture(Promise.reject(Error('shader compilation failed')));
 await assert.rejects(f.runtime.present(0,'first'),/shader compilation failed/);
 assert.equal(f.runtime.lastPresentation,undefined);f.runtime.close();
});
test('Play at the displayed frame preserves lookahead; a position change cancels it',async()=>{
 const f=fixture();await f.runtime.present(0,'paused');
 let finish!:()=>void;const work=new Promise<void>(resolve=>{finish=resolve;});
 for(const queue of [f.lookahead,f.imageLookahead])queue.start(new Map([['future',[10]]]),async()=>work);
 await f.runtime.present(0,'playing');
 assert.equal(f.lookahead.has('future',10),true);assert.equal(f.imageLookahead.has('future',10),true);
 await f.runtime.present(20,'seek');
 assert.equal(f.lookahead.active,false);assert.equal(f.imageLookahead.active,false);
 finish();f.runtime.close();
});
test('seeking cancels both speculative media queues and closing is idempotent',async()=>{
 const f=fixture();let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 for(const queue of [f.lookahead,f.imageLookahead])queue.start(new Map([['source',[0]]]),async()=>pending);
 const waits=[f.lookahead,f.imageLookahead].map(queue=>queue.wait('source',0,new AbortController().signal));
 assert.equal(await f.runtime.present(10,'seek'),true);
 assert.deepEqual(await Promise.all(waits),[false,false]);assert.equal(f.resourceAbort.signal.aborted,true);
 release();f.runtime.close();f.runtime.close();
 assert.deepEqual(f.closed,['provider','lut','grid','window','caption-masks','images','text','compositor']);
 await assert.rejects(f.runtime.present(0,'closed'),/closed/);
});

test('finished image lookahead immediately admits the next rapid still cut',async()=>{
 const original={fetch:globalThis.fetch,bitmap:globalThis.createImageBitmap,frame:globalThis.VideoFrame};
 const loaded:string[]=[];
 globalThis.fetch=async input=>{loaded.push(String(input));return new Response(new Blob(['image']));};
 globalThis.createImageBitmap=(async()=>({width:1,height:1,close(){}})) as typeof createImageBitmap;
 globalThis.VideoFrame=class{close(){}} as unknown as typeof VideoFrame;
 const f=fixture();
 const source=(key:string)=>({key,url:`/${key}.png`,validationUrl:`/${key}.png`,kind:'image'});
 Object.assign(f.runtime,{
  seekKey:'playing',lastResourceFrame:-Infinity,sourceBytes:new Map(),textPrefetches:new Map(),
  text:{fontIdentity:'test',isReady(){return true;},close(){}},
  scene(frame:number){return {layers:frame<2?[]:[{kind:'video',element:{id:frame<5?'first':'second'},source:source(frame<5?'first':'second'),timeUs:0}]};},
 });
 try{
  f.runtime.prefetch(0,'playing',12);
  await f.imageLookahead.wait('first',0,new AbortController().signal);
  // Let the queue release its completed job, then advance only one frame.
  await Promise.resolve();await Promise.resolve();
  f.runtime.prefetch(1,'playing',12);
  await f.imageLookahead.wait('second',0,new AbortController().signal);
  assert.deepEqual(loaded,['/first.png','/second.png']);
  assert.equal(f.runtime.frames.store.size,2);assert.equal(f.runtime.frames.store.bytes,8);
 }finally{f.runtime.close();globalThis.fetch=original.fetch;globalThis.createImageBitmap=original.bitmap;globalThis.VideoFrame=original.frame;}
});

test('LUT readiness holds the complete frame and a late LUT cannot publish an old seek',async()=>{
 const f=fixture();let finish!:(lease:any)=>void,released=0;
 Object.assign(f.runtime,{fps:30,lutAssets:{acquire:()=>new Promise(resolve=>{finish=resolve;}),close(){}}});
 const layer={kind:'video',element:{id:'image',timeline_start:0,duration:1,props:{lut_asset_id:'a'.repeat(64),lut_source_url:'/api/projects/test/media/look.cube'}},source:{key:'image'},timeUs:0};
 let layers:any[]=[layer];Object.assign(f.runtime,{scene:()=>({layers})});
 f.runtime.frames.cache({sourceKey:'image',timestampUs:0,durationUs:1,bytes:1,value:{} as VideoFrame,release(){}});
 const old=f.runtime.present(0,'old');const rejected=assert.rejects(old,{name:'AbortError'});
 await Promise.resolve();assert.equal(f.runtime.lastPresentation,undefined);
 layers=[];assert.equal(await f.runtime.present(1,'new'),true);
 finish({frame:{value:{}},release(){released++;}});await rejected;
 assert.equal(released,1);assert.equal(f.runtime.lastPresentation?.frame,1);f.runtime.close();
});

test('video-only lookahead can warm the next picture while current GPU readiness is pending',async()=>{
 let finish!:()=>void;
 const f=fixture(new Promise<void>(resolve=>{finish=resolve;}));
 let decodes=0;
 Object.assign(f.runtime,{
  sourceBytes:new Map(),lastResourceFrame:-Infinity,
  text:{get fontIdentity(){assert.fail('Early lookahead must not duplicate text/image preparation');},close(){}},
  scene(frame:number){return {layers:frame===0?[]:[
   {kind:'video',element:{id:'video'},source:{key:'next',estimatedFrameBytes:4},timeUs:33333},
   {kind:'video',element:{id:'image'},source:{key:'still',kind:'image'},timeUs:0},
  ]};},
  provider:{close(){},async decode(source:any,_times:any,_signal:any,receive:any){decodes++;receive({sourceKey:source.key,timestampUs:33333,durationUs:33333,bytes:4,value:{} as VideoFrame,release(){}});}},
 });
 try{
  const pending=f.runtime.present(0,'start');
  f.runtime.prefetch(0,'start',2,false);
  await f.lookahead.wait('next',33333,new AbortController().signal);
  assert.equal(decodes,1);
  assert.equal(f.runtime.frames.store.has('next',33333),true);
  assert.equal(f.runtime.lastPresentation,undefined,'Lookahead cannot display the next picture');
  assert.equal(f.imageLookahead.active,false);
  finish();assert.equal(await pending,true);
  assert.equal(f.runtime.lastPresentation?.frame,0);
 }finally{finish();f.runtime.close();}
});


test('startup image lookahead warms the next still before presentation without consuming text cadence',async()=>{
 const original={fetch:globalThis.fetch,bitmap:globalThis.createImageBitmap,frame:globalThis.VideoFrame};
 const loaded:string[]=[];
 globalThis.fetch=async input=>{loaded.push(String(input));return new Response(new Blob(['image']));};
 globalThis.createImageBitmap=(async()=>({width:1,height:1,close(){}})) as typeof createImageBitmap;
 globalThis.VideoFrame=class{close(){}} as unknown as typeof VideoFrame;
 let finish!:()=>void;
 const f=fixture(new Promise<void>(resolve=>{finish=resolve;}));
 const source=(key:string)=>({key,url:`/${key}.png`,validationUrl:`/${key}.png`,kind:'image'});
 Object.assign(f.runtime,{
  lastResourceFrame:-Infinity,sourceBytes:new Map(),textPrefetches:new Map(),
  text:{fontIdentity:'test',isReady(){assert.fail('Startup must not plan text');},close(){}},
  scene(frame:number){return {width:320,height:320,fps:30,frame,layers:[{kind:'video',element:{id:frame<2?'current':'future',props:{},timeline_start:0,duration:1},source:source(frame<2?'current':'future'),timeUs:0,transform:{scale:1,offsetX:0,offsetY:0},mask:{top:0,right:0,bottom:0,left:0},animation:{scale:1,translateX:0,translateY:0,rotateZDeg:0,blurPx:0,opacity:1},opacity:1}]};},
 });
 try{
  const pending=f.runtime.present(0,'start');
  f.runtime.prefetch(0,'start',8,'images');
  await f.imageLookahead.wait('future',0,new AbortController().signal);
  assert.equal(f.runtime.frames.store.has('future',0),true);
  assert.equal(f.runtime.lastPresentation,undefined);
  assert.equal((f.runtime as any).lastResourceFrame,-Infinity);
  finish();assert.equal(await pending,true);
  assert.deepEqual(loaded.sort(),['/current.png','/future.png']);
  assert.equal(f.runtime.lastPresentation?.frame,0);
 }finally{finish();f.runtime.close();globalThis.fetch=original.fetch;globalThis.createImageBitmap=original.bitmap;globalThis.VideoFrame=original.frame;}
});

test('grid matte readiness holds the frame and late masks cannot publish an old seek',async()=>{
 const f=fixture();let finish!:(lease:any)=>void,released=0;
 Object.assign(f.runtime,{gridAssets:{acquire:()=>new Promise(resolve=>{finish=resolve;}),close(){}}});
 const layer={kind:'video',element:{id:'grid',timeline_start:0,duration:1,props:{grid_matte_cell_size:360,grid_matte_mask:{source_url:'/api/projects/test/media/masks',source_start_seconds:0,fps:30,frame_count:30,width:100,height:100}}},source:{key:'grid'},timeUs:0,sourceTimeSeconds:0};
 let layers:any[]=[layer];Object.assign(f.runtime,{scene:()=>({layers})});
 f.runtime.frames.cache({sourceKey:'grid',timestampUs:0,durationUs:1,bytes:1,value:{} as VideoFrame,release(){}});
 const old=f.runtime.present(0,'old'),rejected=assert.rejects(old,{name:'AbortError'});
 await Promise.resolve();assert.equal(f.runtime.lastPresentation,undefined);
 layers=[];assert.equal(await f.runtime.present(1,'new'),true);
 finish({frame:{value:{}},release(){released++;}});await rejected;
 assert.equal(released,1);assert.equal(f.runtime.lastPresentation?.frame,1);f.runtime.close();
});

test('subject window readiness holds the frame and a late window cannot publish an old seek',async()=>{
 const f=fixture();let finish!:(lease:any)=>void,released=0;
 Object.assign(f.runtime,{windowAssets:{acquire:()=>new Promise(resolve=>{finish=resolve;}),close(){}}});
 const subjectWindow={url:'/api/projects/test/media/grid-mattes/cut/00000.png',width:320,height:320,gridWidth:160,gridHeight:160,rect:{x:0,y:0,width:320,height:320},crop:{x:0,y:0,width:320,height:320},mode:'inside',feather:0,expand:0,strength:1};
 const layer={kind:'video',element:{id:'fill',timeline_start:0,duration:1,props:{}},source:{key:'fill'},timeUs:0,sourceTimeSeconds:0,subjectWindow};
 let layers:any[]=[layer];Object.assign(f.runtime,{scene:()=>({layers})});
 f.runtime.frames.cache({sourceKey:'fill',timestampUs:0,durationUs:1,bytes:1,value:{} as VideoFrame,release(){}});
 const old=f.runtime.present(0,'old'),rejected=assert.rejects(old,{name:'AbortError'});
 await Promise.resolve();assert.equal(f.runtime.lastPresentation,undefined);
 layers=[];assert.equal(await f.runtime.present(1,'new'),true);
 finish({frame:{value:{}},release(){released++;}});await rejected;
 assert.equal(released,1);assert.equal(f.runtime.lastPresentation?.frame,1);f.runtime.close();
});

test('viewport mask dependency gates presentation and obsolete seeks release their mask',async()=>{
 const f=fixture();let finish!:(lease:any)=>void,released=0;
 Object.assign(f.runtime,{captionMasks:{acquire:()=>new Promise(resolve=>{finish=resolve;}),close(){}},text:{async acquire(){return {frame:{value:{}},release(){}};},close(){}}});
 let layers:any[]=[{kind:'caption',element:{id:'masked'},viewportMaskUrl:'/mask.png'}];Object.assign(f.runtime,{scene:()=>({layers})});
 const old=f.runtime.present(0,'old'),rejected=assert.rejects(old,{name:'AbortError'});
 await Promise.resolve();assert.equal(f.runtime.lastPresentation,undefined);layers=[];
 assert.equal(await f.runtime.present(1,'new'),true);finish({frame:{value:{}},release(){released++;}});await rejected;
 assert.equal(released,1);assert.equal(f.runtime.lastPresentation?.frame,1);f.runtime.close();
});

test('layered lookahead reserves half the frame store and admits only complete future pictures',async()=>{
 const f=fixture();const requests=new Map<string,readonly number[]>();
 f.runtime.frames.close();
 Object.assign(f.runtime,{
  frames:new GpuFrameController(new FrameStore<VideoFrame>(280)),
  seekKey:'playing',sourceBytes:new Map(),
  scene(frame:number){return {layers:Array.from({length:7},(_,i)=>({kind:'video',element:{id:`layer-${i}`},source:{key:`source-${i}`,estimatedFrameBytes:4},timeUs:frame*33333}))};},
  provider:{close(){},async decode(source:any,times:readonly number[]){requests.set(source.key,times);}},
 });
 f.runtime.prefetch(0,'playing',31,false);
 await Promise.resolve();await Promise.resolve();
 assert.equal(requests.size,7);
 for(const times of requests.values())assert.deepEqual(times,[33333,66666,99999,133332,166665]);
 assert.equal([...requests.values()].reduce((sum,times)=>sum+times.length*4,0),140);
 f.runtime.close();
});

test('dense layered lookahead warms an upcoming background before filling consecutive samples',()=>{
 const f=fixture(),requests=new Map<string,readonly number[]>();f.runtime.frames.close();
 Object.assign(f.runtime,{
  frames:new GpuFrameController(new FrameStore<VideoFrame>(280)),seekKey:'playing',sourceBytes:new Map(),
  scene(frame:number){return {layers:Array.from({length:frame<10?7:8},(_,i)=>({kind:'video',element:{id:`layer-${i}`},source:{key:`source-${i}`,estimatedFrameBytes:4},timeUs:frame*33333}))};},
  provider:{close(){},async decode(source:any,times:readonly number[]){requests.set(source.key,times);}},
 });
 f.runtime.prefetch(0,'playing',31,false);
 assert.deepEqual(requests.get('source-7'),[333330],'The entrance is warmed even beyond the dense consecutive-frame budget');
 assert.ok([...requests.values()].reduce((sum,times)=>sum+times.length*4,0)<=140);
 f.runtime.close();
});

test('a reversed foreground source is batched so one forward decode fills the next second',()=>{
 const f=fixture(),requests=new Map<string,readonly number[]>();f.runtime.frames.close();
 Object.assign(f.runtime,{
  frames:new GpuFrameController(new FrameStore<VideoFrame>(1000)),seekKey:'playing',sourceBytes:new Map(),lastResourceFrame:0,
  scene(frame:number){return {layers:[
   {kind:'video',element:{id:'reversed'},source:{key:'reversed',estimatedFrameBytes:4},timeUs:(90-frame)*33333},
   {kind:'video',element:{id:'forward'},source:{key:'forward',estimatedFrameBytes:4},timeUs:frame*33333},
  ]};},
  provider:{close(){},async decode(source:any,times:readonly number[]){requests.set(source.key,times);}},
 });
 f.runtime.prefetch(0,'playing',90,'entrances');
 assert.deepEqual(requests.get('reversed'),Array.from({length:30},(_,i)=>(89-i)*33333));
 assert.equal(requests.has('forward'),false,'Forward foreground sources keep sequential decoding');
 f.runtime.close();
});
