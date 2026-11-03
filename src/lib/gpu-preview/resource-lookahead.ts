import {quantizeVisualFrameSpan} from '../timeline/frame-quantization';
import type {GpuScene,GpuVideoLayer,GpuRasterTextLayer} from './scene';
import {gpuTextTextureKey} from './scene-draws';

/** Prewarm only the nearest still and two reusable text layouts. The full handwriting layout is reusable; animated phases remain
 * demand-driven. This never prepares a movie. */
export function planGpuResourceLookahead(scenes:Iterable<GpuScene>,fontIdentity:string,
 imageReady:(layer:GpuVideoLayer)=>boolean,textReady:(layer:GpuRasterTextLayer)=>boolean,foreground?:GpuScene){
 const foregroundImages=new Set(foreground?.layers.filter(layer=>layer.kind==='video').map(layer=>layer.source.key));
 const foregroundText=new Set(foreground?.layers.filter((layer):layer is GpuRasterTextLayer=>layer.kind==='text'||layer.kind==='caption').map(layer=>gpuTextTextureKey(layer,fontIdentity)));
 let image:GpuVideoLayer|undefined;
 const text:GpuRasterTextLayer[]=[],keys=new Set<string>();
 for(const scene of scenes){
  for(const layer of scene.layers){
   if(layer.kind==='video'){
    if(!image&&layer.source.kind==='image'&&!foregroundImages.has(layer.source.key)&&!imageReady(layer))image=layer;
   }else if(layer.kind!=='shape'&&text.length<2){
    // Handwriting rasterization first measures its completed layout. Warm that
    // reusable prerequisite rather than every future animation phase.
    const layout=layer.kind==='caption'&&layer.handwritingProgress!==undefined?{...layer,handwritingProgress:1}:layer;
    const key=gpuTextTextureKey(layout,fontIdentity);
    if(!keys.has(key)&&!foregroundText.has(key)&&!textReady(layout)){keys.add(key);text.push(layout);}
   }
  }
  if(image&&text.length===2)break;
 }
 return {image,text};
}

/** Warm one imminent 3D scene before first presentation, so its one-time context,
 * font and geometry setup does not interrupt an already-running audio clock. */
export function imminentGpuCamera(elements:readonly import('../render/composition-adapters').CompositionElement[],frame:number,fps:number){
 let next:{id:string;frame:number}|undefined;
 for(const element of elements){
  if(element.type!=='caption_text'||element.props?.styleVariant!=='camera_reveal')continue;
  const start=quantizeVisualFrameSpan(element.timeline_start,element.duration,{fps}).startFrame;
  if(start<=frame||start>frame+Math.ceil(2*fps)||next&&next.frame<=start)continue;
  next={id:element.id,frame:start};
 }
 return next;
}

/** Optional future work must neither fail nor indefinitely delay today's picture.
 * A late cache lease is released even after timeout or cancellation. */
export function warmGpuFutureResource(acquire:()=>Promise<{release():void}>,signal:AbortSignal,timeoutMs=2000):Promise<void>{
 return new Promise(resolve=>{
  const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
  const timer=setTimeout(finish,timeoutMs);
  signal.addEventListener('abort',finish,{once:true});
  if(signal.aborted){finish();return;}
  void Promise.resolve().then(acquire).then(lease=>{lease.release();},()=>{}).finally(finish);
 });
}
