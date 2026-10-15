import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuCaptionImages,captionImageDimensions} from '../gpu-preview/caption-images';

async function withImages(run:(setFetch:(fn:typeof fetch)=>void,closed:()=>number)=>Promise<void>){
 const originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap;let closes=0;
 globalThis.createImageBitmap=(async()=>({width:2,height:2,close(){closes++;}})) as typeof createImageBitmap;
 try{await run(fn=>{globalThis.fetch=fn;},()=>closes);}finally{globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;}
}
const png=(width=2,height=2)=>{const data=new Uint8Array(33);data.set([137,80,78,71,13,10,26,10]);const view=new DataView(data.buffer);view.setUint32(8,13);view.setUint32(12,0x49484452);view.setUint32(16,width);view.setUint32(20,height);return data;};
const response=()=>new Response(png(),{headers:{'content-type':'image/png'}});

test('caption images deduplicate requests, retain self-contained bytes and release pinned entries on close',async()=>withImages(async(setFetch,closed)=>{
 let calls=0;setFetch(async()=>{calls++;return response();});const cache=new GpuCaptionImages();
 const [a,b]=await Promise.all([cache.acquire('/one.png',new AbortController().signal),cache.acquire('/one.png',new AbortController().signal)]);
 assert.equal(calls,1);assert.equal(closed(),1);assert.equal(a.frame.value,`data:image/png;base64,${btoa(String.fromCharCode(...png()))}`);
 assert.equal(cache.bytes,a.frame.value.length*2);cache.close();assert.ok(cache.bytes>0);
 a.release();assert.ok(cache.bytes>0);b.release();assert.equal(cache.bytes,0);
 await assert.rejects(cache.acquire('/one.png',new AbortController().signal));
}));

test('caption image body cap applies to streamed responses without a content length',async()=>withImages(async(setFetch,closed)=>{
 let cancelled=false;
 setFetch(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(3));controller.enqueue(new Uint8Array(3));},cancel(){cancelled=true;}}),{headers:{'content-type':'image/png'}}));
 const cache=new GpuCaptionImages(1000,4);
 await assert.rejects(cache.acquire('/large.png',new AbortController().signal),/encoded budget/);
 assert.equal(cancelled,true);assert.equal(closed(),0);assert.equal(cache.bytes,0);cache.close();
}));

test('caption images reject nested-resource formats and never evict a pinned image to meet the budget',async()=>withImages(async(setFetch)=>{
 setFetch(async()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}));const cache=new GpuCaptionImages(180);
 await assert.rejects(cache.acquire('/external.svg',new AbortController().signal),/unsupported format/);
 setFetch(async()=>response());const first=await cache.acquire('/one.png',new AbortController().signal);
 await assert.rejects(cache.acquire('/two.png',new AbortController().signal),/cache budget/);
 assert.equal(cache.bytes,first.frame.bytes);first.release();const second=await cache.acquire('/two.png',new AbortController().signal);
 second.release();cache.close();assert.equal(cache.bytes,0);
}));

test('closing a caption image session cancels active requests and drains queued work under the two-fetch limit',async()=>withImages(async(setFetch)=>{
 let active=0,maximum=0,calls=0;
 setFetch(async(_url,options)=>{calls++;active++;maximum=Math.max(maximum,active);try{return await new Promise<Response>((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}finally{active--;}});
 const cache=new GpuCaptionImages();const requests=Promise.allSettled([1,2,3,4].map(i=>cache.acquire(`/${i}.png`,new AbortController().signal)));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,2);cache.close();
 const results=await requests;assert.ok(results.every(result=>result.status==='rejected'));assert.equal(maximum,2);assert.equal(active,0);assert.equal(calls,2);assert.equal(cache.bytes,0);
}));


test('oversized decoded caption images are closed without entering the cache',async()=>withImages(async(setFetch)=>{
 let closes=0;globalThis.createImageBitmap=(async()=>({width:4096,height:4096,close(){closes++;}})) as typeof createImageBitmap;
 setFetch(async()=>response());const cache=new GpuCaptionImages();
 await assert.rejects(cache.acquire('/huge.png',new AbortController().signal),/decoded budget/);
 assert.equal(closes,1);assert.equal(cache.bytes,0);cache.close();
}));

test('cancelling one waiter does not poison a shared immutable image request',async()=>withImages(async(setFetch)=>{
 let resolve!:(r:Response)=>void;setFetch(()=>new Promise<Response>(r=>{resolve=r;}));
 const cache=new GpuCaptionImages(),cancelled=new AbortController();
 const first=cache.acquire('/shared.png',cancelled.signal);const failure=assert.rejects(first);
 const second=cache.acquire('/shared.png',new AbortController().signal);cancelled.abort();resolve(response());
 await failure;const lease=await second;assert.ok(lease.frame.value.startsWith('data:image/png;'));
 lease.release();cache.close();assert.equal(cache.bytes,0);
}));


test('oversized headers fail before browser decoding and animated PNG cannot become a frozen fill',async()=>withImages(async(setFetch,closed)=>{
 setFetch(async()=>new Response(png(10000,10000),{headers:{'content-type':'image/png'}}));const cache=new GpuCaptionImages();
 await assert.rejects(cache.acquire('/huge.png',new AbortController().signal),/decoded budget/);assert.equal(closed(),0);cache.close();
 const animated=new Uint8Array(45);animated.set(png());new DataView(animated.buffer).setUint32(37,0x6163544c);
 assert.throws(()=>captionImageDimensions(animated,'image/png'),/Animated/);
 const jpeg=new Uint8Array([255,216,255,194,0,8,8,0,20,0,30,1]);
 assert.deepEqual(captionImageDimensions(jpeg,'image/jpeg'),{width:30,height:20});
 assert.throws(()=>captionImageDimensions(jpeg.subarray(0,9),'image/jpeg'),/valid PNG or JPEG/);
}));

test('caption image fetches have a deadline even while the session remains open',async()=>withImages(async(setFetch)=>{
 setFetch(async(_url,options)=>new Promise<Response>((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>reject(options!.signal!.reason),{once:true})));
 const cache=new GpuCaptionImages(1024,1024,5);
 const failure=assert.rejects(cache.acquire('/stalled.png',new AbortController().signal),/timeout/i);
 // Keep the fake network request alive until it settles, as a real fetch
 // would, with a hard failure
 // deadline so a missing production timeout cannot pass or hang this test.
 let watchdog:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([failure,new Promise<never>((_resolve,reject)=>{
  watchdog=setTimeout(()=>reject(Error('Caption image timeout did not fire')),1000);
 })]);}finally{clearTimeout(watchdog);cache.close();}
 assert.equal(cache.bytes,0);
}));
