import { z } from "zod";

/** Prepared fields store distance(subject) / (distance(subject) + distance(canvas edge)). */
export const edgeAuraSchema = z.object({
  model: z.enum(["rg-edge-distance-v1", "gray-edge-distance-v1", "metric-edge-transfer-v1"]),
  keyframes: z.array(z.object({
    t: z.number().finite().min(0).max(600),
    inner: z.number().finite().min(0).max(1),
    outer: z.number().finite().min(0).max(1),
    edge_mix: z.number().finite().min(0).max(1).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }).strict().refine(k => k.inner < k.outer, "Inner edge must be inside outer edge")).min(1).max(64),
}).strict().refine(v => v.keyframes.every((k, i, a) => i === 0 || k.t > a[i - 1]!.t), "Ring keyframes must increase in time");
export type EdgeAura = z.infer<typeof edgeAuraSchema>;

export function edgeAuraAt(value: unknown, seconds: number) {
  const parsed = edgeAuraSchema.safeParse(value);
  if (!parsed.success) return null;
  const keys = parsed.data.keyframes;
  const next = keys.findIndex(k => k.t > seconds);
  if (next === 0) return keys[0]!;
  if (next === -1) return keys[keys.length - 1]!;
  const a = keys[next - 1]!, b = keys[next]!;
  const p = (seconds - a.t) / (b.t - a.t);
  const mix = (x: number, y: number) => x + (y - x) * p;
  const color = "#" + [1, 3, 5].map(i => Math.round(mix(parseInt(a.color.slice(i, i + 2), 16), parseInt(b.color.slice(i, i + 2), 16))).toString(16).padStart(2, "0")).join("");
  return { t: seconds, inner: mix(a.inner, b.inner), outer: mix(a.outer, b.outer), edge_mix: mix(a.edge_mix ?? 0, b.edge_mix ?? 0), color };
}

export function edgeAuraMatrices(value: unknown, seconds: number) {
  const state = edgeAuraAt(value, seconds);
  if (!state) return null;
  // Decode directly from image channels. Grayscale fields avoid packed-channel
  // rollover artifacts during browser image resampling.
  const metric = (value as EdgeAura).model === "metric-edge-transfer-v1";
  const gain = metric ? 512 : 2048;
  const gray = (value as EdgeAura).model === "gray-edge-distance-v1";
  const decode = metric ? [gain * (1 - (state.edge_mix ?? 0)), gain * (state.edge_mix ?? 0)] : gray ? [gain, 0] : [gain * 256 / 257, gain / 257];
  const rgb = [1, 3, 5].map(i => parseInt(state.color.slice(i, i + 2), 16) / 255);
  return {
    inner: [...rgb.flatMap(c => [0, 0, 0, 0, c]), decode[0]!, decode[1]!, 0, 0, .5 - gain * state.inner],
    outer: [...rgb.flatMap(c => [0, 0, 0, 0, c]), -decode[0]!, -decode[1]!, 0, 0, .5 + gain * state.outer],
  };
}
