export const VIDEO_STABILIZATION_DEFAULT_STRENGTH = 50;

export type VideoStabilizationMode = "smooth_motion" | "lock_camera";

export type VideoStabilizationAction =
  | "apply"
  | "toggle_comparison"
  | "remove";

export function videoStabilizationRecipe(
  mode: VideoStabilizationMode,
  strength = VIDEO_STABILIZATION_DEFAULT_STRENGTH,
) {
  const strengthPercent = Math.max(0, Math.min(100, Math.round(strength)));
  const shakiness = Math.max(1, Math.min(10, 2 + Math.round(strengthPercent * 0.06)));
  const smoothingFrames = mode === "lock_camera"
    ? 0
    : 5 + Math.round(strengthPercent * 0.45);
  return {
    schemaVersion: 1,
    recipe: `video-stabilization-v1:${mode}:${strengthPercent}`,
    mode,
    strengthPercent,
    shakiness,
    smoothingFrames,
    tripod: mode === "lock_camera",
    autoZoom: true,
  } as const;
}
