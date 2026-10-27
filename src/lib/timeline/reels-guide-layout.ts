import reference from "@/components/studio/timeline/reels-reference-zones.json";
import { SAFE_AREA_REELS } from "../qc/standards";

// Match the editor's reference guide, not the stricter delivery QC rectangle.
export const REELS_INTERFACE_BOTTOM = reference.regions.find(region => region.id === "template")!.y / reference.height;

/** Pure, read-only geometry: reference-screen guide is not delivery certification. */
export function reelsGuideLines(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Positive canvas dimensions required");
  const region = (id: string) => reference.regions.find(item => item.id === id)!;
  return {
    coordinate_space: "canvas_pixels" as const,
    source: "editor_reels_reference_guide" as const,
    reference_sha256: reference.sha256,
    canvas: { width, height },
    lines: {
      top: region("header").height / reference.height * height,
      bottom: REELS_INTERFACE_BOTTOM * height,
      left: SAFE_AREA_REELS.left / SAFE_AREA_REELS.reference.width * width,
      right: (1 - SAFE_AREA_REELS.right / SAFE_AREA_REELS.reference.width) * width,
      action_rail_top: region("actions").y / reference.height * height,
      action_rail_left: region("actions").x / reference.width * width,
    },
    limitation: "Matches the editor reference guide; stricter delivery QC boundaries remain separate.",
  };
}
