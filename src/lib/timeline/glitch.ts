import { readKeyframeMap, resolveNumberKeyframe } from "./keyframes";

type PropsLike = Record<string, unknown> | null | undefined;

/**
 * Deterministic digital glitch: horizontal bands/blocks displaced sideways,
 * some smeared (one sampled column or row held across the block), plus an RGB
 * split. Every random choice is a hash of (seed, element-local time step, block
 * index), so preview, export and repeated seeks draw identical frames. Never use
 * Math.random or wall-clock time here.
 *
 * Geometry is in composition pixels; sizes are authored at a 1080-wide reference.
 * Both renderers draw the same `glitchPlan`, so its block list is the authority.
 */
export const GLITCH_FIELDS = [
  "glitch_amount",
  "glitch_block_size",
  "glitch_shift",
  "glitch_rgb_split",
  "glitch_smear",
  "glitch_rate",
  "glitch_seed",
] as const;
export type GlitchField = (typeof GLITCH_FIELDS)[number];

export const GLITCH_KEYFRAME_FIELDS = ["glitch_amount", "glitch_shift", "glitch_rgb_split", "glitch_smear"] as const;

export const GLITCH_CONFIG = {
  glitch_amount: { min: 0, max: 1, identity: 0, integer: false },
  glitch_block_size: { min: 8, max: 240, identity: 48, integer: false },
  glitch_shift: { min: 0, max: 0.5, identity: 0.12, integer: false },
  glitch_rgb_split: { min: 0, max: 60, identity: 10, integer: false },
  glitch_smear: { min: 0, max: 1, identity: 0.35, integer: false },
  glitch_rate: { min: 1, max: 30, identity: 12, integer: false },
  glitch_seed: { min: 0, max: 9999, identity: 0, integer: true },
} as const satisfies Record<GlitchField, { min: number; max: number; identity: number; integer: boolean }>;

export type Glitch = {
  amount: number;
  blockSize: number;
  shift: number;
  rgbSplit: number;
  smear: number;
  rate: number;
  seed: number;
  /** Quantized element-local time step: floor(t × rate). */
  step: number;
};

export type GlitchRect = { x: number; y: number; width: number; height: number };
export type GlitchBlock =
  | { kind: "shift"; rect: GlitchRect; dx: number }
  /** `line` is the held source column (axis x) or row (axis y), stretched across `rect`. */
  | { kind: "smear"; rect: GlitchRect; axis: "x" | "y"; line: number };
export type GlitchPlan = {
  width: number;
  height: number;
  blocks: GlitchBlock[];
  /** Red moves right and blue left by this many composition pixels; 0 skips the split. */
  split: number;
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeGlitchValue(field: GlitchField, value: unknown) {
  const config = GLITCH_CONFIG[field];
  const numeric = Math.min(config.max, Math.max(config.min, finite(value) ?? config.identity));
  return config.integer ? Math.round(numeric) : numeric;
}

export function hasGlitchData(props: PropsLike) {
  if (!props) return false;
  const keyframes = readKeyframeMap(props);
  return GLITCH_FIELDS.some((field) => props[field] != null) || GLITCH_KEYFRAME_FIELDS.some((field) => (keyframes[field]?.length ?? 0) > 0);
}

/** Shared by Standard and CanvasKit. Null when the amount is zero, so nothing is drawn. */
export function resolveGlitchAtTime(props: PropsLike, timeSeconds: number): Glitch | null {
  if (!hasGlitchData(props)) return null;
  const value = (field: GlitchField) => {
    const fallback = normalizeGlitchValue(field, props?.[field]);
    if (!(GLITCH_KEYFRAME_FIELDS as readonly string[]).includes(field)) return fallback;
    const config = GLITCH_CONFIG[field];
    return normalizeGlitchValue(field, resolveNumberKeyframe(props, field, timeSeconds, fallback, { min: config.min, max: config.max }));
  };
  const amount = value("glitch_amount");
  if (amount <= 0) return null;
  const rate = value("glitch_rate");
  // The epsilon keeps frame-exact times (5/30 s × 12) on the step they reach.
  const step = Math.max(0, Math.floor(Math.max(0, timeSeconds) * rate + 1e-6));
  return {
    amount,
    blockSize: value("glitch_block_size"),
    shift: value("glitch_shift"),
    rgbSplit: value("glitch_rgb_split"),
    smear: value("glitch_smear"),
    rate,
    seed: value("glitch_seed"),
    step,
  };
}

/** 32-bit integer mix (murmur3 finalizer per input). Platform independent. */
export function glitchHash(...values: number[]) {
  let h = 0x9e3779b9;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

/** Share of bands affected at full amount. */
const ACTIVE_SHARE = 0.75;

export function glitchPlan(glitch: Glitch, width: number, height: number): GlitchPlan {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("Invalid glitch canvas");
  const scale = width / 1080;
  const band = Math.max(2, Math.round(glitch.blockSize * scale));
  const blocks: GlitchBlock[] = [];
  for (let y = 0, index = 0; y < height; index += 1) {
    const random = (slot: number) => glitchHash(glitch.seed, glitch.step, index, slot);
    const bandHeight = Math.min(height - y, Math.max(2, Math.round(band * (0.5 + random(0)))));
    if (random(1) < glitch.amount * ACTIVE_SHARE) {
      const full = random(2) < 0.4;
      const x = full ? 0 : Math.floor(random(3) * 0.7 * width);
      const blockWidth = full ? width : Math.min(width - x, Math.max(band, Math.round((0.2 + random(4) * 0.8) * (width - x))));
      if (random(5) < glitch.smear) {
        if (random(6) < 0.75) {
          // Hold one column and stretch it to one side, like a pixel-sort streak.
          const line = x + Math.floor(random(7) * blockWidth * 0.6);
          const right = random(8) < 0.5;
          const rect = right ? { x: line, y, width: x + blockWidth - line, height: bandHeight } : { x, y, width: line - x + 1, height: bandHeight };
          blocks.push({ kind: "smear", axis: "x", line, rect });
        } else {
          blocks.push({ kind: "smear", axis: "y", line: y + Math.floor(random(7) * bandHeight), rect: { x, y, width: blockWidth, height: bandHeight } });
        }
      } else {
        const magnitude = glitch.shift * width * glitch.amount * (0.25 + 0.75 * random(7));
        const dx = Math.round(random(8) < 0.5 ? -magnitude : magnitude);
        if (dx !== 0) blocks.push({ kind: "shift", dx, rect: { x, y, width: blockWidth, height: bandHeight } });
      }
    }
    y += bandHeight;
  }
  return { width, height, blocks, split: Math.round(glitch.rgbSplit * scale * glitch.amount) };
}

/** Shallow props patch that removes every field and its animation (undefined keys are dropped on save). */
export function glitchRemovalPatch(props: PropsLike): Record<string, unknown> {
  const keyframes = { ...readKeyframeMap(props) } as Record<string, unknown>;
  for (const field of GLITCH_KEYFRAME_FIELDS) delete keyframes[field];
  return { ...Object.fromEntries(GLITCH_FIELDS.map((field) => [field, undefined])), keyframes };
}

/** Starting point when the creator adds the effect. */
export function glitchPreset(props: PropsLike): Record<string, unknown> {
  return { ...glitchRemovalPatch(props), ...Object.fromEntries(GLITCH_FIELDS.map((field) => [field, GLITCH_CONFIG[field].identity])), glitch_amount: 0.6 };
}
