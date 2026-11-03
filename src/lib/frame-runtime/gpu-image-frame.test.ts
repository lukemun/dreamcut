import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeGpuImage} from '../gpu-preview/image-frame';

test('image decode preserves alpha, transfers frame ownership and closes temporary bitmap',async()=>{
 const original={fetch:globalThis.fetch,bitmap:globalThis.createImageBitmap,frame:globalThis.VideoFrame};
 let bitmapClosed=0,frameClosed=0;
 const bitmap={width:16,height:8,close(){bitmapClosed++;}} as ImageBitmap;
 globalThis.fetch=async()=>new Response(new Blob(['fixture'],{type:'image/png'}));
 globalThis.createImageBitmap=(async()=>bitmap) as typeof createImageBitmap;
 globalThis.VideoFrame=class {constructor(_bitmap:unknown,options:VideoFrameInit){assert.equal(options.alpha,'keep');}close(){frameClosed++;}} as unknown as typeof VideoFrame;
 try{
  const source={key:'image',url:'/photo.png',validationUrl:'/photo.png',kind:'image' as const};
  const result=await decodeGpuImage(source,new AbortController().signal);
  assert.deepEqual(Object.keys(result.decodeTiming).sort(),["bitmapMs","fetchMs","frameMs"]);
  assert.ok(Object.values(result.decodeTiming).every(value=>Number.isFinite(value)&&value>=0));
  assert.equal(result.bytes,512);assert.equal(result.timestampUs,0);assert.equal(result.durationUs,1);
  assert.equal(bitmapClosed,1);assert.equal(frameClosed,0);result.release();assert.equal(frameClosed,1);
  const controller=new AbortController();
  globalThis.createImageBitmap=(async()=>{controller.abort();return bitmap;}) as typeof createImageBitmap;
  await assert.rejects(decodeGpuImage(source,controller.signal),{name:'AbortError'});
  assert.equal(bitmapClosed,2);assert.equal(frameClosed,1);
 }finally{globalThis.fetch=original.fetch;globalThis.createImageBitmap=original.bitmap;globalThis.VideoFrame=original.frame;}
});

test('encoded image cache reuses immutable source identities within a byte-bounded LRU',async()=>{
 const {GpuImageBlobCache}=await import('../gpu-preview/image-frame');
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(new Blob(['1234']));};
 const source=(key:string)=>({key,url:`/${key}`,validationUrl:`/${key}`});
 const signal=new AbortController().signal,cache=new GpuImageBlobCache(8);
 try{
  const first=await cache.load(source('a'),signal);await cache.load(source('b'),signal);
  assert.equal(await cache.load(source('a'),signal),first);assert.equal(calls,2);
  await cache.load(source('c'),signal);assert.equal(cache.bytes,8);
  await cache.load(source('b'),signal);assert.equal(calls,4);assert.equal(cache.bytes,8);
  cache.close();assert.equal(cache.bytes,0);await assert.rejects(cache.load(source('a'),signal),/closed/);
 }finally{globalThis.fetch=original;}
});

test('cancelled or late image loads cannot refill a closed cache',async()=>{
 const {GpuImageBlobCache}=await import('../gpu-preview/image-frame');
 const original=globalThis.fetch,source={key:'a',url:'/a',validationUrl:'/a'};
 try{
  for(const cancel of [true,false]){
   const cache=new GpuImageBlobCache(8),controller=new AbortController();
   let finish!:(response:Response)=>void;
   globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
   const pending=cache.load(source,controller.signal);
   if(cancel)controller.abort();else cache.close();
   finish(new Response(new Blob(['1234'])));await assert.rejects(pending);assert.equal(cache.bytes,0);
  }
 }finally{globalThis.fetch=original;}
});
