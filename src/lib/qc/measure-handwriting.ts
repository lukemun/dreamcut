import { getHandwritingPack, hasHandwritingPack, loadHandwritingAssets } from '../timeline/handwriting-packs';
import { layoutPreparedHandwriting } from '../timeline/prepared-handwriting';
import { captionDisplayText, resolveCaptionFontSizePx, resolveCaptionProps } from '../timeline/captions';
import { getSharedFont } from '../fonts/registry';
import type { MeasuredCaption } from './measure-captions';
/** SVG packs use source contours, not synthesized CSS font weights. */
export async function measurePreparedHandwriting(raw: Record<string, unknown>, canvasWidth: number): Promise<MeasuredCaption | null> {
 const props=resolveCaptionProps(raw), mode=props.handwritingRevealMode==='line_mask'?'line_mask':'saved_strokes';
 if(!hasHandwritingPack(props.fontPreset,mode) || (props.animationIn!=='handwriting' && props.animationOut!=='handwriting'))return null;
 await loadHandwritingAssets(props.fontPreset);
 const pack=getHandwritingPack(props.fontPreset,mode)!;
 const width=canvasWidth*props.maxWidth,size=resolveCaptionFontSizePx(props,width);
 const layout=layoutPreparedHandwriting(pack,captionDisplayText(props),props.singleLine?Infinity:width/size*pack.metrics.unitsPerEm,props.textAlign);
 const scale=Math.min(size/pack.metrics.unitsPerEm,width/layout.width);
 const bounds=layout.glyphs.filter(g=>pack.outlines[g.char]).map(g=>({left:g.x+pack.outlines[g.char].bounds[0],right:g.x+pack.outlines[g.char].bounds[2]}));
 return {width,height:layout.height*scale,lines:Math.max(1,Math.round(layout.height/pack.metrics.lineHeight)),loadedFamily:`${getSharedFont(props.fontPreset).family} · saved 400-weight contours`,inkWidth:bounds.length?(Math.max(...bounds.map(b=>b.right))-Math.min(...bounds.map(b=>b.left)))*scale+2*props.handwritingWeight*size/100:0};
}
