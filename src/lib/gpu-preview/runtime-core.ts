import {GpuCaptionMaskAssets} from './caption-mask-assets';
import {GpuGridMatteAssets,GpuSubjectWindowAssets,type GpuGridMatteResource,type GpuSubjectWindowResource} from './grid-matte-assets';
import {canvasKitGridMattePlan} from './canvaskit-grid-matte';
import {gpuFrameDependencies,uniqueGpuFrameDependencies,type GpuFrameDependency} from './frame-dependencies';
import {GpuLutAssets} from './lut-assets';
import type {GpuLutTexture} from './lut-textures';
import {readColorGradeLutProps,resolveColorGradeLutAtTime} from '../timeline/cube-lut';
import {quantizeVisualFrameSpan} from '../timeline/frame-quantization';
import {FrameLookahead} from './lookahead';
import {GpuImageBlobCache,decodeGpuImage,type GpuImageDecodeTiming} from './image-frame';
import {BrowserFrameProvider,GPU_PREVIEW_SOURCE_LIMIT,type GpuVideoDecodeTiming} from './browser-frame-provider';
import {FrameStore,type FrameLease} from './frame-store';
import {GpuFrameController} from './frame-controller';
import type {GpuTextCache} from './text-cache';
export type GpuTextResources=Pick<GpuTextCache,'fontIdentity'|'bytes'|'isReady'|'acquire'|'close'>;
const noText:GpuTextResources={fontIdentity:'none',bytes:0,isReady:()=>false,acquire:async()=>{throw Error('GPU text resource owner is required');},close(){}};
import {GpuVideoCompositor} from './compositor';
import type {GpuFrameCompositor} from './frame-compositor';
import {gpuSceneDraws,gpuTextTextureKey} from './scene-draws';
import {planGpuResourceLookahead,imminentGpuCamera,warmGpuFutureResource} from './resource-lookahead';
import {evaluateGpuScene,type GpuScene} from './scene';
import type {CompositionElement} from '../render/composition-adapters';
import {samePictureSources} from './scene-media-key';

/** Owns resources and asynchronous readiness, never a playback clock. */
export class GpuPreviewRuntime {
 readonly frames=new GpuFrameController(new FrameStore<VideoFrame>(256*1024*1024));
 readonly text:GpuTextResources;
 private readonly lutAssets:GpuLutAssets;
 private readonly gridAssets:GpuGridMatteAssets;
 private readonly windowAssets:GpuSubjectWindowAssets;
 private readonly windowPrefetches=new Map<string,Promise<void>>();
 private readonly captionMasks=new GpuCaptionMaskAssets();
 private readonly imageBlobs=new GpuImageBlobCache();
 // Layered reveals must retain their forward decoders across lookahead batches.
 // Four slots churn on a background plus six independently timed alpha sources.
 // Keep a bounded eight-stream working set; unused slots allocate nothing.
 private readonly provider=new BrowserFrameProvider(GPU_PREVIEW_SOURCE_LIMIT);
 private readonly compositor:GpuFrameCompositor;
 private decodeAbort=new AbortController();
 private lookahead=new FrameLookahead();
 private imageLookahead=new FrameLookahead();
 private resourceAbort=new AbortController();
 private textPrefetches=new Map<string,Promise<void>>();
 private lastResourceFrame=-Infinity;
 private seekKey:unknown;
 private sourceBytes=new Map<string,number>();
 private closed=false;
 private sceneCache=new Map<number,GpuScene>();
 private recentLookaheadDecodes:GpuVideoDecodeTiming[]=[];
 lastPrefetch:Readonly<{frame:number;planningMs:number;decodes:GpuVideoDecodeTiming[]}>|undefined;
 lastPresentation:Readonly<{frame:number;cacheMisses:number;evaluationMs:number;resourceMs:number;submitMs:number;totalMs:number;imageDecodes:Array<GpuImageDecodeTiming&{sourceKey:string}>;videoDecodes:GpuVideoDecodeTiming[];lookaheadWaits:Array<{sourceKey:string;kind:string;waitMs:number;ready:boolean}>;textActors:string[];sourceFrames:{slot:string;requestedUs:number;timestampUs:number;durationUs:number;width:number;height:number;sourceKey:string}[]}>|undefined;
 constructor(readonly device:GPUDevice,context:GPUCanvasContext|null,format:GPUTextureFormat,
  private elements:CompositionElement[],private laneOrder:readonly string[],readonly scope:string,
  readonly width:number,readonly height:number,readonly fps:number,
  compositor?:GpuFrameCompositor,private readonly rendering=false,textCache?:GpuTextResources,private readonly rasterScale=1){this.text=textCache??noText;if(!compositor&&!context)throw Error('GPU compositor or canvas context is required');this.compositor=compositor??new GpuVideoCompositor(device,context!,format);this.lutAssets=new GpuLutAssets(device,scope,4*1024*1024,this.compositor.cpuLuts===true);this.gridAssets=new GpuGridMatteAssets(scope);this.windowAssets=new GpuSubjectWindowAssets(scope);}
 cancelPreparation(){this.frames.invalidatePending();this.decodeAbort.abort();this.lookahead.cancel();this.cancelResourceLookahead();}
 updateScene(elements:CompositionElement[],laneOrder:readonly string[]){
  // A placement-only change (a dial drag) keeps decoded frames and decoders: only the
  // composition is re-evaluated. Any source, timing or effect change resets preparation.
  const placementOnly=samePictureSources(this.elements,elements)&&laneOrder.join('\u0000')===this.laneOrder.join('\u0000');
  this.elements=elements;this.laneOrder=laneOrder;this.sceneCache.clear();
  if(placementOnly)return;
  this.frames.invalidatePending();this.decodeAbort.abort();this.lookahead.cancel();this.cancelResourceLookahead();
 }
 scene(frame:number){
  const hit=this.sceneCache.get(frame);if(hit)return hit;
  const scene=evaluateGpuScene(this.elements,this.laneOrder,frame,this.width,this.height,this.scope,this.fps,this.rendering,this.rasterScale);
  // Lookahead and presentation share immutable evaluations. Keep only two
  // lookahead windows; this contains no decoded media or GPU allocations.
  this.sceneCache.set(frame,scene);
  if(this.sceneCache.size>64)this.sceneCache.delete(this.sceneCache.keys().next().value!);
  return scene;
 }
 async present(frame:number,seekKey:unknown){
  if(this.closed)throw Error('GPU preview closed');
  const started=performance.now();
  if(this.seekKey!==seekKey){
   this.seekKey=seekKey;this.frames.invalidatePending();
   // The transport increments its epoch on Play and rate changes as well as
   // seeks. Starting from the displayed frame preserves valid source lookahead;
   // only a changed position needs to discard that speculative work.
   if(this.lastPresentation?.frame!==frame){this.lookahead.cancel();this.cancelResourceLookahead();}
  }
  this.decodeAbort.abort();this.decodeAbort=new AbortController();const signal=this.decodeAbort.signal;
  const scene=this.scene(frame),videos=scene.layers.filter(l=>l.kind==='video');
  const dependencies=gpuFrameDependencies(scene,this.elements,this.scope,this.rendering);
  const evaluated=performance.now();
  const ticket=this.frames.request(this.scope,frame,dependencies.map(l=>({slot:l.slot,sourceKey:l.source.key,timeUs:l.timeUs})));
  const videoDecodes:GpuVideoDecodeTiming[]=[];
  const lookaheadWaits:Array<{sourceKey:string;kind:string;waitMs:number;ready:boolean}>=[];
  const waitForLookahead=async(layer:GpuFrameDependency)=>{
   const queue=layer.source.kind==='image'?this.imageLookahead:this.lookahead;
   const time=layer.source.kind==='image'?0:layer.timeUs;
   if(!queue.has(layer.source.key,time))return;
   const started=performance.now();
   const ready=await queue.wait(layer.source.key,time,signal);
   signal.throwIfAborted();
   lookaheadWaits.push({sourceKey:layer.source.key,kind:layer.source.kind??'video',waitMs:performance.now()-started,ready});
  };
  const imageDecodes:Array<GpuImageDecodeTiming&{sourceKey:string}>=[];
  const maskLeases=new Map<string,FrameLease<OffscreenCanvas>>();
  const gridLeases=new Map<string,FrameLease<GpuGridMatteResource>>();
  const windowLeases=new Map<string,FrameLease<GpuSubjectWindowResource>>();
  const lutLeases=new Map<string,FrameLease<GpuLutTexture>>();
  const textLeases=new Map<string,FrameLease<OffscreenCanvas>>();
  try{
   const missing=uniqueGpuFrameDependencies(dependencies).filter(l=>{const lease=this.frames.store.acquire(l.source.key,l.timeUs);lease?.release();return !lease;});
   // A sequential lookahead may already be decoding the frame we need. Consume
   // that result as soon as it arrives instead of restarting from a keyframe.
   // Forward demand queues behind its own source only. Cancelling all lookahead
   // here restarts healthy layered decoders whenever one incoming source misses.
   const cameraWarmup=this.lastPresentation?undefined:imminentGpuCamera(this.elements,frame,this.fps);
   const warmLayer=cameraWarmup?this.scene(cameraWarmup.frame).layers.find(layer=>layer.kind==='caption'&&layer.element.id===cameraWarmup.id):undefined;
   const tasks=[...scene.layers.filter(l=>l.kind==='caption'&&l.viewportMaskUrl).map(async layer=>{if(layer.kind==='caption'&&layer.viewportMaskUrl)maskLeases.set(layer.element.id,await this.captionMasks.acquire(layer.viewportMaskUrl,signal));}),this.compositor.ready,...(warmLayer&&warmLayer.kind==='caption'?[warmGpuFutureResource(()=>this.text.acquire(warmLayer,signal),signal)]:[]),...videos.map(async layer=>{
    if(!readColorGradeLutProps(layer.element.props))return;
    const span=quantizeVisualFrameSpan(layer.element.timeline_start,layer.element.duration,{fps:this.fps});
    const lut=resolveColorGradeLutAtTime(layer.element.props,layer.effectTime??(frame-span.startFrame)/this.fps);
    if(lut)lutLeases.set(layer.element.id,await this.lutAssets.acquire(lut,signal));
   }),...videos.map(async layer=>{const plan=canvasKitGridMattePlan(layer.element.props,layer.sourceTimeSeconds,this.width,this.height);if(plan)gridLeases.set(layer.element.id,await this.gridAssets.acquire(plan,signal));}),...videos.map(async layer=>{if(layer.subjectWindow?.url&&!windowLeases.has(layer.element.id)){const lease=await this.windowAssets.acquire(layer.subjectWindow,signal);if(windowLeases.has(layer.element.id))lease.release();else windowLeases.set(layer.element.id,lease);}}),...missing.map(async layer=>{
    if(layer.source.kind==='image'){
     await waitForLookahead(layer);signal.throwIfAborted();
     const cached=this.frames.store.acquire(layer.source.key,0);
     if(cached){cached.release();return;}
     const value=await decodeGpuImage(layer.source,signal,this.imageBlobs);
     imageDecodes.push({...value.decodeTiming,sourceKey:layer.source.key});
     this.frames.offer(ticket,value);return;
    }
    await waitForLookahead(layer);signal.throwIfAborted();
    const cached=this.frames.store.acquire(layer.source.key,layer.timeUs);
    if(cached){cached.release();return;}
    await this.provider.decode(layer.source,[layer.timeUs],signal,value=>{this.sourceBytes.set(value.sourceKey,value.bytes);this.frames.offer(ticket,value);},timing=>videoDecodes.push(timing));
   }),
    ...scene.layers.filter(l=>l.kind==='text'||l.kind==='caption').map(async layer=>{const lease=await this.text.acquire(layer,signal);textLeases.set(layer.element.id,lease);})];
   const outcomes=await Promise.allSettled(tasks);signal.throwIfAborted();
   const failure=outcomes.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
   const resourcesReady=performance.now();
   const packet=this.frames.acquire(ticket);
   if(!packet){
    if(this.frames.isCurrent(ticket)){
     const absent=ticket.needs.filter(need=>!this.frames.store.has(need.sourceKey,need.timeUs)).map(need=>`${need.sourceKey.slice(-40)}@${need.timeUs}`);
     throw Error(`GPU preview could not acquire a complete picture within its frame-cache budget. Missing ${absent.length} of ${ticket.needs.length} (${absent.join(', ')}); cache: ${this.frames.store.describe()}.`);
    }
    return false;
   }
   const sourceFrames=ticket.needs.map(need=>{const value=packet.frames.get(need.slot)!;return {slot:need.slot,sourceKey:need.sourceKey,requestedUs:need.timeUs,timestampUs:value.timestampUs,durationUs:value.durationUs,width:value.value.displayWidth,height:value.value.displayHeight};});
   const presented=this.frames.submit(packet,frames=>this.compositor.draw(gpuSceneDraws(scene,frames,l=>textLeases.get(l.element.id)?.frame.value,id=>lutLeases.get(id)?.frame.value,id=>gridLeases.get(id)?.frame.value,id=>maskLeases.get(id)?.frame.value,id=>windowLeases.get(id)?.frame.value)));
   const finished=performance.now();
   if(presented)this.lastPresentation={frame,cacheMisses:missing.length,evaluationMs:evaluated-started,resourceMs:resourcesReady-evaluated,submitMs:finished-resourcesReady,totalMs:finished-started,imageDecodes,videoDecodes,lookaheadWaits,textActors:[...textLeases.keys()],sourceFrames};
   return presented;
  }finally{this.frames.finish(ticket);for(const lease of maskLeases.values())lease.release();for(const lease of textLeases.values())lease.release();for(const lease of lutLeases.values())lease.release();for(const lease of gridLeases.values())lease.release();for(const lease of windowLeases.values())lease.release();}
 }
 /** Small source lookahead, using the same evaluated source clock as presentation. */
 prefetch(frame:number,seekKey:unknown,endFrame:number,includeResources:boolean|'images'|'entrances'=true){
  if(this.closed||this.seekKey!==seekKey)return;
  const started=performance.now();
  try{
  if(includeResources&&(includeResources==='images'||frame-this.lastResourceFrame>=10)){
   if(includeResources!=='images')this.lastResourceFrame=frame;
   const scenes=(function*(runtime:GpuPreviewRuntime){for(let offset=1;offset<=30&&frame+offset<endFrame;offset++)yield runtime.scene(frame+offset);})(this);
   const resources=planGpuResourceLookahead(scenes,this.text.fontIdentity,layer=>{
    if(this.imageLookahead.active)return true;
    return this.frames.store.has(layer.source.key,0);
   },layer=>includeResources==='images'||this.textPrefetches.has(gpuTextTextureKey(layer,this.text.fontIdentity))||this.text.isReady(layer),this.scene(frame));
   if(resources.image){
    const source=resources.image.source;
    this.imageLookahead.start(new Map([[source.key,[0]]]),async(_key,_times,signal,ready)=>{
     const value=await decodeGpuImage(source,signal,this.imageBlobs);
     if(signal.aborted||this.closed){value.release();return;}
     // Rapid still cuts can be only a few frames apart. Once this decode
     // finishes, refill the one-image queue on the next presentation instead
     // of waiting for the ten-frame text planning cadence.
     if(this.frames.cache(value))this.lastResourceFrame=-Infinity;
     ready(0,1);
    });
   }
   for(const layer of resources.text){
    if(this.textPrefetches.size>=2)break;
    const key=gpuTextTextureKey(layer,this.text.fontIdentity),signal=this.resourceAbort.signal;
    const pending=this.text.acquire(layer,signal).then(lease=>{lease.release();},()=>{}).finally(()=>{
     if(this.textPrefetches.get(key)===pending)this.textPrefetches.delete(key);
    });this.textPrefetches.set(key,pending);
   }
  }
  if(includeResources==='images')return;
  // Subject windows: derive the next few window masks ahead of presentation (bounded, cancellable).
  if(includeResources!=='entrances')for(let offset=1;offset<=8&&frame+offset<endFrame&&this.windowPrefetches.size<8;offset++){
   for(const layer of this.scene(frame+offset).layers){
    if(layer.kind!=='video'||!layer.subjectWindow?.url)continue;
    const key=JSON.stringify(layer.subjectWindow);if(this.windowPrefetches.has(key))continue;
    const pending=this.windowAssets.acquire(layer.subjectWindow,this.resourceAbort.signal).then(lease=>{lease.release();},()=>{}).finally(()=>{this.windowPrefetches.delete(key);});
    this.windowPrefetches.set(key,pending);
   }
  }
  const targets=new Map<string,{source:GpuFrameDependency;times:Set<number>}>();
  let bytes=0;
  const entranceOnly=includeResources==='entrances';
  const foreground=new Set(gpuFrameDependencies(this.scene(frame),this.elements,this.scope,this.rendering).filter(layer=>layer.source.kind!=='image').map(layer=>layer.source.key));
  const future=Array.from({length:Math.min(entranceOnly?Math.ceil(this.fps*2):30,Math.max(0,endFrame-frame-1))},(_,offset)=>
   gpuFrameDependencies(this.scene(frame+offset+1),this.elements,this.scope,this.rendering));
  // Warm entrances before spending the entire budget on consecutive frames of
  // today's layers. Otherwise a dense reveal starves its background handoff.
  for(const dependencies of future)for(const layer of dependencies){
   if(layer.source.kind==='image'||entranceOnly&&foreground.has(layer.source.key)||targets.has(layer.source.key)||this.frames.store.has(layer.source.key,layer.timeUs))continue;
   const cost=this.sourceBytes.get(layer.source.key)??layer.source.estimatedFrameBytes??this.width*this.height*4;
   if(targets.size+(entranceOnly?foreground.size:0)>=GPU_PREVIEW_SOURCE_LIMIT||bytes+cost>this.frames.store.budgetBytes/2)continue;
   targets.set(layer.source.key,{source:layer,times:new Set([layer.timeUs])});bytes+=cost;
  }
  // A source playing backwards (reversed clip) gets no help from sequential
  // decoding: each earlier frame restarts at its previous keyframe. Batch the
  // next second of its descending times so one forward pass fills them all.
  if(entranceOnly){
   const current=new Map(gpuFrameDependencies(this.scene(frame),this.elements,this.scope,this.rendering).filter(layer=>layer.source.kind!=='image').map(layer=>[layer.source.key,layer.timeUs]));
   const backward=new Map<string,{source:GpuFrameDependency;times:Set<number>}>();
   for(const dependencies of future.slice(0,Math.ceil(this.fps)))for(const layer of dependencies){
    const now=current.get(layer.source.key);
    if(now===undefined||layer.timeUs>=now||targets.has(layer.source.key)||this.frames.store.has(layer.source.key,layer.timeUs))continue;
    const cost=this.sourceBytes.get(layer.source.key)??layer.source.estimatedFrameBytes??this.width*this.height*4;
    if(bytes+cost>this.frames.store.budgetBytes/2)continue;
    let entry=backward.get(layer.source.key);
    if(!entry){entry={source:layer,times:new Set()};backward.set(layer.source.key,entry);}
    if(entry.times.size>=60||entry.times.has(layer.timeUs))continue;
    entry.times.add(layer.timeUs);bytes+=cost;
   }
   for(const [key,entry]of backward)if(entry.times.size>1)targets.set(key,entry);
  }
  // Reserve half the cache for current/recent frames. Layered scenes need enough
  // future pictures to survive a delayed display tick without restarting decode.
  // Admit all new source
  // dependencies of a future frame together, never half of a layered picture.
  for(const dependencies of entranceOnly?[]:future){
   const additions=new Map<string,{layer:GpuFrameDependency;times:Set<number>}>();let extraBytes=0;
   for(const layer of dependencies){
    if(layer.source.kind==='image')continue;
    if(this.frames.store.has(layer.source.key,layer.timeUs))continue;
    if(targets.get(layer.source.key)?.times.has(layer.timeUs)||additions.get(layer.source.key)?.times.has(layer.timeUs))continue;
    extraBytes+=this.sourceBytes.get(layer.source.key)??layer.source.estimatedFrameBytes??this.width*this.height*4;
    let addition=additions.get(layer.source.key);
    if(!addition){addition={layer,times:new Set()};additions.set(layer.source.key,addition);}addition.times.add(layer.timeUs);
   }
   if(bytes+extraBytes>this.frames.store.budgetBytes/2||new Set([...targets.keys(),...additions.keys()]).size>GPU_PREVIEW_SOURCE_LIMIT)break;
   bytes+=extraBytes;
   for(const [key,addition]of additions){
    let target=targets.get(key);if(!target){target={source:addition.layer,times:new Set()};targets.set(key,target);}
    for(const time of addition.times)target.times.add(time);
   }
  }
  // Prefetch is cache-only: it must not replace the current presentation ticket.
  this.lookahead.start(new Map([...targets].map(([key,target])=>[key,[...target.times]])),(key,times,signal,ready)=>
   this.provider.decode(targets.get(key)!.source.source,times,signal,value=>{
    if(!signal.aborted&&!this.closed){this.sourceBytes.set(value.sourceKey,value.bytes);this.frames.cache(value);ready(value.timestampUs,value.durationUs);}else value.release();
   },timing=>{this.recentLookaheadDecodes.push(timing);if(this.recentLookaheadDecodes.length>16)this.recentLookaheadDecodes.shift();}));
  }finally{this.lastPrefetch={frame,planningMs:performance.now()-started,decodes:[...this.recentLookaheadDecodes]};}
 }
 get bytes(){return this.frames.store.bytes+this.text.bytes+this.compositor.bytes+this.lutAssets.bytes+this.gridAssets.bytes+this.windowAssets.bytes+this.captionMasks.bytes+this.imageBlobs.bytes+(this.provider.bytes??0)+(this.provider.encodedCacheBudgetBytes??0);}
 private cancelResourceLookahead(){this.imageLookahead.cancel();this.resourceAbort.abort();this.resourceAbort=new AbortController();this.lastResourceFrame=-Infinity;}
 close(){if(this.closed)return;this.closed=true;this.sceneCache.clear();this.decodeAbort.abort();this.lookahead.cancel();this.cancelResourceLookahead();this.provider.close();this.lutAssets.close();this.gridAssets.close();this.windowAssets.close();this.captionMasks.close();this.imageBlobs.close();this.frames.close();this.text.close();this.compositor.close();}
}
