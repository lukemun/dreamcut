import {resolveActiveWordIndex,resolveSingleWordScaleX,validateWordTimings} from '../timeline/active-word-captions';
import {captionReadingSignature,captionReadingStatesActive,captionSpeechWordEntrance,captionSpeechWords} from '../timeline/caption-reading-states';
import {wordMarkerSignature} from '../timeline/caption-word-marker';
import type {CaptionElementProps} from '../timeline/captions';

/** Shared speech clock; stable holds reuse glyphs, word squeezes retain their phase.
 * `reading` fingerprints reading states and speech word entrances, so a caption re-rasters
 * only while a word is changing state. */
export function gpuCaptionSpeechPhase(text:CaptionElementProps,duration:number,frame:number,fps:number){
 const speechWords=captionSpeechWords(text,duration,fps),states=captionReadingStatesActive(text)?text:null,entrance=captionSpeechWordEntrance(text);
 let reading=speechWords&&(states||entrance)?captionReadingSignature(speechWords,frame/fps,states,entrance):undefined;
 const markerWords=text.wordMarker==='none'?null:speechWords??(text.timingMode==='single_word'?validTimings(text,duration,fps):null);
 if(markerWords)reading=`${reading??''}#${wordMarkerSignature(text,markerWords,frame/fps,text.speakingWordHoldsGap)}`;
 if(text.timingMode==='phrase')return reading===undefined?undefined:{index:-1,scaleX:1,reading};
 const validation=validateWordTimings(text.text,duration,text.wordTimings,fps);
 // CaptionSequence falls back to the literal phrase for invalid timing.
 if(validation.findings.length)return undefined;
 const seconds=frame/fps,index=resolveActiveWordIndex(validation.timings,seconds);
 return {index,scaleX:text.timingMode==='single_word'&&index>=0?resolveSingleWordScaleX(validation.timings[index]!,seconds,text.singleWordFlipSeconds):1,...(reading===undefined?{}:{reading})};
}

/** Word entrances follow the speech (speechPhase) instead of the block's entrance clock. */
export function gpuCaptionSpeechEntrance(text:CaptionElementProps,duration:number,fps:number){
 return captionSpeechWords(text,duration,fps)!==null&&captionSpeechWordEntrance(text)!==null;
}

function validTimings(text:CaptionElementProps,duration:number,fps:number){
 const validation=validateWordTimings(text.text,duration,text.wordTimings,fps);
 return validation.findings.length?null:validation.timings;
}
