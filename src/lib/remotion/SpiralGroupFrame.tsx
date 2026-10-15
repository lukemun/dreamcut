import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "@/lib/frame-runtime";
import { spiralGroupSchema, spiralGroupTransform } from "@/lib/timeline/spiral-group";

export function SpiralGroupFrame({ props, children, offsetSeconds = 0 }: {
  props: Record<string, unknown> | null | undefined; children: ReactNode; offsetSeconds?: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const parsed = spiralGroupSchema.safeParse(props?.spiral_group);
  if (!parsed.success) return <>{children}</>;
  const recipe = parsed.data;
  const pose = spiralGroupTransform(recipe, frame/fps + offsetSeconds, width, height);
  return <AbsoluteFill style={{
    transformOrigin: `${recipe.origin_x*100}% ${recipe.origin_y*100}%`,
    transform: `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rotation}deg) scale(${pose.scale})`,
  }}>{children}</AbsoluteFill>;
}
