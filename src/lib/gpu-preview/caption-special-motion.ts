import {captionAnimationProgress} from '../timeline/caption-animation-progress';
import {captionScanLine,captionTickerProgress} from '../timeline/caption-special-motion';
import type {CaptionElementProps} from '../timeline/captions';

/** Legacy renderer branches precede ordinary caption layout, including camera titles. */
export function gpuCaptionSpecialMotion(raw:Record<string,unknown>|null|undefined,text:CaptionElementProps,frame:number,duration:number,fps:number){
 const progress=captionAnimationProgress(text,frame,duration,fps);
 if(raw?.scan_reveal_line===true)return {kind:'scan' as const,...captionScanLine(raw,progress.inProgress)};
 if(raw?.ticker_motion==='crawl_left'&&text.styleVariant!=='camera_reveal')return {kind:'ticker' as const,progress:captionTickerProgress(frame,progress.durationInFrames)};
 return undefined;
}
export const GPU_CAPTION_SPECIAL_PROPS=new Set(['ticker_motion','scan_reveal_line','scan_reveal_start_y','scan_reveal_end_y','scan_reveal_line_height_px','scan_reveal_line_width']);
