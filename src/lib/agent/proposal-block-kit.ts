import { createHash } from "node:crypto";
import type { z } from "zod";

/**
 * Shared vocabulary for proposal building blocks (docs/architecture/proposal-building-blocks.md).
 *
 * A block is a registered, versioned unit: typed settings the creator tunes, inputs the agent
 * measures beforehand, and a pure compiler that turns both into today's operations. Everything
 * here is independent of the proposal schema so block definitions can be written without
 * importing the apply module.
 */

export type BlockSettingValue = number | string;
/** Authored or tuned settings: a shared setting holds one value, a per-instance setting an array. */
export type BlockSettings = Record<string, BlockSettingValue | BlockSettingValue[]>;

export type BlockSettingUnit = "frames" | "seconds" | "percent" | "factor";

type SettingDefault<T, I> = T | ((inputs: I, index: number, settings: BlockSettings) => T);

type BlockSettingBase<I> = {
  /** Creator-facing label; a per-instance setting's label is prefixed with the instance's name. */
  label: string;
  /** Main dials lead the card; Advanced keeps the rest reachable. */
  tier: "main" | "advanced";
  /** Set per instance of this role (the block's `instances` names them) instead of once for the block. */
  per?: string;
  /** For a per-instance setting: the first instance is a main dial and the rest Advanced. */
  first_main?: boolean;
  /** What the setting is, in plain words, for agents reading the schema. */
  description?: string;
  __inputs?: I;
};

export type BlockNumberSetting<I = unknown> = BlockSettingBase<I> & {
  kind: "number";
  unit: BlockSettingUnit;
  min: number;
  max: number;
  step: number;
  default: SettingDefault<number, I>;
  /** A visible motion's off position: the value at which nothing moves. Required for any motion. */
  off?: number;
  /** A measured default (a hold from settle to takeoff) may exceed `max`; the range then grows to include it. */
  max_from_default?: boolean;
};

export type BlockChoiceSetting<I = unknown> = BlockSettingBase<I> & {
  kind: "choice";
  choices: readonly { value: string; label: string }[];
  default: SettingDefault<string, I>;
};

export type BlockSetting<I = unknown> = BlockNumberSetting<I> | BlockChoiceSetting<I>;

export type BlockContext = {
  /** The project frame grid every produced time snaps to. */
  fps: number;
  /** Stable per card: element ids derive from it, so a clip keeps its id while the creator tunes. */
  seed: string;
  block_id: string;
};

/** A compiled operation: today's operation shape plus the block role that produced it. */
export type BlockOperation = Record<string, unknown> & { element_id: string; block_ref: { block_id: string; role: string; index: number } };

export type BlockDefinition<I = unknown> = {
  kind: string;
  version: number;
  /** Shown as the card row's subject, e.g. "Speed hops". */
  label: string;
  description: string;
  inputs: z.ZodType<I>;
  settings: Record<string, BlockSetting<I>>;
  /** How many instances of each `per` role the inputs define, and what to call each one. */
  instances: (inputs: I) => Record<string, string[]>;
  /**
   * The card's sections in time order, each naming the resolved settings it holds (`name` or
   * `name.N`): a first section for what the whole block shares, then one per beat, named by a
   * place or content the creator can see. Settings not listed go last under the block's label.
   */
  sections?: (inputs: I, fields: readonly string[]) => Array<{ label: string; fields: string[] }>;
  compile: (inputs: I, settings: ResolvedBlockSettings, context: BlockContext) => BlockOperation[];
};

/** Settings with every default filled: shared values as scalars, per-instance values as arrays. */
export type ResolvedBlockSettings = Record<string, BlockSettingValue | BlockSettingValue[]>;

export class BlockSettingError extends Error {
  constructor(public readonly block_id: string, public readonly field: string, public readonly value: unknown, message: string) {
    super(message);
  }
}

/** Frame arithmetic: every produced time is a whole number of frames. */
export function framesToSeconds(frames: number, fps: number) {
  return frames / fps;
}
export function secondsToFrames(seconds: number, fps: number) {
  return Math.round(seconds * fps);
}
export function snapSeconds(seconds: number, fps: number) {
  return framesToSeconds(secondsToFrames(seconds, fps), fps);
}

/**
 * A stable element id for one role of one block: the same card, block, role and index always
 * name the same clip, so tuning never retargets clips. RFC 4122 layout (version 5 nibble) so the
 * operation schema's uuid check accepts it.
 */
export function blockElementId(context: Pick<BlockContext, "seed" | "block_id">, role: string, index = 0) {
  const hex = createHash("sha256").update(`${context.seed}\u0000${context.block_id}\u0000${role}\u0000${index}`).digest("hex");
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function settingDefault<T>(value: SettingDefault<T, unknown>, inputs: unknown, index: number, settings: BlockSettings): T {
  return typeof value === "function" ? (value as (i: unknown, n: number, s: BlockSettings) => T)(inputs, index, settings) : value;
}

/** Display metadata shared by the card, the inventory and the sweep for a block setting. */
export function blockSettingDisplay(setting: BlockNumberSetting<unknown>) {
  return { step: setting.step, suffix: setting.unit === "frames" ? "frames" : setting.unit === "seconds" ? "s" : setting.unit === "percent" ? "%" : "×" };
}
