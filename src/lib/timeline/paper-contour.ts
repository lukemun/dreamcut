export const PAPER_CONTOUR_MODEL = "rg-distance-1024-v1";
const clamp = (value: unknown, fallback: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;

/** Source PNG stores round((1 - distance/1024) * 65535) in R/G. */
export function paperContourMatrix(props: Record<string, unknown> | null | undefined, seconds: number): number[] | null {
  if (props?.contour_model !== PAPER_CONTOUR_MODEL) return null;
  const start = clamp(props.contour_radius_start, 0, 900);
  const end = clamp(props.contour_radius_end, start, 900);
  const duration = clamp(props.contour_duration, 0, 600);
  const progress = duration > 0 ? Math.max(0, Math.min(1, seconds / duration)) : 1;
  const radius = start + (end - start) * progress;
  const color = typeof props.contour_color === "string" && /^#[\da-f]{6}$/i.test(props.contour_color) ? props.contour_color : "#ffffff";
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
  // Decode and threshold in ONE matrix; an intermediate alpha surface would
  // quantize the distance back to 8 bits and cause visible width steps.
  return [...rgb.flatMap(c => [0, 0, 0, 0, c]), 1024 * 256 / 257, 1024 / 257, 0, 0, radius - 1024 + 0.5];
}
