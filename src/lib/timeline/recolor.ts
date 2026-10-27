import { resolvePaperFill } from "./paper-fill";

export type Recolor = { color: string; amount: number; preserveShading: boolean };
export const clampRecolorAmount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export function resolveRecolor(props?: Record<string, unknown> | null): Recolor {
  const legacy = resolvePaperFill(props?.paper_fill_color);
  const color = resolvePaperFill(props?.recolor_color);
  return {
    color: color ?? legacy ?? "#ffffff",
    amount: props?.recolor_amount === undefined ? (color || legacy ? 1 : 0) : clampRecolorAmount(props.recolor_amount),
    preserveShading: props?.recolor_preserve_shading === undefined ? !legacy : Number(props.recolor_preserve_shading) === 1,
  };
}
/** Lerp original RGB toward flat color or luminance × target; alpha is untouched. */
export function recolorMatrix(effect: Recolor): number[] {
  const color = resolvePaperFill(effect.color) ?? "#ffffff";
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const amount = clampRecolorAmount(effect.amount);
  const luminance = [0.2126, 0.7152, 0.0722];
  return [...rgb.flatMap((channel, row) => [
    ...luminance.map((weight, column) => (row === column ? 1 - amount : 0) + (effect.preserveShading ? amount * channel * weight : 0)),
    0, effect.preserveShading ? 0 : amount * channel,
  ]), 0, 0, 0, 1, 0];
}
