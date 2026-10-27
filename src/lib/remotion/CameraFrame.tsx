import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "@/lib/frame-runtime";
import { affineCss, cameraMatrix, cameraViewFor, type CameraElement } from "../timeline/camera";

/**
 * Draws a clip or caption through the camera it follows (timeline/camera.ts) as its outermost
 * transform, matching the GPU's outer transform. Mount it outside any Sequence so the frame is the
 * timeline clock. Shapes apply their camera themselves.
 */
export function CameraFrame({ element, elements, children }: { element: CameraElement; elements: readonly CameraElement[]; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const view = element.type === "shape" ? null : cameraViewFor(element, elements, frame / fps, width, height);
  if (!view) return <>{children}</>;
  return <AbsoluteFill style={{ transformOrigin: "0 0", transform: affineCss(cameraMatrix(view, width, height)) }}>{children}</AbsoluteFill>;
}
