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
