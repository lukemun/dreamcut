import {currentFrameRate} from './frame-rate-scope';
import {COMPOSITION_FPS,quantizeVisualFrameSpan,toVisualFrame} from './frame-quantization';
import {interpolate} from '../frame-runtime/math';

/** Shared caption-local clock. Zero-length entrances are complete; zero-length
 * exits leave the picture visible until its half-open clip boundary. */
export function captionAnimationProgress(props:{animationInDuration:number;animationOutDuration:number},frame:number,duration:number,fps: number = currentFrameRate()){
  const span=quantizeVisualFrameSpan(0,duration,{fps,minFrames:1});
  const durationInFrames=Math.max(1,span.durationFrames);
  const inFrames=Math.max(0,toVisualFrame(props.animationInDuration,fps));
  const outFrames=Math.max(0,toVisualFrame(props.animationOutDuration,fps));
  return {durationInFrames,
    inProgress:inFrames>0?interpolate(frame,[0,inFrames],[0,1],{extrapolateRight:'clamp'}):1,
    outProgress:outFrames>0?interpolate(frame,[durationInFrames-outFrames,durationInFrames],[0,1],{extrapolateLeft:'clamp'}):0};
}

/** Shared inverse-caption drift and sweep clock, including one-frame captions. */
export function captionInverseProgress(frame:number,durationInFrames:number){
 const timeline=durationInFrames>1?Math.min(1,Math.max(0,frame/(durationInFrames-1))):1;
 return {timeline,motion:.5-Math.cos(timeline*Math.PI)/2};
}
