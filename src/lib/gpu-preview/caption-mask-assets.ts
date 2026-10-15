import {GpuCaptionImages} from './caption-images';
import {FrameStore,type FrameLease} from './frame-store';

export async function decodeCaptionViewportMask(dataUrl:string):Promise<OffscreenCanvas>{
 const bitmap=await createImageBitmap(await (await fetch(dataUrl)).blob());
 try{const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const ctx=canvas.getContext('2d');if(!ctx)throw Error('Caption mask canvas unavailable');ctx.drawImage(bitmap,0,0);return canvas;}finally{bitmap.close();}
}
/** Fixed viewport masks are independent of moving glyph rasters. Serial decode
 * bounds transient allocation; URL identity prevents reuse after source edits. */
export class GpuCaptionMaskAssets{
 private readonly store:FrameStore<OffscreenCanvas>;
 private readonly images:GpuCaptionImages;
 private readonly abort=new AbortController();
 private tail:Promise<unknown>=Promise.resolve();
 private queued=0;
 constructor(budget=16*1024*1024,private readonly decode=decodeCaptionViewportMask,images=new GpuCaptionImages()){this.store=new FrameStore(budget);this.images=images;}
 get bytes(){return this.store.bytes+this.images.bytes;}
 async acquire(url:string,signal:AbortSignal):Promise<FrameLease<OffscreenCanvas>>{
  const combined=AbortSignal.any([signal,this.abort.signal]);combined.throwIfAborted();
  const cached=this.store.acquire(url,0);if(cached)return cached;
  if(this.queued>=32)throw Error('Caption mask dependency queue is full');this.queued++;
  const task=this.tail.catch(()=>{}).then(async()=>{
   combined.throwIfAborted();const ready=this.store.acquire(url,0);if(ready)return ready;
   const source=await this.images.acquire(url,combined);let canvas:OffscreenCanvas|undefined;
   try{canvas=await this.decode(source.frame.value);combined.throwIfAborted();const value=canvas;canvas=undefined;
    if(!this.store.put({sourceKey:url,timestampUs:0,durationUs:1,bytes:value.width*value.height*4,value,release(){value.width=1;value.height=1;}}))throw Error('Caption mask exceeds cache budget');
    const lease=this.store.acquire(url,0);if(!lease)throw Error('Caption mask session closed');return lease;
   }finally{source.release();if(canvas){canvas.width=1;canvas.height=1;}}
  });this.tail=task;
  try{return await task;}finally{this.queued--;}
 }
 close(){this.abort.abort();this.images.close();this.store.close();}
}
