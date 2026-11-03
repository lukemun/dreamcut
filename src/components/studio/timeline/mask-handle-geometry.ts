import { maskInsetMinimum, type MaskInsetProps } from "@/lib/timeline/media-transform";

export type MaskEdge = keyof MaskInsetProps;
/** Keep the grab target on the canvas without changing the mask's true bounds. */
export function maskEdgeHandlePosition(mask: MaskInsetProps, edge: MaskEdge): { x: number; y: number } {
  const x = edge === "left" ? mask.left : edge === "right" ? 1 - mask.right : (mask.left + 1 - mask.right) / 2;
  const y = edge === "top" ? mask.top : edge === "bottom" ? 1 - mask.bottom : (mask.top + 1 - mask.bottom) / 2;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

/** Anchor movement to pointer-down, so a displaced grab target never snaps the mask. */
export function moveMaskEdgeByDelta(mask: MaskInsetProps, edge: MaskEdge, delta: number, shape?: unknown): MaskInsetProps {
  if (delta === 0) return mask;
  const position = edge === "right" || edge === "bottom" ? 1 - mask[edge] : mask[edge];
  return moveMaskEdge(mask, edge, position + delta, shape);
}
export function maskShapeLabel(mask: MaskInsetProps): "None" | "Rectangle" | "Line" {
  if (Object.values(mask).every(value => value === 0)) return "None";
  return mask.left === 0 && mask.right === 0 && ((mask.top > 0) !== (mask.bottom > 0)) ? "Line" : "Rectangle";
}
/** Normalized composition coordinates, matching the renderer's outer mask. */
export function moveMaskEdge(mask: MaskInsetProps, edge: MaskEdge, position: number, shape?: unknown): MaskInsetProps {
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
  const inset = edge === "right" || edge === "bottom" ? 1 - position : position;
  // Keep a line single-edged and flippable within the renderer's 95% inset limit.
  if (shape !== "ellipse" && maskShapeLabel(mask) === "Line" && (edge === "top" || edge === "bottom")) {
    return { ...mask, [edge]: Math.max(0.05, Math.min(0.95, inset)) };
  }
  return { ...mask, [edge]: Math.max(maskInsetMinimum(shape), Math.min(0.95, 0.99 - mask[opposite[edge]], inset)) };
}
