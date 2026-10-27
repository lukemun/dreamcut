import {setGpuTickerWidth} from './text-bounds';
import {gpuCaptionRasterElement} from './caption-raster-element';
import {HandwritingFillMaskContext} from '../remotion/HandwritingImageFill';
import type {ProjectionRect} from '../timeline/source-projection';
import {setGpuTextBounds,setGpuTextAnchor,setGpuTextFillRegions,setGpuTextRasterScale,textAlphaBounds} from './text-bounds';
import type {CSSProperties} from 'react';
import {createElement} from 'react';
import {FrameContext,FrameSession} from '../frame-runtime';
import {CaptionSequence} from '../remotion/TimelineComposition';
import {getSharedFont} from '../fonts/registry';
import {embeddedRenderFontCss} from '../remotion/google-fonts';
import {surfaceTextLayout} from '../timeline/surface-text-layout';
import {captionHandwritingAssetKey,loadHandwritingAssets} from '../timeline/handwriting-packs';
import {resolveCaptionProps} from '../timeline/captions';
import type {GpuRasterTextLayer} from './scene';

function applyStyle(node:HTMLElement,style:CSSProperties){
 const unitless=new Set(['opacity','fontWeight','lineHeight','zIndex','flexGrow','flexShrink']);
 for(const [key,value] of Object.entries(style)){
  if(value==null)continue;
  node.style.setProperty(key.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`),typeof value==='number'&&!unitless.has(key)?`${value}px`:String(value));
 }
}

/** Uses browser CSS shaping/wrapping, not a second Canvas fillText layout algorithm. */
/** `outputScale` supersamples for 2K/4K export: rasters hold that many pixels per
 * logical pixel, and every bound, anchor and region they report stays logical. */
export async function rasterGpuText(layer:GpuRasterTextLayer,signal:AbortSignal,region?:ProjectionRect,images?:ReadonlyMap<string,string>,outputScale=1):Promise<OffscreenCanvas>{
 signal.throwIfAborted();
 if(layer.kind==='caption'&&layer.fill?.kind==='images'&&layer.fill.layers.some(item=>!images?.has(item.url)))throw Error('Caption fill image dependency is missing');
 const width=Math.ceil(layer.planeWidth),height=Math.ceil(layer.planeHeight);
 if(width<1||height<1||width>4096||height>4096||width*height*4>16*1024*1024)throw Error('Tracked-text texture exceeds the GPU preview budget');
 const css=await embeddedRenderFontCss(getSharedFont(layer.text.fontPreset).family);
 signal.throwIfAborted();
 const plane=document.createElementNS('http://www.w3.org/1999/xhtml','div');
 plane.setAttribute('data-gpu-caption-measure','');
 if(layer.kind==='caption'){
  // Block fades/slides reuse glyph pixels; word entrances retain the production
  // per-word renderer. Word exits are block fades applied once by the GPU.
  const rasterElement=gpuCaptionRasterElement(layer,images);
  const {renderToStaticMarkup}=await import('react-dom/server.browser');
  // Static markup cannot wait on frame resources: load the stroke pack first.
  const handwritingKey=captionHandwritingAssetKey({...resolveCaptionProps(rasterElement.props??{}),...(layer.handwritingProgress!==undefined?{animationIn:'handwriting'}:{})});
  if(handwritingKey)await loadHandwritingAssets(handwritingKey);
  signal.throwIfAborted();
  applyStyle(plane,{position:'relative',width:layer.planeWidth,height:layer.planeHeight,lineHeight:1.5});
  // Reuse the production caption component and CSS shaping, including anchors,
  // wrapping and style. Fade opacity is applied separately; handwriting retains
  // the production reveal inside this raster.
  const session=new FrameSession();
  try{
   plane.innerHTML=renderToStaticMarkup(createElement(FrameContext.Provider,{value:{frame:layer.specialMotion===undefined&&layer.speechPhase===undefined&&layer.fill===undefined&&layer.inverseProgress===undefined&&layer.handwritingProgress===1&&layer.wordProgress===undefined&&layer.typedCharacters===undefined&&layer.revealProgress===undefined&&layer.letterFallElapsed===undefined?0:layer.rasterFrame,fps:layer.fps,width:layer.planeWidth,height:layer.planeHeight,durationInFrames:Math.max(1,Math.round(layer.element.duration*layer.fps)),rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},
    createElement(HandwritingFillMaskContext.Provider,{value:layer.fill?.kind==='video'},createElement(CaptionSequence,{element:layer.specialMotion===undefined&&layer.speechPhase===undefined&&layer.fill===undefined&&layer.inverseProgress===undefined&&layer.handwritingProgress===1&&layer.wordProgress===undefined&&layer.typedCharacters===undefined&&layer.revealProgress===undefined&&layer.letterFallElapsed===undefined?{...rasterElement,props:{...rasterElement.props,animationIn:'handwriting',animationOut:'none',animationInDuration:0,animationOutDuration:0}}:rasterElement,sourceAspectRatio:layer.sourceAspectRatio??null,renderScale:1,tickerRaster:layer.specialMotion?.kind==='ticker'}))));
  }finally{session.dispose();}
 }else{
  const layout=surfaceTextLayout(layer.planeWidth,layer.planeHeight,layer.text);
  applyStyle(plane,layout.plane);plane.style.position='relative';
  const inner=document.createElementNS('http://www.w3.org/1999/xhtml','div');applyStyle(inner,layout.text);inner.textContent=layer.text.text;plane.append(inner);
 }
 const style=document.createElementNS('http://www.w3.org/1999/xhtml','style');style.textContent=`[data-gpu-caption-measure],[data-gpu-caption-measure] *{box-sizing:border-box;-webkit-font-smoothing:antialiased;} ${css}`;plane.prepend(style);
 let fillRegions:import('./text-bounds').GpuTextFillRegion[]|undefined;
 let anchor:readonly[number,number]|undefined;
 let subpixel:readonly[number,number]=[0,0];
 let tickerWidth:number|undefined,tickerExtent:{left:number;right:number}|undefined;
 if(layer.kind==='caption'&&layer.specialMotion?.kind!=='scan'&&(layer.specialMotion?.kind==='ticker'||layer.text.surfaceMode==='wall'||layer.fill?.kind==='video'||layer.text.rotationDeg!==0||[layer.text.animationIn,layer.text.animationOut].some(p=>['pop','spring_pop','rotate_in','focus_settle'].includes(p)))){
  const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout;';
  host.append(plane);document.body.append(host);
  try{
   const actor=plane.querySelector<HTMLElement>('[style*="transform-origin"]');
   if(!actor)throw Error('Caption transform anchor is unavailable');
   actor.getBoundingClientRect();await document.fonts.ready;signal.throwIfAborted();
   const rect=actor.getBoundingClientRect(),origin=plane.getBoundingClientRect();
   anchor=[rect.x+rect.width/2-origin.x,rect.y+rect.height/2-origin.y];
   // Standard's retained motion layer (captionMotionLayerActive) rasterizes the actor
   // without the fractional part of its transform translation and resamples that
   // remainder at composite time. Raster at the snapped translation; the remainder is
   // carried in the raster bounds so the compositor resamples the same pixels.
   if(layer.kind==='caption'&&layer.motionLayer){
    const matrix=new DOMMatrix(getComputedStyle(actor).transform);
    subpixel=[matrix.e-Math.round(matrix.e),matrix.f-Math.round(matrix.f)];
    matrix.e=Math.round(matrix.e);matrix.f=Math.round(matrix.f);actor.style.transform=matrix.toString();
   }
   if(layer.specialMotion?.kind==='ticker'){tickerWidth=parseFloat(getComputedStyle(actor).width);tickerExtent={left:rect.x-origin.x,right:rect.right-origin.x};}
   if(layer.fill?.kind==='video')fillRegions=Array.from(plane.querySelectorAll<HTMLElement>('[data-handwriting-image-fill]')).map(node=>{const r=node.getBoundingClientRect(),v=node.querySelector<HTMLElement>('[data-video-fill-mask]')!.getBoundingClientRect();return {x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height,videoRect:{x:v.x-origin.x,y:v.y-origin.y,width:v.width,height:v.height}};});
  }finally{plane.remove();host.remove();}
 }
 const html=new XMLSerializer().serializeToString(plane);
 // A fractional CSS plane occupies a conservatively rounded texture. Do not
 // stretch its glyphs to fill that storage: preserve one raster pixel per CSS
 // pixel and let the tracked-plane projection account for the unused edge.
 // Keep ink just outside the neutral viewport when a slide can bring it into
 // view. Padding covers overlapping entrance/exit translations as well.
 const presets=layer.kind==='caption'?[layer.text.animationIn,layer.text.animationOut]:[];
 const inverseDrift=layer.kind==='caption'&&layer.text.styleVariant==='inverse'&&layer.text.inverseMaskMotion==='drift'?{x:Math.abs(layer.text.inverseMaskDriftXPercent)/200*width,y:Math.abs(layer.text.inverseMaskDriftYPercent)/200*height}:{x:0,y:0};
 const padX=Math.ceil(inverseDrift.x+presets.filter(p=>p==='slide_left'||p==='slide_right').length*width*.08);
 const padY=Math.ceil(inverseDrift.y+presets.filter(p=>p==='slide_up'||p==='slide_down').length*height*.05+presets.filter(p=>p==='drop_in').length*height*(layer.kind==='caption'?layer.text.dropInDistanceRatio:0));
 const left=tickerExtent?Math.min(-padX,tickerExtent.left-32):-padX;
 const right=tickerExtent?Math.max(width+padX,tickerExtent.right+32):width+padX;
 const crop=region??{x:Math.floor(left),y:-padY,width:Math.ceil(right)-Math.floor(left),height:height+2*padY};
 // Tracked surface text rasterizes at Chrome's ideal contents scale for its projected plane.
 const rasterScale=(layer.kind==='text'&&!region?layer.rasterScale:1)*outputScale;
 const rasterWidth=Math.ceil(crop.width*rasterScale),rasterHeight=Math.ceil(crop.height*rasterScale);
 if(rasterWidth>4096*outputScale||rasterHeight>4096*outputScale||rasterWidth*rasterHeight*4>16*1024*1024*outputScale*outputScale)throw Error('Caption motion raster exceeds the GPU preview budget');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${rasterWidth}" height="${rasterHeight}" viewBox="${crop.x} ${crop.y} ${rasterWidth/rasterScale} ${rasterHeight/rasterScale}"><foreignObject overflow="visible" width="${layer.planeWidth}" height="${layer.planeHeight}">${html}</foreignObject></svg>`;
 const image=new Image();image.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
 try{
  await image.decode();signal.throwIfAborted();
  const canvas=new OffscreenCanvas(rasterWidth,rasterHeight),context=canvas.getContext('2d');
  if(!context)throw Error('Tracked-text canvas is unavailable');
  context.drawImage(image,0,0);
  if(tickerWidth!==undefined)setGpuTickerWidth(canvas,tickerWidth);
  if(region){if(fillRegions)setGpuTextFillRegions(canvas,fillRegions);setGpuTextBounds(canvas,region);if(anchor)setGpuTextAnchor(canvas,anchor);return canvas;}
  if(layer.kind!=='caption'){if(outputScale!==1)setGpuTextRasterScale(canvas,rasterScale);return canvas;}
  const rect=textAlphaBounds(context.getImageData(0,0,rasterWidth,rasterHeight).data,rasterWidth,rasterHeight);
  const cropped=new OffscreenCanvas(rect.width,rect.height),target=cropped.getContext('2d');
  if(!target)throw Error('Caption crop canvas is unavailable');
  target.drawImage(canvas,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
  setGpuTextBounds(cropped,rasterScale===1?{...rect,x:rect.x+crop.x+subpixel[0],y:rect.y+crop.y+subpixel[1]}
   :{x:rect.x/rasterScale+crop.x+subpixel[0],y:rect.y/rasterScale+crop.y+subpixel[1],width:rect.width/rasterScale,height:rect.height/rasterScale});canvas.width=1;canvas.height=1;
  if(anchor)setGpuTextAnchor(cropped,anchor);
  if(tickerWidth!==undefined)setGpuTickerWidth(cropped,tickerWidth);
  if(fillRegions)setGpuTextFillRegions(cropped,fillRegions);
  return cropped;
 }finally{image.src='';}
}
