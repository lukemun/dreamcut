import type {CachedFrame} from './frame-store';
import type {GpuProxySource} from './browser-frame-provider';
import {gpuSvgRasterSize} from './source';

export type GpuImageDecodeTiming={fetchMs:number;bitmapMs:number;frameMs:number};

/** Session-local encoded bytes survive decoded-frame eviction. This does not
 * resize sources or replace either preview or export source authority. */
export class GpuImageBlobCache {
 private entries=new Map<string,Blob>();
 private retained=0;
 private closed=false;
 constructor(private readonly limit=32*1024*1024){if(!Number.isSafeInteger(limit)||limit<0)throw Error('Invalid image cache budget');}
 get bytes(){return this.retained;}
 async load(source:GpuProxySource,signal:AbortSignal){
  signal.throwIfAborted();if(this.closed)throw Error('Image cache closed');
  const hit=this.entries.get(source.key);
  if(hit){this.entries.delete(source.key);this.entries.set(source.key,hit);return hit;}
  const response=await fetch(source.url,{signal,cache:'no-store'});
  if(!response.ok)throw Error(`GPU image could not load (${response.status})`);
  const blob=await response.blob();signal.throwIfAborted();
  if(this.closed)throw Error('Image cache closed');
  if(blob.size>64*1024*1024)throw Error('GPU image exceeds the encoded resource budget');
  if(blob.size<=this.limit){
   const old=this.entries.get(source.key);if(old){this.retained-=old.size;this.entries.delete(source.key);}
   while(this.retained+blob.size>this.limit){const key=this.entries.keys().next().value!;this.retained-=this.entries.get(key)!.size;this.entries.delete(key);}
   this.entries.set(source.key,blob);this.retained+=blob.size;
  }
  return blob;
 }
 close(){this.closed=true;this.entries.clear();this.retained=0;}
}

export type GpuSvgRasterizer=(url:string,box:{width:number;height:number},signal:AbortSignal)=>Promise<ImageBitmap>;

/** Browser vector rasterization, the same engine and fonts Standard's <img> uses.
 * Requires a document; a worker installs a rasterizer that asks its page. */
export async function rasterizeSvgInDocument(url:string,box:{width:number;height:number},signal:AbortSignal):Promise<ImageBitmap>{
  signal.throwIfAborted();
  if(typeof Image==='undefined')throw Error('SVG rasterization requires a document');
  const image=new Image();image.decoding='async';image.src=url;
  await image.decode();signal.throwIfAborted();
  const size=gpuSvgRasterSize(image.naturalWidth,image.naturalHeight,box);
  if(size.width*size.height*4>128*1024*1024)throw Error('GPU image exceeds the decoded resource budget');
  const canvas=new OffscreenCanvas(size.width,size.height),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('SVG raster surface unavailable');
  ctx.drawImage(image,0,0,size.width,size.height);
  return canvas.transferToImageBitmap();
}
let svgRasterizer:GpuSvgRasterizer=rasterizeSvgInDocument;
/** Worker sessions route vector stills to their page; tests may inject a fake. */
export function setGpuSvgRasterizer(rasterizer:GpuSvgRasterizer){svgRasterizer=rasterizer;}

/** Static images share the complete-frame packet and byte budget with video. */
export async function decodeGpuImage(source:GpuProxySource,signal:AbortSignal,cache?:GpuImageBlobCache):Promise<CachedFrame<VideoFrame>&{decodeTiming:GpuImageDecodeTiming}> {
  signal.throwIfAborted();
  const started=performance.now();
  if(source.raster){
    const bitmap=await svgRasterizer(source.url,source.raster,signal);
    try{
      signal.throwIfAborted();
      const rasterized=performance.now(),bytes=bitmap.width*bitmap.height*4;
      if(bytes>128*1024*1024)throw Error('GPU image exceeds the decoded resource budget');
      const frame=new VideoFrame(bitmap,{timestamp:0,duration:1,alpha:'keep'});
      return {decodeTiming:{fetchMs:0,bitmapMs:rasterized-started,frameMs:performance.now()-rasterized},sourceKey:source.key,timestampUs:0,durationUs:1,bytes,value:frame,release:()=>frame.close()};
    }finally{bitmap.close();}
  }
  const owner=cache??new GpuImageBlobCache(0);
  const blob=await owner.load(source,signal);
  signal.throwIfAborted();
  const fetched=performance.now();
  const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image',premultiplyAlpha:'none',colorSpaceConversion:'default'});
  try {
    signal.throwIfAborted();
    const bytes=bitmap.width*bitmap.height*4;
    if(bytes>128*1024*1024)throw Error('GPU image exceeds the decoded resource budget');
    const decoded=performance.now();
    const frame=new VideoFrame(bitmap,{timestamp:0,duration:1,alpha:'keep'});
    return {decodeTiming:{fetchMs:fetched-started,bitmapMs:decoded-fetched,frameMs:performance.now()-decoded},sourceKey:source.key,timestampUs:0,durationUs:1,bytes,value:frame,release:()=>frame.close()};
  }finally{bitmap.close();}
}
