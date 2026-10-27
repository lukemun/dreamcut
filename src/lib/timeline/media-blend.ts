export const MEDIA_BLEND_MODES = ["normal", "difference", "exclusion"] as const;
export function resolveMediaBlendMode(value: unknown): "normal" | "difference" | "exclusion" {
  return value === "difference" || value === "exclusion" ? value : "normal";
}
/** Must be mounted on the outer compositing layer, outside opacity/filter stacking contexts. */
export function mediaBlendStyle(value: unknown) { return { mixBlendMode: resolveMediaBlendMode(value) }; }
