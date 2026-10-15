import {currentFrameRate} from '@/lib/timeline/frame-rate-scope';
import {captionDisplayText,type CaptionElementProps} from '../timeline/captions';
import {COMPOSITION_FPS} from '../timeline/frame-quantization';
import {LETTER_FALL_ORDERS,LETTER_FALL_PROPS,letterFallRasterElapsed,readLetterFall} from '../timeline/letter-fall';

/** Letter fall on CanvasKit: the caption raster re-renders the shared
 * CaptionSequence/LetterFallText owner at the exact clip frame, so glyph offsets
 * are Standard's own values. The raster cache keys on the shared fall clock. */
export const GPU_LETTER_FALL_PROPS:ReadonlySet<string>=new Set(LETTER_FALL_PROPS);

// Combinations whose GPU branch reorganizes the caption raster (separate fill,
// reveal or ticker layout) have no letter-fall frame proof. Fail closed.
const UNPROVEN_ANIMATIONS=new Set(['handwriting','write_on','scan_reveal_down','word_fade','word_rise','word_pop']);

export function gpuLetterFallIssue(raw:Record<string,unknown>|null|undefined,text:CaptionElementProps):string|null{
 if(!raw||!LETTER_FALL_PROPS.some(key=>raw[key]!=null))return null;
 const finite=(key:string,min:number,exclusive=false)=>raw[key]==null||(typeof raw[key]==='number'&&Number.isFinite(raw[key])&&(exclusive?raw[key]>min:raw[key]>=min));
 if(!finite('letter_fall_start_seconds',0)||!finite('letter_fall_seconds',0,true)||!finite('letter_fall_stagger_seconds',0)
   ||raw.letter_fall_order!=null&&!(LETTER_FALL_ORDERS as readonly unknown[]).includes(raw.letter_fall_order))return 'Invalid letter-fall timing or order.';
 if(!readLetterFall(raw))return null;
 // Scan lines and camera titles precede caption layout in both renderers; the fall is inert there.
 if(raw.scan_reveal_line===true||text.styleVariant==='camera_reveal')return null;
 if(raw.surface_track)return 'Letter fall on tracked surface text has no GPU frame proof.';
 if(raw.ticker_motion==='crawl_left')return 'Letter fall on ticker text has no GPU frame proof.';
 if(text.surfaceMode==='wall')return 'Letter fall on wall-surface text has no GPU frame proof.';
 if(text.styleVariant==='image_fill')return 'Letter fall on image-filled text has no GPU frame proof.';
 if([text.animationIn,text.animationOut].some(preset=>UNPROVEN_ANIMATIONS.has(preset)))return 'Letter fall combined with reveal or per-word animation has no GPU frame proof.';
 return null;
}

/** Raster-reuse clock for an admitted caption, or undefined when the fall is off. */
export function gpuLetterFallElapsed(raw:Record<string,unknown>|null|undefined,text:CaptionElementProps,rasterFrame:number):number|undefined{
 const fall=readLetterFall(raw);
 // CaptionSequence evaluates its clip clock at the composition rate.
 return fall?letterFallRasterElapsed(captionDisplayText(text),fall,rasterFrame/currentFrameRate()):undefined;
}
