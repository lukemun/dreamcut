import {currentFrameRate} from './frame-rate-scope';
import type {TimelineTransition} from '../../components/studio/timeline/types';
import {Easing,interpolate} from '../frame-runtime/math';
import {COMPOSITION_FPS,toVisualFrame} from './frame-quantization';
import {remapTransitionProgressAfterHold} from './transitions';

/** Shared transition-local clock. The overlap ends immediately before the
 * incoming clip starts; it never shifts that clip or resets its source clock. */
export function transitionProgress(frame:number,transition:TimelineTransition|null|undefined,durationInFrames:number,fps: number = currentFrameRate()){
  if(!transition)return null;
  const transitionFrames=Math.max(1,toVisualFrame(transition.duration_seconds,fps));
  const bezier=transition.params?.bezier;
  const easing=Array.isArray(bezier)&&bezier.length===4?Easing.bezier(bezier[0],bezier[1],bezier[2],bezier[3]):undefined;
  const raw=interpolate(frame,[0,Math.min(transitionFrames,durationInFrames)],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const held=remapTransitionProgressAfterHold(raw,transition.params?.motion_start_progress);
  return easing?easing(held):held;
}
