'use client';
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { AbsoluteFill, useRenderResource, useVideoConfig } from '@/lib/frame-runtime';
import { GRID_MATTE_DEFAULTS, gridMatteCells, gridMatteFrameUrl, normalizeGridMatte, type GridMatteMask } from '@/lib/timeline/grid-matte';

export type MaskPixels = {url:string;data:Uint8ClampedArray;width:number;height:number};
const maskCache = new Map<string, {promise:Promise<MaskPixels>;pixels?:MaskPixels}>();
/** Decoded prepared mask frames, shared by grid matte and subject window (bounded LRU). */
export function cachedMaskPixels(url:string):MaskPixels|undefined { return maskCache.get(url)?.pixels; }
export function loadMask(url:string):Promise<MaskPixels> {
  const cached=maskCache.get(url);
  if(cached) {maskCache.delete(url);maskCache.set(url,cached);return cached.promise;}
  const entry:{promise:Promise<MaskPixels>;pixels?:MaskPixels}={promise:Promise.resolve(null as unknown as MaskPixels)};
  entry.promise=(async()=>{
    const image=new Image();image.crossOrigin='anonymous';image.src=url;await image.decode();
    const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
    const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Grid matte canvas unavailable');
    ctx.drawImage(image,0,0);
    const pixels={url,data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};
    entry.pixels=pixels;return pixels;
  })();
  maskCache.set(url,entry);
  while(maskCache.size>32)maskCache.delete(maskCache.keys().next().value!);
  entry.promise.catch(()=>{if(maskCache.get(url)===entry)maskCache.delete(url);});
  return entry.promise;
}

export function GridMatte({ props, sourceSeconds, children }: {props: Record<string,unknown>; sourceSeconds:number; children:ReactNode}) {
  const size=normalizeGridMatte('grid_matte_cell_size',props.grid_matte_cell_size ?? 0);
  const mask=props.grid_matte_mask as GridMatteMask | undefined;
  if (!mask || size===0 || props.grid_matte_enabled === false) return <>{children}</>;
  return <ActiveGridMatte props={props} mask={mask} sourceSeconds={sourceSeconds}>{children}</ActiveGridMatte>;
}
function ActiveGridMatte({props,mask,sourceSeconds,children}:{props:Record<string,unknown>;mask:GridMatteMask;sourceSeconds:number;children:ReactNode}) {
  const {width,height}=useVideoConfig();
  const url=gridMatteFrameUrl(mask,sourceSeconds);
  const resource=useRenderResource(`Grid matte ${url}`);
  const [loaded,setPixels]=useState<MaskPixels|null>(null);
  const pixels=maskCache.get(url)?.pixels ?? loaded;
  useEffect(()=>{
    let cancelled=false;
    loadMask(url).then(value=>{if(!cancelled)setPixels(value);}).catch(error=>{if(!cancelled)resource.fail(error);});
    // Warm a bounded lookahead so playback never blanks between PNG requests.
    const current=Math.floor((sourceSeconds-mask.source_start_seconds)*mask.fps+1e-6);
    for(let i=1;i<=8 && current+i<mask.frame_count;i++) {
      const next=`${mask.source_url}/${String(current+i).padStart(5,'0')}.png`;
      void loadMask(next).catch(()=>{}); // The owning frame reports a failed resource if visited.
    }
    return ()=>{cancelled=true;};
  },[url,resource,mask,sourceSeconds]);
  useLayoutEffect(()=>{if(pixels?.url===url)resource.done();},[pixels,url,resource]);
  const size=normalizeGridMatte('grid_matte_cell_size',props.grid_matte_cell_size);
  // Round to a near-square cell grid and share exact SVG bounds with the line overlay.
  const columns=Math.max(1,Math.round(1080/Math.max(1,size)));
  const rows=Math.max(1,Math.round(columns*mask.height/mask.width));
  const coverage=normalizeGridMatte('grid_matte_coverage',props.grid_matte_coverage??GRID_MATTE_DEFAULTS.grid_matte_coverage);
  const alpha=useMemo(()=>pixels?gridMatteCells(pixels.data,pixels.width,pixels.height,columns,rows,coverage):null,[pixels,url,columns,rows,coverage]);
  const rects=alpha?.map((a,i)=>`<rect x="${i%columns}" y="${Math.floor(i/columns)}" width="1" height="1" fill="white" fill-opacity="${a}"/>`).join('')??'';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns} ${rows}" preserveAspectRatio="none">${rects}</svg>`;
  const maskImage=`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const fit=Math.min(width/mask.width,height/mask.height), w=mask.width*fit,h=mask.height*fit;
  const opacity=normalizeGridMatte('grid_matte_line_opacity',props.grid_matte_line_opacity??GRID_MATTE_DEFAULTS.grid_matte_line_opacity);
  const line=normalizeGridMatte('grid_matte_line_width',props.grid_matte_line_width??GRID_MATTE_DEFAULTS.grid_matte_line_width)*w/1080;
  return <AbsoluteFill>
    <AbsoluteFill style={{maskImage,maskSize:`${w}px ${h}px`,maskPosition:'center',maskRepeat:'no-repeat'}}>{children}</AbsoluteFill>
    <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{position:'absolute',left:(width-w)/2,top:(height-h)/2,pointerEvents:'none',opacity}}>
      <path d={[...Array.from({length:columns+1},(_,i)=>`M${i*w/columns} 0V${h}`),...Array.from({length:rows+1},(_,i)=>`M0 ${i*h/rows}H${w}`)].join(' ')} stroke="black" strokeWidth={line} fill="none"/>
    </svg>
  </AbsoluteFill>;
}
