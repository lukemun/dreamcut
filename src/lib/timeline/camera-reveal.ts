import { interpolate } from "../frame-runtime/math";
import { evaluateMotionKeyframes, type CaptionElementProps } from "./captions";

/** Shared deterministic camera pose. Frame is local to the caption, not the timeline. */
function cameraEase(props: CaptionElementProps) {
  return (time: number) => evaluateMotionKeyframes(props.cameraRevealMotionKeyframes, time);
}

export type CameraRevealState = {
  distance: number;
  targetX: number;
  targetY: number;
  orbitX: number;
  orbitY: number;
  viewWidth: number;
  viewHeight: number;
};

export function resolveCameraRevealState({
  props,
  frame,
  fps,
  width,
  height,
}: {
  props: CaptionElementProps;
  frame: number;
  fps: number;
  width: number;
  height: number;
}): CameraRevealState {
  const localSeconds = frame / fps;
  const cameraProgress = interpolate(
    localSeconds,
    [
      props.cameraRevealStartSeconds + props.cameraRevealHoldSeconds,
      props.cameraRevealStartSeconds + props.cameraRevealHoldSeconds + props.cameraRevealDurationSeconds,
    ],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: cameraEase(props),
    },
  );
  const distance = interpolate(
    cameraProgress,
    [0, 1],
    [props.cameraRevealStartDistance, props.cameraRevealEndDistance],
  );
  const targetX = interpolate(cameraProgress, [0, 1], [props.cameraRevealTargetX, 0]);
  const targetY = interpolate(cameraProgress, [0, 1], [props.cameraRevealTargetY, 0]);
  const orbitX = interpolate(cameraProgress, [0, 1], [0, props.cameraRevealOrbitX]);
  const orbitY = interpolate(cameraProgress, [0, 1], [0, props.cameraRevealOrbitY]);
  const viewHeight = 2 * distance * Math.tan((props.cameraRevealFov * Math.PI) / 360);
  return {
    distance,
    targetX,
    targetY,
    orbitX,
    orbitY,
    viewWidth: viewHeight * (width / height),
    viewHeight,
  };
}

/** Preserve the Standard reveal's bounded screen-space blur and frame boundaries. */
export function cameraRevealBlurPixels({
  props, frame, fps, shutterAngle = props.cameraRevealShutterAngle,
  samples = props.cameraRevealBlurSamples,
}: {
  props: CaptionElementProps; frame: number; fps: number;
  shutterAngle?: number; samples?: number;
}): number {
  const sampleCount = Math.max(1, Math.round(samples));
  const holdUntilFrame = Math.ceil((props.cameraRevealStartSeconds + props.cameraRevealHoldSeconds) * fps);
  const revealEndFrame = Math.ceil((props.cameraRevealStartSeconds + props.cameraRevealHoldSeconds + props.cameraRevealDurationSeconds) * fps);
  const active = frame >= holdUntilFrame && frame <= revealEndFrame && sampleCount > 1 && shutterAngle > 0;
  return active ? Math.min(2.5, (shutterAngle / 180) * (0.6 + sampleCount * 0.18)) : 0;
}
