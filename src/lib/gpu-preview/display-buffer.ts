import type {PreviewQuality} from "../preview-quality";
/** Finished delivery pictures held for the forward runway and replay (about 1 s at 1080p). */
export const GPU_DISPLAY_BUFFER_BYTES=256*1024*1024;
/** Composition retains selected resolution. Cached delivery pictures need only
 * cover the displayed physical pixels; fullscreen recomputes this contract. */
export function gpuDisplayBuffer(width:number,height:number,displayWidth:number,displayHeight:number,pixelRatio:number,fps:number){
 if(![width,height,displayWidth,displayHeight,pixelRatio,fps].every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid GPU display size');
 const scale=Math.min(1,displayWidth*pixelRatio/width,displayHeight*pixelRatio/height);
 const deliveryWidth=Math.max(1,Math.ceil(width*scale)),deliveryHeight=Math.max(1,Math.ceil(height*scale));
 const bytes=deliveryWidth*deliveryHeight*4;
 return {deliveryWidth,deliveryHeight,capacity:Math.max(1,Math.min(Math.ceil(fps*2),Math.floor(GPU_DISPLAY_BUFFER_BYTES/bytes)))};
}

/** A GPU preview session keeps its pixel scale and picture budget; any other display size is
 * applied to the running worker (`GpuWorkerClient.resize`) instead of starting a new one. */
export function gpuDisplaySessionKey(display:{pixelScale:number;capacity:number}){return `${display.pixelScale}:${display.capacity}`;}

let softwareDrawing:boolean|undefined;
/** WebGL drawing on the CPU (no usable graphics card): Chrome's SwiftShader, Windows' basic display driver, llvmpipe. */
export function drawsInSoftware(){
 if(softwareDrawing!==undefined)return softwareDrawing;
 try{
  const gl=new OffscreenCanvas(1,1).getContext('webgl2'),info=gl?.getExtension('WEBGL_debug_renderer_info');
  softwareDrawing=Boolean(gl&&/swiftshader|basic render driver|llvmpipe|softpipe|software/i.test(String(gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER))));
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
 }catch{softwareDrawing=false;}
 return softwareDrawing;
}
/** Software drawing costs per pixel, so the preview composites at half size there unless the creator
 * chose Full HD or 4K playback. Export always renders at full size. */
export function previewPixelScale(width:number,height:number,quality:PreviewQuality,software=drawsInSoftware()){
 return software&&quality!=='hd'&&quality!=='uhd'&&width%2===0&&height%2===0?0.5:1;
}
