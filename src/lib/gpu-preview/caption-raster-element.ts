import type {GpuCaptionLayer} from './scene';

/** Static layout stays with CaptionSequence; only compositor-owned motion is neutralized. */
export function gpuCaptionRasterElement(layer:GpuCaptionLayer,images?:ReadonlyMap<string,string>){
 if(layer.specialMotion?.kind==='scan')return {...layer.element,props:{...layer.element.props,scan_reveal_start_y:.5,scan_reveal_end_y:.5}};
 return {...layer.element,props:{...layer.element.props,text_mask_url:undefined,
   // Wall keeps its embossed shadow; its complete transform/filter/opacity
   // wrapper is evaluated once by the compositor against the real backdrop.
   ...(layer.specialMotion?.kind!=='ticker'&&layer.text.surfaceMode==='wall'&&layer.text.styleVariant!=='camera_reveal'?{surfaceBlendMode:'normal',surfaceDepthPx:0,surfaceRotateXDeg:0,surfaceRotateYDeg:0,surfaceRotateZDeg:0,surfaceSkewXDeg:0,surfaceSkewYDeg:0,surfaceOpacity:1,surfaceBlurPx:0,textScaleX:1,textScaleY:1}:{}),
   // Position channels are evaluated by the compositor, never baked into glyphs.
   media_offset_x:0,media_offset_y:0,keyframes:{...(layer.element.props?.keyframes as Record<string,unknown>??{}),media_offset_x:[],media_offset_y:[]},
   ...(layer.fill?.kind==='images'?{mediaFillUrls:layer.text.mediaFillUrls.map(url=>images?.get(url)??'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E')}:{}),
   ...(layer.fill&&layer.handwritingProgress===1?{...(layer.text.animationIn==='handwriting'?{animationInDuration:0}:{}),...(layer.text.animationOut==='handwriting'?{animationOut:'none'}:{})}:{}),
   ...(layer.text.styleVariant==='inverse'?{inverseMaskMotion:'none'}:{}),
   ...(['fade','slide_up','slide_down','slide_left','slide_right','pop','spring_pop','rotate_in','focus_settle','drop_in'].includes(layer.text.animationIn)?{animationIn:'none'}:{}),
   ...(['fade','slide_up','slide_down','slide_left','slide_right','word_fade','word_rise','word_pop','pop','spring_pop','rotate_in','focus_settle','drop_in'].includes(layer.text.animationOut)?{animationOut:'none'}:{}),
   ...(layer.revealProgress!==undefined&&layer.handwritingProgress===1&&layer.text.animationIn==='handwriting'?{animationInDuration:0}:{}),
   ...((layer.wordProgress!==undefined||layer.revealProgress!==undefined)&&layer.handwritingProgress===1&&layer.text.animationOut==='handwriting'?{animationOutDuration:0}:{})}};
}
