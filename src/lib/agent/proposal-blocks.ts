import { z } from "zod";
import { currentFrameRate } from "../timeline/frame-rate-scope";
import { BlockSettingError, blockSettingDisplay, settingDefault, type BlockContext, type BlockDefinition, type BlockOperation, type BlockSetting, type BlockSettingValue, type BlockSettings, type ResolvedBlockSettings } from "./proposal-block-kit";
import { flashSequenceBlock } from "./proposal-blocks-flash";
import { hopSequenceBlock, keyframedMoveBlock, liveHoldBlock } from "./proposal-blocks-hops";

/**
 * Proposal building blocks: the registry, the settings contract and the compile step every
 * proposal path shares (docs/architecture/proposal-building-blocks.md).
 *
 * An option's `blocks` hold settings and inputs as authored. Compiling them yields today's
 * operations, each tagged `block_ref`, appended after the option's own operations. The option
 * schema compiles on every parse, so preview, review rows, dial moves and Apply all derive from the
 * same settings; `applyProposalNumericOverrides` changes a setting and re-parses.
 *
 * Raw operations are the `operations@1` block: `option.operations` holds them directly, and an
 * explicit `{kind: "operations", version: 1, inputs: {operations}}` block is hoisted into it.
 */

export const OPERATIONS_BLOCK_KIND = "operations";

const BLOCK_DEFINITIONS: readonly BlockDefinition<unknown>[] = [liveHoldBlock, keyframedMoveBlock, hopSequenceBlock, flashSequenceBlock] as unknown as BlockDefinition<unknown>[];

export function blockDefinition(kind: string, version: number): BlockDefinition<unknown> | undefined {
  return BLOCK_DEFINITIONS.find(definition => definition.kind === kind && definition.version === version);
}

export function listBlockDefinitions() {
  return BLOCK_DEFINITIONS;
}

const settingValueSchema = z.union([z.number().finite(), z.string().max(64)]);
export const blockInstanceSchema = z.object({
  block_id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "Block ids are lowercase slugs").describe("Names this block on the card and in overrides; element ids derive from it, so use a different id for each pending card."),
  kind: z.string().min(1).max(64).describe("A registered block kind: live_hold, keyframed_move, hop_sequence, flash_sequence (or operations, whose inputs.operations are plain operations)."),
  version: z.number().int().min(1).describe("The block version this card was drafted with."),
  inputs: z.record(z.string(), z.unknown()).describe("Measured inputs the block compiles from (sources, cut-out receipts, subject boxes, settle and takeoff frames). Never detectors: compiling runs no model."),
  settings: z.record(z.string(), z.union([settingValueSchema, z.array(settingValueSchema).max(64)])).default({})
    .describe("Setting values to depart from the defaults; omit a setting to take its default. A per-instance setting (one per stop or hop) is an array in instance order."),
  seed: z.string().min(1).max(64).optional().describe("Set by the server from the card's revision: element ids derive from it. Do not send it."),
  frame_rate: z.number().finite().positive().optional().describe("Set by the server: the project frame grid the block compiles on. Do not send it."),
}).strict();
export type BlockInstance = z.infer<typeof blockInstanceSchema>;

const unitSuffix = (setting: BlockSetting) => setting.kind === "number" ? blockSettingDisplay(setting).suffix : "";

/** Instance labels for a per-instance setting, or one unnamed instance for a shared one. */
function instanceLabels(definition: BlockDefinition<unknown>, inputs: unknown, setting: BlockSetting) {
  if (!setting.per) return [undefined];
  const labels = definition.instances(inputs)[setting.per];
  if (!labels) throw new Error(`Block ${definition.kind} names no "${setting.per}" instances`);
  return labels;
}

function checkSettingValue(blockId: string, field: string, setting: BlockSetting, range: { min: number; max: number }, value: unknown): BlockSettingValue {
  if (setting.kind === "choice") {
    if (typeof value !== "string" || !setting.choices.some(choice => choice.value === value)) {
      throw new BlockSettingError(blockId, field, value, `Block "${blockId}" setting "${setting.label}" (${field}) must be one of ${setting.choices.map(choice => choice.value).join(", ")}`);
    }
    return value;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BlockSettingError(blockId, field, value, `Block "${blockId}" setting "${setting.label}" (${field}) must be a number`);
  // A frames dial sends whole frames; a seconds dial two decimals: allow a hair past the bounds.
  if (value < range.min - 1e-6 || value > range.max + 1e-6) {
    throw new BlockSettingError(blockId, field, value, `Block "${blockId}" setting "${setting.label}" (${field}) at ${value}${unitSuffix(setting)} is outside ${range.min} to ${range.max}${unitSuffix(setting)}`);
  }
  return Math.min(range.max, Math.max(range.min, value));
}

export type ResolvedBlockSetting = {
  field: string;
  name: string;
  index: number;
  /** The dial's label: the setting's own when its section names the instance, else suffixed with it. */
  label: string;
  /** The card section this dial sits in (blocks with `sections`), in time order. */
  section?: string;
  setting: BlockSetting;
  value: BlockSettingValue;
  range: { min: number; max: number };
  tier: "main" | "advanced";
};

/**
 * Every setting of a block with defaults filled and ranges resolved, one entry per instance.
 * Authored values are checked against the registry: unknown names, wrong types and values outside
 * the advertised range are refused naming the block and the setting.
 */
export function resolveBlockSettings(instance: BlockInstance, definition = requireDefinition(instance), inputs: unknown = parseInputs(instance, definition)): ResolvedBlockSetting[] {
  const authored = instance.settings as BlockSettings;
  for (const name of Object.keys(authored)) {
    if (!definition.settings[name]) throw new BlockSettingError(instance.block_id, name, authored[name], `Block "${instance.block_id}" (${definition.kind}) has no setting "${name}"; its settings are ${Object.keys(definition.settings).join(", ")}`);
  }
  const resolved: ResolvedBlockSetting[] = [];
  // Choices resolve first so a number's default can depend on them (travel depends on the variant);
  // the card still lists dials in the registry's order.
  const entries = Object.entries(definition.settings);
  const order = entries.filter(([, setting]) => setting.kind === "choice").concat(entries.filter(([, setting]) => setting.kind !== "choice"));
  const current: BlockSettings = {};
  for (const [name, setting] of order) {
    const labels = instanceLabels(definition, inputs, setting);
    const given = authored[name];
    if (setting.per && given !== undefined && !Array.isArray(given)) throw new BlockSettingError(instance.block_id, name, given, `Block "${instance.block_id}" setting "${setting.label}" (${name}) is set per ${setting.per}: send an array with one value per ${setting.per} (${labels.length})`);
    if (setting.per && Array.isArray(given) && given.length > labels.length) throw new BlockSettingError(instance.block_id, name, given, `Block "${instance.block_id}" setting "${setting.label}" (${name}) has ${given.length} values for ${labels.length} ${setting.per}s`);
    if (!setting.per && Array.isArray(given)) throw new BlockSettingError(instance.block_id, name, given, `Block "${instance.block_id}" setting "${setting.label}" (${name}) is one value for the whole block`);
    const values: BlockSettingValue[] = [];
    for (const [index, instanceLabel] of labels.entries()) {
      const fallback = settingDefault<BlockSettingValue>(setting.default, inputs, index, current);
      const range = setting.kind === "number"
        ? { min: setting.min, max: setting.max_from_default && typeof fallback === "number" ? Math.max(setting.max, fallback) : setting.max }
        : { min: 0, max: 0 };
      const raw = Array.isArray(given) ? given[index] : given;
      const value = raw === undefined ? fallback : checkSettingValue(instance.block_id, setting.per ? `${name}.${index}` : name, setting, range, raw);
      values.push(value);
      resolved.push({ field: setting.per ? `${name}.${index}` : name, name, index, label: instanceLabel ? `${setting.label} ${instanceLabel}` : setting.label, setting, value, range,
        tier: setting.per && setting.first_main ? (index === 0 ? "main" : "advanced") : setting.tier });
    }
    current[name] = setting.per ? values : values[0]!;
  }
  const position = new Map(entries.map(([name], index) => [name, index]));
  resolved.sort((a, b) => position.get(a.name)! - position.get(b.name)! || a.index - b.index);
  const sections = definition.sections?.(inputs, resolved.map(item => item.field));
  if (!sections) return resolved;
  // Sections put dials in time order; a dial inside a named section needs no instance suffix.
  const placed = new Map<string, { section: string; order: number }>();
  sections.forEach((section, sectionIndex) => section.fields.forEach((field, fieldIndex) => { if (!placed.has(field)) placed.set(field, { section: section.label, order: sectionIndex * 1000 + fieldIndex }); }));
  return resolved.map(item => {
    const place = placed.get(item.field);
    return place ? { ...item, section: place.section, label: item.setting.label } : item;
  }).sort((a, b) => (placed.get(a.field)?.order ?? Number.MAX_SAFE_INTEGER) - (placed.get(b.field)?.order ?? Number.MAX_SAFE_INTEGER));
}

function requireDefinition(instance: Pick<BlockInstance, "kind" | "version" | "block_id">) {
  const definition = blockDefinition(instance.kind, instance.version);
  if (!definition) throw new Error(`Block "${instance.block_id}" asks for ${instance.kind}@${instance.version}, which is not a registered block (${BLOCK_DEFINITIONS.map(item => `${item.kind}@${item.version}`).join(", ")})`);
  return definition;
}

function parseInputs(instance: BlockInstance, definition: BlockDefinition<unknown>) {
  const parsed = definition.inputs.safeParse(instance.inputs);
  if (!parsed.success) throw new Error(`Block "${instance.block_id}" (${definition.kind}) inputs: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "inputs"}: ${issue.message}`).join("; ")}`);
  return parsed.data;
}

function toResolvedSettings(resolved: readonly ResolvedBlockSetting[]): ResolvedBlockSettings {
  const settings: ResolvedBlockSettings = {};
  for (const item of resolved) {
    if (!item.setting.per) { settings[item.name] = item.value; continue; }
    const values = (settings[item.name] ??= []) as BlockSettingValue[];
    values.push(item.value);
  }
  return settings;
}

function blockContext(instance: BlockInstance): BlockContext {
  return { fps: instance.frame_rate ?? currentFrameRate(), seed: instance.seed ?? "draft", block_id: instance.block_id };
}

/**
 * Compile time since the last `takeBlockCompileStats`, so a staging reply can say what compiling on
 * every parse cost (`review_timings_ms.block_compile`) and perf:check can watch it on a block card.
 */
let compileStats = { compiles: 0, ms: 0 };
export function takeBlockCompileStats() {
  const stats = compileStats;
  compileStats = { compiles: 0, ms: 0 };
  return stats;
}

/** Compile one block to operations tagged with their block role. */
export function compileBlock(instance: BlockInstance, settingsOverride?: readonly ResolvedBlockSetting[]): BlockOperation[] {
  const started = performance.now();
  const definition = requireDefinition(instance);
  const inputs = parseInputs(instance, definition);
  const resolved = settingsOverride ?? resolveBlockSettings(instance, definition, inputs);
  try {
    return definition.compile(inputs, toResolvedSettings(resolved), blockContext(instance));
  } catch (error) {
    if (error instanceof BlockSettingError) throw error;
    throw new Error(`Block "${instance.block_id}" (${definition.kind}@${definition.version}): ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    compileStats = { compiles: compileStats.compiles + 1, ms: compileStats.ms + (performance.now() - started) };
  }
}

/** Every block of an option compiled in order; raw operations stay in `option.operations`. */
export function compileOptionBlocks(blocks: readonly BlockInstance[] | undefined): BlockOperation[] {
  return (blocks ?? []).flatMap(block => compileBlock(block));
}

/**
 * Draft-time validation: compile as authored, then each setting at its minimum and maximum (each
 * choice for a choice), one at a time with the others as authored. A range that cannot compile is
 * refused naming the block, the setting and the value, never an operation index.
 */
export function validateBlockRanges(instance: BlockInstance) {
  const definition = requireDefinition(instance);
  const inputs = parseInputs(instance, definition);
  const resolved = resolveBlockSettings(instance, definition, inputs);
  compileBlock(instance, resolved);
  for (const item of resolved) {
    if (item.setting.hidden?.(inputs)) continue;
    const candidates: BlockSettingValue[] = item.setting.kind === "number" ? [item.range.min, item.range.max] : item.setting.choices.map(choice => choice.value);
    for (const value of candidates) {
      if (value === item.value) continue;
      const trial = resolved.map(other => other === item ? { ...other, value } : other);
      try {
        compileBlock(instance, trial);
      } catch (error) {
        const message = error instanceof Error ? error.message.replace(/^Block "[^"]+" \([^)]+\): /, "") : String(error);
        throw new BlockSettingError(instance.block_id, item.field, value,
          `Block "${instance.block_id}" setting "${item.label}"${item.section ? ` in "${item.section}"` : ""} (${item.field}) at ${value}${unitSuffix(item.setting)} cannot compile: ${message}`);
      }
    }
  }
}

/** Set one setting on a block instance from a card dial (`field` is `name` or `name.N`), checking the registry. */
export function setBlockSetting(instance: BlockInstance, field: string, value: unknown): BlockInstance {
  const definition = requireDefinition(instance);
  const inputs = parseInputs(instance, definition);
  const resolved = resolveBlockSettings(instance, definition, inputs);
  const target = resolved.find(item => item.field === field);
  if (!target) throw new BlockSettingError(instance.block_id, field, value, `Block "${instance.block_id}" has no setting "${field}"; its dials are ${resolved.map(item => item.field).join(", ")}`);
  const checked = checkSettingValue(instance.block_id, field, target.setting, target.range, value);
  const settings = { ...instance.settings } as BlockSettings;
  if (target.setting.per) {
    const values = resolved.filter(item => item.name === target.name).map(item => item.field === field ? checked : item.value);
    settings[target.name] = values;
  } else settings[target.name] = checked;
  return { ...instance, settings };
}

/** The card dial for one block setting, in the shape review rows carry (`target: "block"`). */
export type BlockReviewChange = {
  field: string; label: string; before: string; after: string; after_value: BlockSettingValue; target: "block"; operation_index: number; block_id: string;
  /** The card heading this dial sits under (proposal-presentation: time-ordered beats named by place). */
  section?: string;
  control_range?: { min: number; max: number }; control_display?: { step: number; suffix: string }; control_tier: "main" | "advanced";
  control_choices?: { value: string; label: string }[];
};

export function blockReviewChanges(instance: BlockInstance, blockIndex: number): BlockReviewChange[] {
  const definition = requireDefinition(instance), inputs = parseInputs(instance, definition);
  return resolveBlockSettings(instance, definition, inputs).filter(item => !item.setting.hidden?.(inputs)).map(item => {
    const base = { field: item.field, label: item.label, before: "—", target: "block" as const, operation_index: blockIndex, block_id: instance.block_id, after_value: item.value, control_tier: item.tier,
      ...(item.section ? { section: item.section } : {}) };
    if (item.setting.kind === "choice") {
      return { ...base, after: item.setting.choices.find(choice => choice.value === item.value)?.label ?? String(item.value), control_choices: [...item.setting.choices] };
    }
    const display = blockSettingDisplay(item.setting);
    const shown = typeof item.value === "number" ? Math.round(item.value * 100) / 100 : item.value;
    return { ...base, after: display.suffix === "frames" ? `${shown} frames` : `${shown}${display.suffix}`, control_range: item.range, control_display: display };
  });
}

/** The creator-facing name of a block, for its row on the card. */
export function blockLabel(instance: Pick<BlockInstance, "kind" | "version" | "block_id">) {
  return blockDefinition(instance.kind, instance.version)?.label ?? instance.block_id;
}
