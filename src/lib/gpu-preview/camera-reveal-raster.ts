import {createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Texture} from 'three';
import {FrameContext, FrameSession} from '../frame-runtime';
import {PerspectiveTitleRevealFrame} from '../remotion/PerspectiveTitleReveal';
import {ensureRequiredRemotionFonts} from '../remotion/google-fonts';
import {getSharedFont} from '../fonts/registry';
import {captionRemotionFontFamily} from '../timeline/captions';
import {cameraRevealBlurPixels} from '../timeline/camera-reveal';
import {GpuCaptionImages} from './caption-images';
import {setGpuTextAnchor,setGpuTextBounds} from './text-bounds';
import type {GpuCaptionLayer} from './scene';

/** One persistent, session-owned 3D stage. Never publishes its mutable canvas:
 * callers receive an immutable copy only after font, texture and draw readiness.
 * Admission stays gated until this adapter has passed the visual contract. */
export class GpuCameraRevealRaster {
 private root?:Root;
 private host?:HTMLDivElement;
 private session=new FrameSession();
 private images=new GpuCaptionImages();
 private textures:Texture[]=[];
 private textureKey='';
 private textureBytes=0;
 private tail:Promise<unknown>=Promise.resolve();
 private abort=new AbortController();
 private closed=false;
 constructor(private readonly outputScale=1){}
 get bytes(){return this.images.bytes+this.textureBytes+(this.host?.querySelector('canvas')?.width??0)*(this.host?.querySelector('canvas')?.height??0)*4;}
 raster(layer:GpuCaptionLayer,signal:AbortSignal):Promise<OffscreenCanvas>{
  const operation=this.tail.catch(()=>{}).then(()=>this.draw(layer,AbortSignal.any([signal,this.abort.signal])));
  this.tail=operation;return operation;
 }
 private async loadTextures(urls:readonly string[],signal:AbortSignal){
  const key=JSON.stringify(urls);if(key===this.textureKey&&this.textures.length)return;
  const next:Texture[]=[];let bytes=0;
  try{
   for(const url of urls){
    const lease=await this.images.acquire(url,signal);
    try{
     const image=new Image();image.src=lease.frame.value;await image.decode();signal.throwIfAborted();
     bytes+=image.naturalWidth*image.naturalHeight*8;
     if(bytes>64*1024*1024)throw Error('Camera reveal textures exceed their decoded budget');
     const texture=new Texture(image);texture.generateMipmaps=false;texture.needsUpdate=true;next.push(texture);
    }finally{lease.release();}
   }
   if(!next.length){const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#000';ctx.fillRect(0,0,1,1);const texture=new Texture(canvas);texture.needsUpdate=true;next.push(texture);bytes=4;}
   signal.throwIfAborted();
   for(const texture of this.textures)texture.dispose();
   this.textures=next;this.textureKey=key;this.textureBytes=bytes;
  }catch(error){for(const texture of next)texture.dispose();throw error;}
 }
 private async draw(layer:GpuCaptionLayer,signal:AbortSignal){
  signal.throwIfAborted();if(this.closed)throw Error('Camera reveal stage closed');
  const width=Math.ceil(layer.planeWidth),height=Math.ceil(layer.planeHeight);
  const s=this.outputScale,outputWidth=Math.ceil(width*s),outputHeight=Math.ceil(height*s);
  if(width<1||height<1||outputWidth>4096*s||outputHeight>4096*s||outputWidth*outputHeight*4>16*1024*1024*s*s)throw Error('Camera reveal target exceeds GPU budget');
  await ensureRequiredRemotionFonts([getSharedFont(layer.text.fontPreset).family]);
  await document.fonts.load(`${layer.text.cameraRevealFontWeight} 160px ${captionRemotionFontFamily(layer.text.fontPreset)}`,layer.text.text);
  signal.throwIfAborted();await this.loadTextures(layer.text.mediaFillUrls,signal);signal.throwIfAborted();
  if(!this.host){
   this.host=document.createElement('div');this.host.dataset.gpuCameraRevealStage='';
   this.host.style.cssText='position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:strict;';
   document.body.append(this.host);this.root=createRoot(this.host);
  }
  this.host.style.width=`${width}px`;this.host.style.height=`${height}px`;
  const source=await new Promise<HTMLCanvasElement>((resolve,reject)=>{
   const finish=(error?:unknown,canvas?:HTMLCanvasElement)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(canvas!);};
   const abort=()=>finish(signal.reason);
   const timer=setTimeout(()=>finish(Error('Camera reveal draw timed out')),30000);
   signal.addEventListener('abort',abort,{once:true});
   try{
    signal.throwIfAborted();
    flushSync(()=>this.root!.render(createElement(FrameContext.Provider,{value:{frame:layer.rasterFrame,fps:layer.fps,width,height,durationInFrames:Math.max(1,Math.round(layer.element.duration*layer.fps)),rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session:this.session}},
     createElement(PerspectiveTitleRevealFrame,{props:layer.text,frame:layer.rasterFrame,textures:this.textures,pixelRatio:s,onFrameReady:canvas=>finish(undefined,canvas)}))));
   }catch(error){finish(error);}
  });
  signal.throwIfAborted();if(this.session.error)throw this.session.error;
  const output=new OffscreenCanvas(outputWidth,outputHeight),context=output.getContext('2d');
  if(!context)throw Error('Camera reveal output is unavailable');
  const blur=cameraRevealBlurPixels({props:layer.text,frame:layer.rasterFrame,fps:layer.fps})*s;
  if(blur>0){context.filter=`blur(${blur}px)`;context.translate(outputWidth/2,outputHeight/2);context.scale(1.002,1.002);context.translate(-outputWidth/2,-outputHeight/2);}
  context.drawImage(source,0,0,outputWidth,outputHeight);setGpuTextAnchor(output,[width/2,height/2]);
  if(s!==1)setGpuTextBounds(output,{x:0,y:0,width,height});
  return output;
 }
 close(){
  if(this.closed)return;this.closed=true;this.abort.abort();this.root?.unmount();this.host?.remove();
  this.root=undefined;this.host=undefined;this.session.dispose();this.images.close();
  for(const texture of this.textures)texture.dispose();this.textures=[];this.textureBytes=0;
 }
}
