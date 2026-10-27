import type { MaskInsetProps } from "@/lib/timeline/media-transform";

export type MaskEdge = keyof MaskInsetProps;
export function maskShapeLabel(mask: MaskInsetProps): "None" | "Rectangle" | "Line" {
  if (Object.values(mask).every(value => value === 0)) return "None";
  return mask.left === 0 && mask.right === 0 && ((mask.top > 0) !== (mask.bottom > 0)) ? "Line" : "Rectangle";
}
/** Normalized composition coordinates, matching the renderer's outer mask. */
export function moveMaskEdge(mask: MaskInsetProps, edge: MaskEdge, position: number): MaskInsetProps {
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
  const inset = edge === "right" || edge === "bottom" ? 1 - position : position;
  // Keep a line single-edged and flippable within the renderer's 95% inset limit.
  if (maskShapeLabel(mask) === "Line" && (edge === "top" || edge === "bottom")) {
    return { ...mask, [edge]: Math.max(0.05, Math.min(0.95, inset)) };
  }
  return { ...mask, [edge]: Math.max(0, Math.min(0.95, 0.99 - mask[opposite[edge]], inset)) };
}
