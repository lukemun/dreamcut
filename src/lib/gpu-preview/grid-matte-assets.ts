import {FrameStore,type FrameLease} from './frame-store';
import {canvasKitGridMattePixels,type CanvasKitGridMattePlan} from './canvaskit-grid-matte';
import {subjectWindowAlpha,type SubjectWindowPlan} from '../timeline/subject-window';
export type GpuGridMatteResource={plan:CanvasKitGridMattePlan;rgba:Uint8Array};
export type GpuSubjectWindowResource={plan:SubjectWindowPlan;alpha:Uint8Array};
type MaskPixels={url:string;data:Uint8ClampedArray;width:number;height:number};
type Loader=(url:string,signal:AbortSignal,budgetBytes:number)=>Promise<{url:string;data:Uint8ClampedArray;width:number;height:number}>;
async function loadPixels(url:string,signal:AbortSignal,budget:number){
 const response=await fetch(url,{signal,cache:'no-store'});if(!response.ok){await response.body?.cancel().catch(()=>{});throw Error(`GPU grid matte could not load (${response.status})`);}
 const reader=response.body?.getReader();if(!reader)throw Error('GPU grid matte response empty');
 const chunks:Uint8Array[]=[];let encoded=0;
 try{while(true){signal.throwIfAborted();const next=await reader.read();if(next.done)break;encoded+=next.value.byteLength;if(encoded>Math.min(8*1024*1024,budget/4))throw Error('GPU grid matte exceeds encoded budget');chunks.push(new Uint8Array(next.value));}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 signal.throwIfAborted();const bitmap=await createImageBitmap(new Blob(chunks as BlobPart[]));let canvas:OffscreenCanvas|undefined;
 try{
  signal.throwIfAborted();if(bitmap.width*bitmap.height*12+encoded*2>budget)throw Error('GPU grid matte exceeds decoded budget');
  canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const c=canvas.getContext('2d',{willReadFrequently:true});if(!c)throw Error('GPU grid matte canvas unavailable');
  c.drawImage(bitmap,0,0);const data=c.getImageData(0,0,bitmap.width,bitmap.height).data;
  return {url,data,width:bitmap.width,height:bitmap.height};
 }finally{bitmap.close();if(canvas){canvas.width=1;canvas.height=1;}}
}
function wait<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();return new Promise((resolve,reject)=>{const stop=()=>{signal.removeEventListener('abort',stop);reject(signal.reason);};signal.addEventListener('abort',stop,{once:true});void promise.then(v=>{signal.removeEventListener('abort',stop);resolve(v);},e=>{signal.removeEventListener('abort',stop);reject(e);});});
}
/** Session-scoped, bounded immutable resources derived from prepared mask frames.
 * One decode/readback at a time, pinned leases across submission, failed requests
 * never enter cache. `prepare` turns a decoded mask frame into the resource bytes. */
class GpuMaskFrameAssets<P extends {url:string|null},R extends {plan:P}> {
 private readonly store:FrameStore<R>;
 private readonly abort=new AbortController();private pending=new Map<string,{promise:Promise<void>;waiters:number}>();
 private tail:Promise<void>=Promise.resolve();private loading=false;
 /** Decoded mask frames by URL: settings changes at one frame re-derive without another fetch/decode. */
 private readonly decoded=new Map<string,MaskPixels>();
 constructor(private readonly scope:string,private readonly prepare:(plan:P,pixels:MaskPixels)=>{value:R;bytes:number},cacheBytes=4*1024*1024,private readonly stagingBytes=32*1024*1024,private readonly loader:Loader=loadPixels,private readonly decodedFrames=0){
  if(!scope||!Number.isSafeInteger(stagingBytes)||stagingBytes<=0)throw Error('Invalid GPU grid matte resource scope/budget');this.store=new FrameStore(cacheBytes);
 }
 get bytes(){let decoded=0;for(const pixels of this.decoded.values())decoded+=pixels.data.byteLength;return this.store.bytes+decoded+(this.loading?this.stagingBytes:0);}
 private async pixels(url:string){
  const hit=this.decoded.get(url);if(hit){this.decoded.delete(url);this.decoded.set(url,hit);return hit;}
  const pixels=await this.loader(url,this.abort.signal,this.stagingBytes);
  if(this.decodedFrames>0){this.decoded.set(url,pixels);while(this.decoded.size>this.decodedFrames)this.decoded.delete(this.decoded.keys().next().value!);}
  return pixels;
 }
 async acquire(plan:P,signal:AbortSignal):Promise<FrameLease<R>>{
  signal.throwIfAborted();this.abort.signal.throwIfAborted();
  const key=JSON.stringify([this.scope,plan]);const hit=this.store.acquire(key,0);if(hit)return hit;
  let pending=this.pending.get(key);
  if(!pending){
   if(this.pending.size>=32)throw Error('GPU grid matte preparation queue full');
   const entry={promise:Promise.resolve(),waiters:0};
   entry.promise=this.tail.then(async()=>{
    this.abort.signal.throwIfAborted();
    // Superseded requests (an abandoned seek or slider sample) never reach the decoder.
    if(entry.waiters===0)throw new DOMException('Superseded mask request','AbortError');
    this.loading=true;
    try{if(!plan.url)throw Error('GPU mask resource requires a mask frame');
     const pixels=await this.pixels(plan.url);this.abort.signal.throwIfAborted();
     const prepared=this.prepare(plan,pixels);
     if(!this.store.put({sourceKey:key,timestampUs:0,durationUs:1,bytes:prepared.bytes,value:prepared.value,release(){}}))throw Error('GPU mask resource cache budget exceeded');
    }finally{this.loading=false;}
   }).finally(()=>this.pending.delete(key));this.pending.set(key,entry);this.tail=entry.promise.catch(()=>{});pending=entry;
  }
  pending.waiters++;
  try{await wait(pending.promise,AbortSignal.any([signal,this.abort.signal]));}finally{pending.waiters--;}
  signal.throwIfAborted();this.abort.signal.throwIfAborted();
  const lease=this.store.acquire(key,0);if(!lease)throw Error('GPU grid matte could not retain source frame');return lease;
 }
 close(){if(this.abort.signal.aborted)return;this.abort.abort();this.store.close();this.decoded.clear();}
}

export class GpuGridMatteAssets extends GpuMaskFrameAssets<CanvasKitGridMattePlan,GpuGridMatteResource>{
 constructor(scope:string,cacheBytes=4*1024*1024,stagingBytes=32*1024*1024,loader:Loader=loadPixels){
  super(scope,(plan,pixels)=>{const rgba=canvasKitGridMattePixels(plan,pixels);return {value:{plan,rgba},bytes:rgba.byteLength};},cacheBytes,stagingBytes,loader);
 }
}
/** Window alpha on the composition grid (timeline/subject-window.ts); keyed by the whole plan. */
export class GpuSubjectWindowAssets extends GpuMaskFrameAssets<SubjectWindowPlan,GpuSubjectWindowResource>{
 constructor(scope:string,cacheBytes=8*1024*1024,stagingBytes=32*1024*1024,loader:Loader=loadPixels){
  super(scope,(plan,pixels)=>{const alpha=subjectWindowAlpha(plan,pixels);return {value:{plan,alpha},bytes:alpha.byteLength};},cacheBytes,stagingBytes,loader,4);
 }
}
