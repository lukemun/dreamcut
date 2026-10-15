import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {GpuLutAssets} from '../gpu-preview/lut-assets';
import {MAX_CUBE_LUT_BYTES} from '../timeline/cube-lut';
const cube='LUT_3D_SIZE 2\n'+Array(8).fill('0 0.5 1').join('\n');
const lut={assetId:'a'.repeat(64),sourceUrl:'/api/projects/test/media/a.cube',intensity:1};
function fixture(t:TestContext){
 const fetch=globalThis.fetch,usage=Object.getOwnPropertyDescriptor(globalThis,'GPUTextureUsage');
 t.after(()=>{globalThis.fetch=fetch;if(usage)Object.defineProperty(globalThis,'GPUTextureUsage',usage);else Reflect.deleteProperty(globalThis,'GPUTextureUsage');});
 (globalThis as any).GPUTextureUsage={TEXTURE_BINDING:1,COPY_DST:2};let allocations=0,destroyed=0;
 const cache=new GpuLutAssets({createTexture(){allocations++;return {destroy(){destroyed++;}};},queue:{writeTexture(){}}} as any,'snapshot');
 t.after(()=>cache.close());return {cache,get allocations(){return allocations;},get destroyed(){return destroyed;}};
}
test('LUT loading is shared across seekers and animated intensity reuses the texture',async t=>{
 const f=fixture(t);let calls=0;globalThis.fetch=async()=>{calls++;return new Response(cube);};
 const [a,b]=await Promise.all([f.cache.acquire(lut,new AbortController().signal),f.cache.acquire({...lut,intensity:.3},new AbortController().signal)]);
 assert.equal(calls,1);assert.equal(f.allocations,1);assert.equal(a.frame.value.texture,b.frame.value.texture);
 a.release();b.release();f.cache.close();assert.equal(f.destroyed,1);assert.equal(f.cache.bytes,0);
});
test('cancelling one seeker preserves a shared load and close releases waiting callers',async t=>{
 const f=fixture(t);let resolve!:(r:Response)=>void;globalThis.fetch=()=>new Promise(done=>{resolve=done;});
 const controller=new AbortController();const cancelled=f.cache.acquire(lut,controller.signal);
 const retained=f.cache.acquire(lut,new AbortController().signal);await Promise.resolve();controller.abort();
 await assert.rejects(cancelled,{name:'AbortError'});resolve(new Response(cube));const lease=await retained;lease.release();
 const pending=f.cache.acquire({...lut,assetId:'b'.repeat(64)},new AbortController().signal);await Promise.resolve();f.cache.close();
 await assert.rejects(pending,{name:'AbortError'});resolve(new Response(cube));await Promise.resolve();assert.equal(f.allocations,1);
});
test('oversized and invalid LUT responses fail before GPU allocation and retries remain possible',async t=>{
 const f=fixture(t);globalThis.fetch=async()=>new Response(new Uint8Array(MAX_CUBE_LUT_BYTES+1));
 await assert.rejects(f.cache.acquire(lut,new AbortController().signal),/encoded resource budget/);assert.equal(f.allocations,0);
 globalThis.fetch=async()=>new Response('invalid');await assert.rejects(f.cache.acquire(lut,new AbortController().signal));assert.equal(f.allocations,0);
 globalThis.fetch=async()=>new Response(cube);const lease=await f.cache.acquire(lut,new AbortController().signal);lease.release();assert.equal(f.allocations,1);
});
test('distinct LUT requests serialize fetches and closing releases all GPU leases',async t=>{
 const f=fixture(t);let calls=0,resolve!:(r:Response)=>void;
 globalThis.fetch=()=>{calls++;return new Promise(done=>{resolve=done;});};
 const first=f.cache.acquire(lut,new AbortController().signal);
 const second=f.cache.acquire({...lut,assetId:'b'.repeat(64)},new AbortController().signal);
 await Promise.resolve();assert.equal(calls,1);resolve(new Response(cube));const a=await first;
 for(let i=0;i<10&&calls<2;i++)await Promise.resolve();
 assert.equal(calls,2);resolve(new Response(cube));const b=await second;
 assert.equal(f.allocations,2);f.cache.close();assert.equal(f.destroyed,0);
 a.release();b.release();assert.equal(f.destroyed,2);assert.equal(f.cache.bytes,0);
});
