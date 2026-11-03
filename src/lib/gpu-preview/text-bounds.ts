import type {ProjectionRect} from '../timeline/source-projection';

export type GpuTextFillRegion=ProjectionRect&{videoRect:ProjectionRect};
const fillRegions=new WeakMap<OffscreenCanvas,readonly GpuTextFillRegion[]>();
export function setGpuTextFillRegions(canvas:OffscreenCanvas,regions:readonly GpuTextFillRegion[]){fillRegions.set(canvas,regions);}
export function gpuTextFillRegions(canvas:OffscreenCanvas){return fillRegions.get(canvas);}

const anchors=new WeakMap<OffscreenCanvas,readonly[number,number]>();
export function setGpuTextAnchor(canvas:OffscreenCanvas,anchor:readonly[number,number]){anchors.set(canvas,anchor);}
export function gpuTextAnchor(canvas:OffscreenCanvas){return anchors.get(canvas);}

const bounds=new WeakMap<OffscreenCanvas,ProjectionRect>();
export function setGpuTextBounds(canvas:OffscreenCanvas,rect:ProjectionRect){bounds.set(canvas,rect);}
export function gpuTextBounds(canvas:OffscreenCanvas,width:number,height:number):ProjectionRect{
  return bounds.get(canvas)??{x:0,y:0,width,height};
}

/** Preserve every nonzero alpha pixel, including antialiasing/shadow tails. Two
 * transparent texels protect linear filtering at the cropped texture boundary. */
export function textAlphaBounds(rgba:Uint8ClampedArray,width:number,height:number):ProjectionRect{
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw Error('Invalid text pixel plane');
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>0){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<0)return {x:0,y:0,width:1,height:1};
  left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(width-1,right+2);bottom=Math.min(height-1,bottom+2);
  return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}

/** Tracked surface text pixels per logical plane pixel, when supersampled for export. */
const rasterScales=new WeakMap<OffscreenCanvas,number>();
export function setGpuTextRasterScale(canvas:OffscreenCanvas,scale:number){rasterScales.set(canvas,scale);}
export function gpuTextRasterScale(canvas:OffscreenCanvas){return rasterScales.get(canvas);}

const tickerWidths=new WeakMap<OffscreenCanvas,number>();
export function setGpuTickerWidth(canvas:OffscreenCanvas,width:number){tickerWidths.set(canvas,width);}
export function gpuTickerWidth(canvas:OffscreenCanvas){return tickerWidths.get(canvas);}
