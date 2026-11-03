import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {cubeLutRgbaBytes,type ParsedCubeLut} from '../timeline/cube-lut';
import {GpuLutTextures} from '../gpu-preview/lut-textures';
const parsed:ParsedCubeLut={title:null,size:2,domainMin:[-.1,0,.2],domainMax:[1,1,1.2],data:Array.from({length:24},(_,i)=>(i%3)*.25)};
function device(t:TestContext){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'GPUTextureUsage');
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'GPUTextureUsage',previous);else Reflect.deleteProperty(globalThis,'GPUTextureUsage');});
 (globalThis as any).GPUTextureUsage={TEXTURE_BINDING:1,COPY_DST:2};
 const allocations:Array<{destroyed:number;descriptor:any}>=[],uploads:any[]=[];
 return {allocations,uploads,createTexture(descriptor:any){const record={destroyed:0,descriptor};allocations.push(record);return {destroy(){record.destroyed++;}} as GPUTexture;},queue:{writeTexture(...args:any[]){uploads.push(args);}}};
}
test('LUT upload shares exact RGBA8 quantization and cube ordering with Standard',()=>{
 const bytes=cubeLutRgbaBytes(parsed);assert.equal(bytes.length,32);
 assert.deepEqual([...bytes.slice(0,8)],[0,64,128,255,0,64,128,255]);
 const ordered=Array.from({length:24},(_,i)=>i/23);
 const packed=cubeLutRgbaBytes({...parsed,data:ordered});
 assert.deepEqual([...packed].filter((_,i)=>i%4!==3),ordered.map(value=>Math.round(value*255)));
 assert.throws(()=>cubeLutRgbaBytes({...parsed,size:65}),/dimensions/);
 assert.throws(()=>cubeLutRgbaBytes({...parsed,data:[NaN,...parsed.data.slice(1)]}),/value/);
});
test('GPU LUT cache reuses content identity, keeps leased textures, and stays byte bounded',t=>{
 const gpu=device(t),cache=new GpuLutTextures(gpu as any,32);
 const first=cache.acquire('content-a',parsed),same=cache.acquire('content-a',parsed);
 assert.equal(first.frame.value.texture,same.frame.value.texture);assert.equal(gpu.uploads.length,1);
 assert.equal(gpu.allocations[0].descriptor.dimension,'3d');assert.deepEqual(gpu.uploads[0][2],{bytesPerRow:8,rowsPerImage:2});
 assert.deepEqual(first.frame.value.domainMin,parsed.domainMin);assert.equal(cache.bytes,32);
 assert.throws(()=>cache.acquire('content-b',parsed),/fully leased/);assert.equal(gpu.allocations.length,1);
 first.release();same.release();const second=cache.acquire('content-b',parsed);assert.equal(gpu.allocations[0].destroyed,1);
 cache.close();assert.equal(cache.bytes,32);second.release();assert.equal(cache.bytes,0);
 cache.close();assert.ok(gpu.allocations.every(a=>a.destroyed===1));assert.throws(()=>cache.acquire('new',parsed),/closed/);
});
test('GPU LUT failed uploads release allocation and can be retried',t=>{
 const gpu=device(t),cache=new GpuLutTextures(gpu as any);const write=gpu.queue.writeTexture;
 gpu.queue.writeTexture=()=>{throw Error('upload failed');};
 assert.throws(()=>cache.acquire('a',parsed),/upload failed/);assert.equal(cache.bytes,0);assert.equal(gpu.allocations[0].destroyed,1);
 gpu.queue.writeTexture=write;const lease=cache.acquire('a',parsed);lease.release();cache.close();assert.equal(gpu.allocations[1].destroyed,1);
});

test('portable LUTs retain packed bytes without WebGPU allocation and preserve bounded leases',t=>{
 const gpu=device(t),cache=new GpuLutTextures(gpu as any,32,true);
 const first=cache.acquire('portable',parsed),same=cache.acquire('portable',parsed);
 assert.equal(gpu.allocations.length,0);assert.equal(gpu.uploads.length,0);
 assert.equal(first.frame.value.texture,undefined);assert.equal(first.frame.value.rgba,same.frame.value.rgba);
 assert.deepEqual(first.frame.value.rgba,cubeLutRgbaBytes(parsed));assert.equal(cache.bytes,32);
 assert.throws(()=>cache.acquire('other',parsed),/fully leased/);
 const spread={...first.frame.value};assert.equal(spread.rgba,first.frame.value.rgba);
 cache.close();first.release();assert.equal(cache.bytes,32);same.release();assert.equal(cache.bytes,0);
});
