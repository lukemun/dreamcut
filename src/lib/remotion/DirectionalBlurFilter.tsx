"use client";
import { useId, type ReactNode } from "react";
import { AbsoluteFill } from "@/lib/frame-runtime";

/** Blur the composited RGBA actor, never its background. Keep decoder topology
 * stable across animated identity frames and out-of-order seeks. */
export function DirectionalBlurFilter({ props, x, y, children }: {
  props?: Record<string, unknown> | null; x: number; y: number; children: ReactNode;
}) {
  const id = `directional-blur-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const keys = props?.keyframes as Record<string, unknown> | undefined;
  const mounted = props?.directional_blur_x !== undefined || props?.directional_blur_y !== undefined
    || keys?.directional_blur_x !== undefined || keys?.directional_blur_y !== undefined;
  if (!mounted) return children;
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}><defs>
      <filter id={id} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation={`${x} ${y}`} />
      </filter>
    </defs></svg>
    <AbsoluteFill style={{ filter: x > 0 || y > 0 ? `url(#${id})` : undefined }}>{children}</AbsoluteFill>
  </>;
}
