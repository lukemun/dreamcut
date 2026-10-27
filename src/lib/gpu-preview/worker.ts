import {setEditorFrameRate} from '@/lib/timeline/frame-rate-scope';
import type {CanvasKit,CanvasKitInitOptions} from 'canvaskit-wasm';
import {CanvasKitCompositor} from './canvaskit-compositor';
import {optionalWebGpuDevice,webGpuCanvasFormat} from './webgpu-optional';
import {GpuPreviewRuntime} from './runtime-core';
import {setGpuSvgRasterizer} from './image-frame';
import type {GpuTextResources} from './runtime-core';
import {FrameStore,type FrameLease} from './frame-store';
import {gpuTextTextureKey} from './scene-draws';
import {setGpuTextBounds,setGpuTextAnchor,setGpuTextFillRegions,setGpuTickerWidth} from './text-bounds';
import type {GpuRasterTextLayer} from './scene';
import {GpuReplaySegmentCache,chooseReplayEncoderConfig,replayEncodeSize} from './replay-segment-cache';
/** Compressed first-pass pictures kept for replay (roughly 8 minutes at 1080p). */
const REPLAY_BUDGET_BYTES=512*1024*1024;

import {workerFailure,type GpuWorkerRequest,type GpuWorkerReply,type TextPicture} from './worker-protocol';
type Reply=TextPicture;
const scope=self as unknown as {postMessage(message:GpuWorkerReply,transfer?:Transferable[]):void;onmessage:((event:MessageEvent<GpuWorkerRequest>)=>void)|null};
let textId=0;
scope.postMessage({type:'boot'});
// Vector stills are rasterized by the page (no Image/SVG decoder in workers).
const svgWaiters=new Map<number,{resolve:(bitmap:ImageBitmap)=>void;reject:(error:unknown)=>void}>();
let svgId=0;
setGpuSvgRasterizer((url,box,signal)=>new Promise<ImageBitmap>((resolve,reject)=>{
 signal.throwIfAborted();const id=++svgId;
 const abort=()=>{if(svgWaiters.delete(id))reject(signal.reason);};
 signal.addEventListener('abort',abort,{once:true});
 svgWaiters.set(id,{resolve:bitmap=>{signal.removeEventListener('abort',abort);if(signal.aborted){bitmap.close();reject(signal.reason);}else resolve(bitmap);},reject:error=>{signal.removeEventListener('abort',abort);reject(error);}});
 scope.postMessage({type:'svg',id,url,width:box.width,height:box.height});
}));
const textWaiters=new Map<number,{resolve:(reply:Reply)=>void;reject:(error:unknown)=>void}>();
class WorkerTextCache implements GpuTextResources {
 constructor(readonly fontIdentity:string){}
 private rasterStore=new FrameStore<OffscreenCanvas>(32*1024*1024);
 private requests=new Map<string,Promise<void>>();
 private stopped=false;
 get bytes(){return this.rasterStore.bytes;}
 isReady(layer:GpuRasterTextLayer){return this.rasterStore.has(gpuTextTextureKey(layer,this.fontIdentity),0);}
 async acquire(layer:GpuRasterTextLayer,signal:AbortSignal):Promise<FrameLease<OffscreenCanvas>>{
  signal.throwIfAborted();if(this.stopped)throw Error('Worker text cache closed');
  const key=gpuTextTextureKey(layer,this.fontIdentity),hit=this.rasterStore.acquire(key,0);if(hit)return hit;
  let pending=this.requests.get(key);
  if(!pending){
   const id=++textId;
   pending=new Promise<Reply>((resolve,reject)=>{textWaiters.set(id,{resolve,reject});scope.postMessage({type:'text',id,layer});}).then(reply=>{
    try{
     if(this.stopped)return;
     const canvas=new OffscreenCanvas(reply.bitmap.width,reply.bitmap.height),ctx=canvas.getContext('2d');if(!ctx)throw Error('Worker text surface unavailable');
     ctx.drawImage(reply.bitmap,0,0);setGpuTextBounds(canvas,reply.bounds);
     if(reply.anchor)setGpuTextAnchor(canvas,reply.anchor);if(reply.fillRegions)setGpuTextFillRegions(canvas,reply.fillRegions);if(reply.tickerWidth!==undefined)setGpuTickerWidth(canvas,reply.tickerWidth);
     if(!this.rasterStore.put({sourceKey:key,timestampUs:0,durationUs:1,bytes:canvas.width*canvas.height*4,value:canvas,release(){canvas.width=1;canvas.height=1;}}))throw Error('Worker text exceeds cache budget');
    }finally{reply.bitmap.close();}
   }).finally(()=>this.requests.delete(key));this.requests.set(key,pending);
  }
  await pending;signal.throwIfAborted();const lease=this.rasterStore.acquire(key,0);if(!lease)throw Error('Worker text unavailable');return lease;
 }
 close(){this.stopped=true;this.rasterStore.close();for(const waiter of textWaiters.values())waiter.reject(Error('Worker text closed'));textWaiters.clear();}
}
let runtime:GpuPreviewRuntime|undefined,canvas:OffscreenCanvas|undefined,device:GPUDevice|null|undefined,delivery:OffscreenCanvas|undefined,duration=0;
let replay:GpuReplaySegmentCache<ImageBitmap>|null=null,replayFps=30,replayVersion=0;
async function createReplayCache(output:OffscreenCanvas,fps:number){
 const size=replayEncodeSize(output.width,output.height),config=await chooseReplayEncoderConfig(size.width,size.height,fps);
 if(!config)return null;
 const same=size.width===output.width&&size.height===output.height,encodeSurface=same?output:new OffscreenCanvas(size.width,size.height);
 return new GpuReplaySegmentCache<ImageBitmap>(fps,config,REPLAY_BUDGET_BYTES,{
  createEncoder:(onChunk,error)=>new VideoEncoder({output:(chunk,meta)=>onChunk(chunk,meta),error}),
  createDecoder:(onFrame,error)=>new VideoDecoder({output:onFrame,error}),
  captureFrame:(timestamp,frameDuration)=>{
   if(!same){const ctx=encodeSurface.getContext('2d',{alpha:false});if(!ctx)throw Error('Replay encode surface unavailable');ctx.drawImage(output,0,0,size.width,size.height);}
   return new VideoFrame(encodeSurface,{timestamp,duration:frameDuration});
  },
  present:frame=>{
   const ctx=output.getContext('2d',{alpha:false});if(!ctx)throw Error('GPU delivery canvas unavailable');
   ctx.drawImage(frame as VideoFrame,0,0,output.width,output.height);return output.transferToImageBitmap();
  },
 });
}
scope.onmessage=event=>{
 const message=event.data;
 if(message.type==='svg-result'){
  const waiter=svgWaiters.get(message.id);svgWaiters.delete(message.id);
  if(!waiter){message.bitmap?.close();return;}if('error' in message&&message.error!==undefined)waiter.reject(Error(message.error));else waiter.resolve(message.bitmap!);return;
 }
 if(message.type==='record'){
  // Synchronous on arrival: it keeps its place between the in-order pictures before and after it.
  try{
   const output=delivery?.getContext('2d',{alpha:false});
   if(replay&&output&&message.bitmap.width===delivery!.width&&message.bitmap.height===delivery!.height){output.drawImage(message.bitmap,0,0);replay.record(message.frame,duration);}
  }catch{/* Replay recording is optional. */}finally{message.bitmap.close();}
  return;
 }
 if(message.type==='text-result'){
  const waiter=textWaiters.get(message.id);textWaiters.delete(message.id);
  if(!waiter){message.bitmap?.close();return;}if('error' in message)waiter.reject(Error(message.error));else waiter.resolve(message);return;
 }
 void (async()=>{
  const id='id' in message?message.id:undefined;
  try{
   if(message.type==='init'){
    // WebGPU is optional: CanvasKit draws with WebGL2, which also runs in software without a graphics card.
    device=await optionalWebGpuDevice();
    device?.addEventListener('uncapturederror',event=>scope.postMessage({type:'fatal',error:event.error.message}));
    if(device)void device.lost.then(info=>scope.postMessage({type:'fatal',error:`GPU device lost: ${info.message||info.reason}`}));
    const loader=self as unknown as {importScripts(url:string):void;CanvasKitInit:(options:CanvasKitInitOptions)=>Promise<CanvasKit>};
    loader.importScripts(message.scriptUrl);
    const scale=message.pixelScale??1,kit=await loader.CanvasKitInit({locateFile:()=>message.wasmUrl});canvas=new OffscreenCanvas(message.width*scale,message.height*scale);
    const compositor=new CanvasKitCompositor(kit,canvas,undefined,error=>scope.postMessage({type:'fatal',...workerFailure(error)}),scale);
    setEditorFrameRate(message.fps);
    runtime=new GpuPreviewRuntime(device,null,webGpuCanvasFormat(),message.elements,message.laneOrder,message.scope,message.width,message.height,message.fps,compositor,false,new WorkerTextCache('session-fonts-v1'));
    delivery=new OffscreenCanvas(message.deliveryWidth,message.deliveryHeight);
    duration=message.duration;
    replayFps=message.fps;const version=replayVersion;
    try{const created=await createReplayCache(delivery,message.fps);if(version===replayVersion)replay=created;else created?.close();}catch{replay=null;}
    scope.postMessage({id:message.id,type:'ready'});
   }else if(message.type==='render'){
    if(!runtime||!canvas)throw Error('Worker not initialized');
    if(message.allowReplay&&replay){
     const started=performance.now(),cached=await replay.take(message.frame);
     if(cached){
      const ms=performance.now()-started;
      const timing={frame:message.frame,cacheMisses:0,evaluationMs:0,resourceMs:ms,submitMs:0,totalMs:ms,imageDecodes:[],videoDecodes:[],lookaheadWaits:[],textActors:[],sourceFrames:[],replayHit:true};
      scope.postMessage({id:message.id,type:'picture',bitmap:cached,timing,bytes:runtime.bytes,prefetch:runtime.lastPrefetch,replay:replay.stats},[cached]);
      return;
     }
    }
    if(!await runtime.present(message.frame,message.generation))throw Error('Worker picture superseded');
    const output=delivery!.getContext('2d',{alpha:false});if(!output)throw Error('GPU delivery canvas unavailable');
    output.drawImage(canvas,0,0,delivery!.width,delivery!.height);
    // Record before the transfer below empties the delivery surface. Only playback frames are
    // replayed, so only they are recorded; a paused render or scrub never starts an encoder.
    if(message.record===true)try{replay?.record(message.frame,duration);}catch{/* Replay recording is optional. */}
    const bitmap=delivery!.transferToImageBitmap(),timing=runtime.lastPresentation!;
    runtime.prefetch(message.frame,message.generation,duration,'entrances');
    scope.postMessage({id:message.id,type:'picture',bitmap,timing,bytes:runtime.bytes,prefetch:runtime.lastPrefetch,replay:replay?.stats??null},[bitmap]);
   }else if(message.type==='cancel'){runtime?.cancelPreparation();}
   else if(message.type==='update'){replay?.clear();runtime?.updateScene(message.elements,message.laneOrder);duration=message.duration;}
   else if(message.type==='resize'){
    // Replay segments are encoded at the delivery size, so they start again at the new one.
    if(!delivery||delivery.width===message.deliveryWidth&&delivery.height===message.deliveryHeight)return;
    delivery.width=message.deliveryWidth;delivery.height=message.deliveryHeight;
    replay?.close();replay=null;const version=++replayVersion,output=delivery;
    try{const created=await createReplayCache(output,replayFps);if(version===replayVersion)replay=created;else created?.close();}catch{/* Replay is optional. */}
   }
  }catch(error){if(id!==undefined)scope.postMessage({id,type:'error',...workerFailure(error)});else scope.postMessage({type:'fatal',...workerFailure(error)});}
 })();
};
