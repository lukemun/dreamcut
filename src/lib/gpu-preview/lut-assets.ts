import {MAX_CUBE_LUT_BYTES,parseCubeLut,readColorGradeLutProps,type ColorGradeLut} from '../timeline/cube-lut';
import {GpuLutTextures,type GpuLutTexture} from './lut-textures';
import type {FrameLease} from './frame-store';

async function readCube(response:Response,signal:AbortSignal){
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw Error(`GPU LUT could not load (${response.status})`);}
 const reader=response.body?.getReader();if(!reader)throw Error('GPU LUT response is empty');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   signal.throwIfAborted();const next=await reader.read();signal.throwIfAborted();
   if(next.done)break;
   size+=next.value.byteLength;if(size>MAX_CUBE_LUT_BYTES)throw Error('GPU LUT exceeds encoded resource budget');
   chunks.push(next.value);
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return parseCubeLut(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function wait<T>(pending:Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
  signal.addEventListener('abort',abort,{once:true});
  void pending.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
 });
}
/** One bounded fetch/parse/upload at a time. A cancelled seeker stops waiting,
 * while another seeker may use the same immutable asset. Close aborts all work. */
export class GpuLutAssets {
 private readonly textures:GpuLutTextures;
 private readonly abort=new AbortController();
 private readonly pending=new Map<string,Promise<void>>();
 private tail:Promise<void>=Promise.resolve();
 constructor(device:ConstructorParameters<typeof GpuLutTextures>[0],private readonly scope:string,budgetBytes=4*1024*1024,cpuOnly=false){
  if(!scope)throw Error('GPU LUT requires a media snapshot identity');
  this.textures=new GpuLutTextures(device,budgetBytes,cpuOnly);
 }
 get bytes(){return this.textures.bytes;}
 async acquire(lut:ColorGradeLut,signal:AbortSignal):Promise<FrameLease<GpuLutTexture>>{
  signal.throwIfAborted();this.abort.signal.throwIfAborted();
  // Reuse the same reference validation as Standard and the editor controls.
  readColorGradeLutProps({lut_asset_id:lut.assetId,lut_source_url:lut.sourceUrl,lut_intensity:lut.intensity});
  const key=JSON.stringify([this.scope,lut.assetId,lut.sourceUrl]);
  const hit=this.textures.acquireCached(key);if(hit)return hit;
  let pending=this.pending.get(key);
  if(!pending){
   if(this.pending.size>=64)throw Error('GPU LUT preparation queue is full');
   pending=this.tail.then(async()=>{
    this.abort.signal.throwIfAborted();
    const response=await fetch(lut.sourceUrl,{signal:this.abort.signal,cache:'no-store'});
    const parsed=await readCube(response,this.abort.signal);this.abort.signal.throwIfAborted();
    const lease=this.textures.acquire(key,parsed);lease.release();
   }).finally(()=>{this.pending.delete(key);});
   this.pending.set(key,pending);this.tail=pending.catch(()=>{});
  }
  await wait(pending,AbortSignal.any([signal,this.abort.signal]));
  signal.throwIfAborted();this.abort.signal.throwIfAborted();
  const lease=this.textures.acquireCached(key);
  if(!lease)throw Error('GPU LUT could not retain the requested asset');
  return lease;
 }
 close(){if(this.abort.signal.aborted)return;this.abort.abort();this.textures.close();}
}
