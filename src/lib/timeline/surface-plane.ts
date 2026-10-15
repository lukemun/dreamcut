type PropsLike = Record<string, unknown> | null | undefined;

export type SurfacePlaneMode = "none" | "wall";
export type SurfaceBlendMode = "normal" | "multiply";

export type SurfacePlaneProps = {
  mode: SurfacePlaneMode;
  perspectivePx: number;
  depthPx: number;
  rotateXDeg: number;
  rotateYDeg: number;
  rotateZDeg: number;
  skewXDeg: number;
  skewYDeg: number;
  opacity: number;
  blurPx: number;
  blendMode: SurfaceBlendMode;
};

export const DEFAULT_SURFACE_PLANE_PROPS: SurfacePlaneProps = {
  mode: "none",
  perspectivePx: 1200,
  depthPx: 0,
  rotateXDeg: 0,
  rotateYDeg: 0,
  rotateZDeg: 0,
  skewXDeg: 0,
  skewYDeg: 0,
  opacity: 1,
  blurPx: 0,
  blendMode: "normal",
};

export const WALL_SURFACE_PLANE_PRESET: SurfacePlaneProps = {
  ...DEFAULT_SURFACE_PLANE_PROPS,
  mode: "wall",
  depthPx: -90,
};

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function resolveSurfacePlaneProps(props: PropsLike): SurfacePlaneProps {
  const mode: SurfacePlaneMode = props?.surfaceMode === "wall" ? "wall" : "none";
  const fallback = mode === "wall" ? WALL_SURFACE_PLANE_PRESET : DEFAULT_SURFACE_PLANE_PROPS;

  return {
    mode,
    perspectivePx: clamp(finite(props?.surfacePerspectivePx, fallback.perspectivePx), 400, 3000),
    depthPx: clamp(finite(props?.surfaceDepthPx, fallback.depthPx), -400, 200),
    rotateXDeg: clamp(finite(props?.surfaceRotateXDeg, fallback.rotateXDeg), -30, 30),
    rotateYDeg: clamp(finite(props?.surfaceRotateYDeg, fallback.rotateYDeg), -30, 30),
    rotateZDeg: clamp(finite(props?.surfaceRotateZDeg, fallback.rotateZDeg), -30, 30),
    skewXDeg: clamp(finite(props?.surfaceSkewXDeg, fallback.skewXDeg), -20, 20),
    skewYDeg: clamp(finite(props?.surfaceSkewYDeg, fallback.skewYDeg), -20, 20),
    opacity: clamp(finite(props?.surfaceOpacity, fallback.opacity), 0.2, 1),
    blurPx: clamp(finite(props?.surfaceBlurPx, fallback.blurPx), 0, 3),
    blendMode: props?.surfaceBlendMode === "multiply" ? "multiply" : fallback.blendMode,
  };
}

export function writeSurfacePlaneProps(
  props: PropsLike,
  patch: Partial<SurfacePlaneProps>,
): Record<string, unknown> {
  const current = resolveSurfacePlaneProps(props);
  const next = { ...current, ...patch };
  return {
    ...(props ?? {}),
    surfaceMode: next.mode,
    surfacePerspectivePx: clamp(next.perspectivePx, 400, 3000),
    surfaceDepthPx: clamp(next.depthPx, -400, 200),
    surfaceRotateXDeg: clamp(next.rotateXDeg, -30, 30),
    surfaceRotateYDeg: clamp(next.rotateYDeg, -30, 30),
    surfaceRotateZDeg: clamp(next.rotateZDeg, -30, 30),
    surfaceSkewXDeg: clamp(next.skewXDeg, -20, 20),
    surfaceSkewYDeg: clamp(next.skewYDeg, -20, 20),
    surfaceOpacity: clamp(next.opacity, 0.2, 1),
    surfaceBlurPx: clamp(next.blurPx, 0, 3),
    surfaceBlendMode: next.blendMode,
  };
}

export function enableWallSurface(props: PropsLike): Record<string, unknown> {
  const hasAuthoredSurface = props != null && [
    "surfacePerspectivePx",
    "surfaceDepthPx",
    "surfaceRotateXDeg",
    "surfaceRotateYDeg",
    "surfaceRotateZDeg",
    "surfaceSkewXDeg",
    "surfaceSkewYDeg",
    "surfaceOpacity",
    "surfaceBlurPx",
    "surfaceBlendMode",
  ].some((key) => Object.prototype.hasOwnProperty.call(props, key));

  return writeSurfacePlaneProps(
    props,
    hasAuthoredSurface ? { mode: "wall" } : WALL_SURFACE_PLANE_PRESET,
  );
}
