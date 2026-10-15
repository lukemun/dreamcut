import {GpuTextCache} from './text-cache';
import {rasterizeSvgInDocument,type GpuSvgRasterizer} from './image-frame';
import {gpuTextBounds,gpuTextAnchor,gpuTextFillRegions,gpuTickerWidth} from './text-bounds';
import type {CompositionElement} from '../render/composition-adapters';
import type {GpuPreviewRuntime} from './runtime';
import type {GpuWorkerConfig,GpuWorkerReply,GpuWorkerRequest,WorkerPicture} from './worker-protocol';
type Result=Extract<GpuWorkerReply,{type:'ready'|'picture'}>;
/** Owns transferred pixels and DOM text only. The worker owns decode/composition;
 * neither owns transport time. Dependency injection permits lifecycle tests. */
export class GpuWorkerClient {
 private readonly abort=new AbortController();
 private requests=new Map<number,{resolve:(value:Result)=>void;reject:(error:unknown)=>void}>();
 private id=0;
 private closed=false;
 private rejectBoot:(error:unknown)=>void=()=>{};
 readonly slowText:Array<{frame:number;ms:number;kind:string}>=[];
 readonly slowPictures:Array<{frame:number;resourceMs:number;drawMs:number;decodes:NonNullable<GpuPreviewRuntime['lastPresentation']>['videoDecodes']}>=[];
 bytes=0;
 lastPrefetch:GpuPreviewRuntime['lastPrefetch'];
 lastReplay:WorkerPicture['replay']=null;
 /** Playback may use compressed replay pictures; paused frames are always composited live. */
 allowReplay=false;
 /** The picture queue's current preparation generation; a re-render reuses it so queued work survives. */
 private generation=0;
 readonly ready:Promise<void>;
 constructor(config:GpuWorkerConfig,private readonly failure:(error:Error)=>void,
  private readonly worker:Worker=new Worker('/api/preview-runtime/gpu-worker'),
  private readonly text:Pick<GpuTextCache,'acquire'|'bytes'|'close'>=new GpuTextCache('session-fonts-v1'),
  baseUrl=location.href,
  private readonly svg:GpuSvgRasterizer=rasterizeSvgInDocument){
  let bootResolve!:()=>void;
  const boot=new Promise<void>((resolve,reject)=>{bootResolve=resolve;this.rejectBoot=reject;});
  this.worker.onmessage=(event:MessageEvent<GpuWorkerReply>)=>{
   const message=event.data;
   if(message.type==='boot'){bootResolve();return;}
   if(message.type==='text'){
    const started=performance.now();
    void this.text.acquire(message.layer,this.abort.signal).then(async lease=>{
     try{
      const canvas=lease.frame.value,bitmap=await createImageBitmap(canvas);
      if(this.closed){bitmap.close();return;}
      try{this.post({type:'text-result',id:message.id,bitmap,bounds:gpuTextBounds(canvas,message.layer.planeWidth,message.layer.planeHeight),anchor:gpuTextAnchor(canvas),fillRegions:gpuTextFillRegions(canvas),tickerWidth:gpuTickerWidth(canvas)},[bitmap]);}
      catch(error){bitmap.close();throw error;}
     }finally{lease.release();const ms=performance.now()-started;if(ms>50){this.slowText.push({frame:'rasterFrame' in message.layer?message.layer.rasterFrame:-1,ms,kind:message.layer.kind});if(this.slowText.length>16)this.slowText.shift();}}
    }).catch(error=>{if(!this.closed)this.post({type:'text-result',id:message.id,error:String(error)});});return;
   }
   if(message.type==='svg'){
    void this.svg(message.url,{width:message.width,height:message.height},this.abort.signal).then(bitmap=>{
     if(this.closed){bitmap.close();return;}
     try{this.post({type:'svg-result',id:message.id,bitmap},[bitmap]);}catch(error){bitmap.close();throw error;}
    }).catch(error=>{if(!this.closed)this.post({type:'svg-result',id:message.id,error:String(error)});});return;
   }
   if(message.type==='fatal'){this.fail(Error(message.error));return;}
   const waiter=this.requests.get(message.id);this.requests.delete(message.id);
   if(!waiter){if(message.type==='picture')message.bitmap.close();return;}
   if(message.type==='error')waiter.reject(Error(message.error));else waiter.resolve(message);
  };
  this.worker.onerror=event=>this.fail(Error(event.message||'GPU worker failed'));
  this.worker.onmessageerror=()=>this.fail(Error('GPU worker message could not be decoded'));
  this.ready=boot.then(()=>this.request({type:'init',...config,scriptUrl:new URL('/api/preview-runtime/canvaskit?asset=js',baseUrl).href,wasmUrl:new URL('/api/preview-runtime/canvaskit?asset=wasm',baseUrl).href})).then(()=>{});
 }
 private post(message:GpuWorkerRequest,transfer:Transferable[]=[]){this.worker.postMessage(message,transfer);}
 private fail(error:Error){if(this.closed)return;this.rejectBoot(error);for(const waiter of this.requests.values())waiter.reject(error);this.requests.clear();this.failure(error);this.close();}
 private request(message:Omit<Extract<GpuWorkerRequest,{type:'init'}>,'id'>|Omit<Extract<GpuWorkerRequest,{type:'render'}>,'id'>):Promise<Result>{
  if(this.closed)return Promise.reject(Error('GPU worker closed'));
  const id=++this.id;return new Promise((resolve,reject)=>{this.requests.set(id,{resolve,reject});try{this.post({...message,id});}catch(error){this.requests.delete(id);reject(error);}});
 }
 async render(frame:number,generation:number=this.generation,allowReplay=this.allowReplay):Promise<WorkerPicture>{
  this.generation=generation;await this.ready;const picture=await this.request({type:'render',frame,generation,allowReplay});
  if(picture.type!=='picture')throw Error('GPU worker returned no picture');
  if(picture.timing.totalMs>100){this.slowPictures.push({frame:picture.timing.frame,resourceMs:picture.timing.resourceMs,drawMs:picture.timing.submitMs,decodes:picture.timing.videoDecodes});if(this.slowPictures.length>16)this.slowPictures.shift();}
  this.bytes=picture.bytes+this.text.bytes;this.lastPrefetch=picture.prefetch;if(picture.replay!==undefined)this.lastReplay=picture.replay;return picture;
 }
 cancelPreparation(){if(!this.closed)this.post({type:'cancel'});}
 updateScene(elements:CompositionElement[],laneOrder:readonly string[],duration:number){if(!this.closed)this.post({type:'update',elements,laneOrder,duration});}
 close(){if(this.closed)return;this.closed=true;const error=new DOMException('GPU worker closed','AbortError');this.rejectBoot(error);this.abort.abort();this.text.close();for(const waiter of this.requests.values())waiter.reject(error);this.requests.clear();this.worker.terminate();}
}
