import {currentFrameRate} from './frame-rate-scope';
import {Easing,interpolate} from '../frame-runtime/math';
import {COMPOSITION_FPS,toVisualFrame} from './frame-quantization';
import {DROP_IN_EASING_BEZIER,resolveAnimationProps,type AnimationPreset} from './animation-presets';

export function animationStyle(
  preset: AnimationPreset,
  progress: number,
  direction: "in" | "out",
  width: number,
  height: number,
  dropInDistanceRatio = 0.45,
): {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotateZDeg?: number;
  blurPx?: number;
  clipPath?: string;
  /** Fraction (0–1) of the actor box hidden from the right edge. Captions use
   * the equivalent `clipPath`; media wrappers and GPU clip numerically. */
  wipeRight?: number;
} {
  const clamped = Math.min(1, Math.max(0, progress));
  const inverse = direction === "in" ? 1 - clamped : clamped;
  const distanceX = width * 0.08;
  const distanceY = height * 0.05;
  // Fast, polished arrival with a soft terminal settle. This matches the motion
  // curve used by the editor's native carousel transitions rather than the old
  // quadratic approximation, which could read as a mechanical stop.
  const eased = Easing.bezier(...DROP_IN_EASING_BEZIER)(clamped);

  switch (preset) {
    case "none":
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1 };
    case "fade":
      return { opacity: direction === "in" ? clamped : 1 - clamped, translateX: 0, translateY: 0, scale: 1 };
    case "slide_up":
      return { opacity: direction === "in" ? clamped : 1 - clamped, translateX: 0, translateY: inverse * distanceY, scale: 1 };
    case "slide_down":
      return { opacity: direction === "in" ? clamped : 1 - clamped, translateX: 0, translateY: inverse * -distanceY, scale: 1 };
    case "slide_left":
      return { opacity: direction === "in" ? clamped : 1 - clamped, translateX: inverse * distanceX, translateY: 0, scale: 1 };
    case "slide_right":
      return { opacity: direction === "in" ? clamped : 1 - clamped, translateX: inverse * -distanceX, translateY: 0, scale: 1 };
    case "write_on": {
      const wipeRight = direction === "in" ? 1 - clamped : clamped;
      return {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: 1,
        clipPath: `inset(0 ${wipeRight * 100}% 0 0)`,
        wipeRight,
      };
    }
    case "scan_reveal_down":
    // Typing reveals characters inside the caption renderer; the block itself stays put.
    case "type_on":
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1 };
    case "drop_in":
      return {
        opacity: 1,
        translateX: 0,
        translateY: (direction === "in" ? 1 - eased : eased) * height * -dropInDistanceRatio,
        scale: 1,
      };
    case "focus_settle": {
      // A stationary blur-to-sharp arrival. The type first reads as a
      // defocused mass, then resolves in place instead of crossing the frame.
      const focusScale = direction === "in"
        ? 1.08 - eased * 0.08
        : 1 + eased * 0.04;
      return {
        opacity: direction === "in" ? Math.min(1, clamped * 2) : 1 - clamped,
        translateX: 0,
        translateY: 0,
        scale: focusScale,
        blurPx: direction === "in" ? (1 - clamped) * 24 : clamped * 12,
      };
    }
    case "pop":
      return {
        opacity: direction === "in" ? clamped : 1 - clamped,
        translateX: 0,
        translateY: 0,
        scale: direction === "in" ? 0.92 + clamped * 0.08 : 1 - clamped * 0.08,
      };
    case "spring_pop":
      return {
        // Hyperframes' spring-pop entrance: a fast transform-led arrival with
        // a smooth long-tail settle. Keep it overshoot-free and seek-safe.
        opacity: direction === "in" ? Math.min(1, clamped * 3) : 1 - clamped,
        translateX: 0,
        translateY: 0,
        scale: direction === "in" ? 0.72 + eased * 0.28 : 1 - eased * 0.08,
      };
    case "rotate_in":
      return {
        opacity: direction === "in" ? Math.min(1, clamped * 2.5) : 1 - clamped,
        translateX: 0,
        translateY: 0,
        rotateZDeg: direction === "in" ? (1 - eased) * -18 : eased * 18,
        scale: direction === "in" ? 0.88 + eased * 0.12 : 1 - eased * 0.08,
      };
    case "word_fade":
    case "word_rise":
    case "word_pop":
      // Per-word entrances animate the individual word spans (CaptionSequence);
      // the block stays neutral on the way in and fades as a whole on the way out.
      return direction === "in"
        ? { opacity: 1, translateX: 0, translateY: 0, scale: 1 }
        : { opacity: 1 - clamped, translateX: 0, translateY: 0, scale: 1 };
    default:
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1 };
  }
}

/** Evaluate the whole actor on its clip clock, including source holds and
 * retimed slices. Transitions may suppress the corresponding native animation. */
export function elementAnimationFrame(props:Record<string,unknown>|null|undefined,frame:number,totalFrames:number,
 width:number,height:number,{fps=currentFrameRate(),suppressIn=false,suppressOut=false}:{fps?:number;suppressIn?:boolean;suppressOut?:boolean}={}){
 const animation=resolveAnimationProps(props);
 const inFrames=Math.max(0,toVisualFrame(animation.animationInDuration,fps));
 const outFrames=Math.max(0,toVisualFrame(animation.animationOutDuration,fps));
 const inProgress=inFrames>0?interpolate(frame,[0,inFrames],[0,1],{extrapolateRight:'clamp'}):1;
 const outProgress=outFrames>0?interpolate(frame,[totalFrames-outFrames,totalFrames],[0,1],{extrapolateLeft:'clamp'}):0;
 const inStyle=animationStyle(suppressIn?'none':animation.animationIn,inProgress,'in',width,height);
 const outStyle=animationStyle(suppressOut?'none':animation.animationOut,outProgress,'out',width,height);
 return {inProgress,outProgress,inStyle,outStyle,opacity:Math.min(inStyle.opacity,outStyle.opacity),
  translateX:inStyle.translateX+outStyle.translateX,translateY:inStyle.translateY+outStyle.translateY,
  scale:inStyle.scale*outStyle.scale,rotateZDeg:(inStyle.rotateZDeg??0)+(outStyle.rotateZDeg??0),
  blurPx:(inStyle.blurPx??0)+(outStyle.blurPx??0),
  /** Overlapping in/out wipes hide the larger right-edge share, like nested insets. */
  wipeRight:Math.max(inStyle.wipeRight??0,outStyle.wipeRight??0)};
}
