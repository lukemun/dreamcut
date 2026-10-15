import {resolveActiveWordIndex,resolveSingleWordScaleX,validateWordTimings} from '../timeline/active-word-captions';
import type {CaptionElementProps} from '../timeline/captions';

/** Shared speech clock; stable holds reuse glyphs, word squeezes retain their phase. */
export function gpuCaptionSpeechPhase(text:CaptionElementProps,duration:number,frame:number,fps:number){
 if(text.timingMode==='phrase')return undefined;
 const validation=validateWordTimings(text.text,duration,text.wordTimings,fps);
 // CaptionSequence falls back to the literal phrase for invalid timing.
 if(validation.findings.length)return undefined;
 const seconds=frame/fps,index=resolveActiveWordIndex(validation.timings,seconds);
 return {index,scaleX:text.timingMode==='single_word'&&index>=0?resolveSingleWordScaleX(validation.timings[index]!,seconds,text.singleWordFlipSeconds):1};
}
