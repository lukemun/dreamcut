/** Extra ink radius as a percentage of font size; zero preserves saved contours. */
export const HANDWRITING_WEIGHT = { label: "Ink weight", min: 0, max: 4, step: 0.1, suffix: "%", defaultValue: 0 } as const;

export function normalizeHandwritingWeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(HANDWRITING_WEIGHT.min, Math.min(HANDWRITING_WEIGHT.max, value))
    : HANDWRITING_WEIGHT.defaultValue;
}
