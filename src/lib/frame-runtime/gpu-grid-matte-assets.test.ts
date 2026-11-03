import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuGridMatteAssets} from '../gpu-preview/grid-matte-assets';
import {canvasKitGridMattePlan} from '../gpu-preview/canvaskit-grid-matte';
const props={grid_matte_cell_size:360,grid_matte_mask:{source_url:'/api/projects/test/media/masks',source_start_seconds:0,fps:1,frame_count:5,width:3,height:1,source_sha256:'0'.repeat(64)}};
const plan=(t=0)=>canvasKitGridMattePlan(props,t,30,10)!;
const pixels=(url:string)=>({url,width:3,height:1,data:new Uint8ClampedArray(12).fill(255)});
test('grid assets coalesce exact frame requests, preserve pinned leases, bound bytes',async()=>{
 let loads=0;const assets=new GpuGridMatteAssets('scope',12,1024,async url=>{loads++;return pixels(url);});
 const signal=new AbortController().signal;
 const [a,b]=await Promise.all([assets.acquire(plan(),signal),assets.acquire(plan(),signal)]);
 assert.equal(loads,1);assert.equal(assets.bytes,12);assert.equal(a.frame.value,b.frame.value);
 await assert.rejects(assets.acquire(plan(1),signal),/budget/);
 a.release();b.release();const next=await assets.acquire(plan(1),signal);assert.equal(loads,3);
 assets.close();assert.equal(assets.bytes,12,'Closing must preserve active submission lease');next.release();assert.equal(assets.bytes,0);
});
test('failed or mismatched mask frames never publish; retry can recover',async()=>{
 let loads=0;const assets=new GpuGridMatteAssets('scope',100,1024,async url=>{loads++;return pixels(loads===1?'wrong':url);});
 await assert.rejects(assets.acquire(plan(),new AbortController().signal),/mismatch/);assert.equal(assets.bytes,0);
 const lease=await assets.acquire(plan(),new AbortController().signal);assert.equal(loads,2);lease.release();assets.close();
});
test('close aborts in-flight mask preparation and cancelled seekers never acquire leases',async()=>{
 let finish!:(value:ReturnType<typeof pixels>)=>void;let seen:AbortSignal|undefined;
 const assets=new GpuGridMatteAssets('scope',100,1024,(url,signal)=>{seen=signal;return new Promise(resolve=>{finish=resolve;});});
 const controller=new AbortController(),pending=assets.acquire(plan(),controller.signal);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(assets.bytes,1024);controller.abort();await assert.rejects(pending);
 assets.close();assert.equal(seen?.aborted,true);finish(pixels(plan().url));await new Promise(resolve=>setImmediate(resolve));assert.equal(assets.bytes,0);
 await assert.rejects(assets.acquire(plan(),new AbortController().signal));
});
test('subject window assets skip superseded requests and re-derive settings from one decoded frame',async()=>{
 const {GpuSubjectWindowAssets}=await import('../gpu-preview/grid-matte-assets');
 let loads=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const assets=new GpuSubjectWindowAssets('scope',1<<20,1<<20,async url=>{loads++;await gate;return {url,width:4,height:2,data:new Uint8ClampedArray(32).fill(255)};});
 const window=(feather:number)=>({url:'/api/projects/t/media/grid-mattes/c/00000.png',width:8,height:4,gridWidth:4,gridHeight:2,rect:{x:0,y:0,width:8,height:4},crop:{x:0,y:0,width:8,height:4},mode:'inside' as const,feather,expand:0,strength:1});
 const first=assets.acquire(window(0),new AbortController().signal);
 // Slider samples that are abandoned before their turn never decode.
 const stale=new AbortController(),skipped=assets.acquire(window(2),stale.signal);stale.abort();
 release();const lease=await first;await assert.rejects(skipped);
 const settled=await assets.acquire(window(4),new AbortController().signal);
 assert.equal(loads,1,'one decoded frame serves every setting at that time');
 assert.equal(settled.frame.value.alpha.length,8);lease.release();settled.release();assets.close();
});
