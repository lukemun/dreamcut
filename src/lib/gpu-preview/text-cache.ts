import {GpuCameraRevealRaster} from './camera-reveal-raster';
import {GpuCaptionImages} from './caption-images';
import {FrameStore,type FrameLease} from './frame-store';
import {gpuTextTextureKey} from './scene-draws';
import {gpuTextBounds} from './text-bounds';
import {rasterGpuText} from './text-raster';
import type {GpuRasterTextLayer} from './scene';

/** Session-local, byte-bounded intermediate cache. Text motion reuses glyph pixels. */
export class GpuTextCache {
 private readonly store:FrameStore<OffscreenCanvas>;
 private pending=new Map<string,Promise<void>>();
 private closed=false;
 private cameraReveal?:GpuCameraRevealRaster;
 private readonly images=new GpuCaptionImages();
 private readonly abort=new AbortController();
 /** outputScale > 1 supersamples text for a 2K/4K export; bounds stay logical. */
 constructor(readonly fontIdentity:string,budgetBytes=32*1024*1024,readonly outputScale=1){this.store=new FrameStore(budgetBytes);}
 get bytes(){return this.store.bytes+this.images.bytes+(this.cameraReveal?.bytes??0);}
 isReady(layer:GpuRasterTextLayer){
  return this.store.has(gpuTextTextureKey(layer,this.fontIdentity),0);
 }
 async acquire(layer:GpuRasterTextLayer,signal:AbortSignal):Promise<FrameLease<OffscreenCanvas>>{
  signal.throwIfAborted();if(this.closed)throw Error('GPU text cache closed');
  const key=gpuTextTextureKey(layer,this.fontIdentity);
  const hit=this.store.acquire(key,0);if(hit)return hit;
  let pending=this.pending.get(key);
  if(!pending){
   // Immutable output can serve a newer request after the first seeker cancels.
   pending=(async()=>{
    const renderSignal=this.abort.signal;
    if(layer.kind==='caption'&&layer.handwritingProgress!==undefined&&layer.handwritingProgress!==1){
     const complete=await this.acquire({...layer,handwritingProgress:1},renderSignal);
     try{return await this.raster(layer,renderSignal,gpuTextBounds(complete.frame.value,layer.planeWidth,layer.planeHeight));}
     finally{complete.release();}
    }
    return this.raster(layer,renderSignal);
   })().then(canvas=>{
    const accepted=this.store.put({sourceKey:key,timestampUs:0,durationUs:1,bytes:canvas.width*canvas.height*4,value:canvas,
     release(){canvas.width=1;canvas.height=1;}});
    if(!accepted)throw Error('GPU text cache budget exceeded or session closed');
   }).finally(()=>this.pending.delete(key));
   this.pending.set(key,pending);
  }
  await pending;signal.throwIfAborted();
  const lease=this.store.acquire(key,0);
  if(!lease)throw Error('GPU text cache could not retain the requested layout');
  return lease;
 }
 private async raster(layer:GpuRasterTextLayer,signal:AbortSignal,region?:import('../timeline/source-projection').ProjectionRect){
  if(layer.kind==='caption'&&layer.text.styleVariant==='camera_reveal')return (this.cameraReveal??=new GpuCameraRevealRaster(this.outputScale)).raster(layer,signal);
  const leases:FrameLease<string>[]=[];
  try{
   const images=new Map<string,string>();
   if(layer.kind==='caption'&&layer.fill?.kind==='images')for(const url of new Set(layer.fill.layers.map(item=>item.url))){
    const lease=await this.images.acquire(url,signal);leases.push(lease);images.set(url,lease.frame.value);
   }
   return await rasterGpuText(layer,signal,region,images,this.outputScale);
  }finally{for(const lease of leases)lease.release();}
 }
 close(){if(this.closed)return;this.closed=true;this.abort.abort();this.images.close();this.cameraReveal?.close();this.store.close();}
}
