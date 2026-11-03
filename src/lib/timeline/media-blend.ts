export const MEDIA_BLEND_MODES = ["normal", "screen", "difference", "exclusion"] as const;
export function resolveMediaBlendMode(value: unknown): typeof MEDIA_BLEND_MODES[number] {
  return value === "screen" || value === "difference" || value === "exclusion" ? value : "normal";
}
/** Must be mounted on the outer compositing layer, outside opacity/filter stacking contexts. */
export function mediaBlendStyle(value: unknown) { return { mixBlendMode: resolveMediaBlendMode(value) }; }
