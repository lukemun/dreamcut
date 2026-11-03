import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "@/lib/frame-runtime";
import type { CompositionElement } from "../render/composition-adapters";
import { projectiveCss, surfacePictureMatrix } from "../timeline/surface-placement";

/**
 * A picture attached to a tracked surface (timeline/surface-placement.ts): its canvas frame drawn
 * onto its region of the surface with perspective, through the camera its footage follows. GPU
 * preview applies the same matrix as the clip's outermost transform.
 */
export function SurfaceFrame({ element, elements, children }: { element: CompositionElement; elements: readonly CompositionElement[]; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const placement = surfacePictureMatrix(element, elements, frame, width, height, fps);
  if (!placement) return <>{children}</>;
  return <AbsoluteFill style={{ transformOrigin: "0 0", transform: projectiveCss(placement.matrix), visibility: placement.hidden ? "hidden" : undefined }}>{children}</AbsoluteFill>;
}
