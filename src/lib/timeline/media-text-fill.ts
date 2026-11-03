import {mediaTime} from '../frame-runtime/math';

/** Shared source clock for ordinary background text and handwriting masks.
 * The renderers intentionally retain their different image blend/pan geometry. */
export function mediaTextImagePhase(count:number,localSeconds:number,secondsPerImage:number,crossfadeSeconds:number){
 if(!Number.isSafeInteger(count)||count<0||![localSeconds,secondsPerImage,crossfadeSeconds].every(Number.isFinite))throw Error('Invalid media-text image clock');
 if(count===0)return null;
 const hold=Math.max(.15,secondsPerImage),slot=Math.max(0,localSeconds)/hold;
 const ordinal=Math.floor(slot),progress=slot-ordinal,currentIndex=ordinal%count,nextIndex=(currentIndex+1)%count;
 const fadeFraction=Math.min(.95,Math.max(0,crossfadeSeconds)/hold);
 return {currentIndex,nextIndex,progress,nextOpacity:fadeFraction>0?Math.max(0,Math.min(1,(progress-(1-fadeFraction))/fadeFraction)):0};
}

/** Scene offset is quantized once, exactly as the frame-runtime video trim.
 * Local playback then advances continuously at the authored source rate. */
export function mediaTextVideoClock(frame:number,fps:number,sceneOffsetSeconds=0,playbackRate=1){
 if(![frame,fps,sceneOffsetSeconds,playbackRate].every(Number.isFinite)||fps<=0||sceneOffsetSeconds<0||playbackRate<=0)throw Error('Invalid media-text video clock');
 const trimBefore=Math.round(sceneOffsetSeconds*fps*playbackRate);
 return {trimBefore,sourceTimeSeconds:mediaTime(frame,fps,trimBefore,playbackRate)};
}

/** CSS background positioning and handwriting image translation deliberately use
 * different units and blending. Share both recipes rather than approximating one. */
export function mediaTextImageMotion(phase:NonNullable<ReturnType<typeof mediaTextImagePhase>>,scaleValue:number,panPercent:number,mode:'background'|'handwriting'){
 const scale=Math.max(1,scaleValue),direction=phase.currentIndex%2===0?1:-1,nextDirection=phase.nextIndex%2===0?1:-1;
 return {scale,currentOpacity:mode==='handwriting'?1:1-phase.nextOpacity,nextOpacity:phase.nextOpacity,
  positionX:(mode==='handwriting'?(phase.progress*2-1)*(Math.max(-50,Math.min(50,panPercent))/50)*(scale-1)/2*direction:50+direction*((phase.progress*2-1)*panPercent))||0,
  nextPositionX:mode==='handwriting'?0:50-nextDirection*panPercent};
}
