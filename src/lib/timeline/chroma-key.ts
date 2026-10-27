import {
  hasKeyframes,
  hasKeyframeAtTime,
  readKeyframeMap,
  removeKeyframes,
  removeKeyframesAtTime,
  resolveNumberKeyframe,
  upsertKeyframe,
} from "./keyframes";

type PropsLike = Record<string, unknown> | null | undefined;

export const CHROMA_KEY_MODEL = "color-key-v1" as const;

/** The key colour is the enable switch: no colour, no key. */
export const CHROMA_KEY_COLOR_FIELD = "chroma_key_color" as const;

export const CHROMA_KEY_AMOUNT_FIELDS = [
  "chroma_key_tolerance",
  "chroma_key_softness",
  "chroma_key_spill",
] as const;

export const CHROMA_KEY_KEYFRAME_FIELDS = CHROMA_KEY_AMOUNT_FIELDS;

export type ChromaKeyAmountField = (typeof CHROMA_KEY_AMOUNT_FIELDS)[number];
export type ChromaKeyField = typeof CHROMA_KEY_COLOR_FIELD | ChromaKeyAmountField;

export const DEFAULT_CHROMA_KEY_COLOR = "#00ff00";

/**
 * Identity values are `colorKey()`'s own defaults, so a clip that is keyed with
 * nothing but a colour behaves exactly like the effect's documented baseline.
 */
export const CHROMA_KEY_AMOUNT_CONFIG = {
  chroma_key_tolerance: { key: "tolerance", min: 0, max: 1, identity: 0.18, precision: 3 },
  chroma_key_softness: { key: "softness", min: 0, max: 1, identity: 0.08, precision: 3 },
  chroma_key_spill: { key: "spill", min: 0, max: 1, identity: 0.25, precision: 3 },
} as const satisfies Record<ChromaKeyAmountField, {
  key: keyof ChromaKeyAmounts;
  min: number;
  max: number;
  identity: number;
  precision: number;
}>;

export type ChromaKeyAmounts = {
  tolerance: number;
  softness: number;
  spill: number;
};

export type ChromaKey = ChromaKeyAmounts & {
  color: string;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeChromaKeyColor(value: unknown): string {
  return typeof value === "string" && HEX_COLOR.test(value.trim())
    ? value.trim().toLowerCase()
    : DEFAULT_CHROMA_KEY_COLOR;
}

export function normalizeChromaKeyAmount(field: ChromaKeyAmountField, value: unknown) {
  const config = CHROMA_KEY_AMOUNT_CONFIG[field];
  const numeric = finite(value) ?? config.identity;
  return Number(clamp(numeric, config.min, config.max).toFixed(config.precision));
}

/** True once a clip carries a key colour — the amounts alone never enable the key. */
export function hasChromaKeyData(props: PropsLike) {
  if (!props) return false;
  return typeof props[CHROMA_KEY_COLOR_FIELD] === "string"
    && HEX_COLOR.test((props[CHROMA_KEY_COLOR_FIELD] as string).trim());
}

/** Amount fields written without a key colour are inert; surface that rather than silently keying. */
export function hasOrphanedChromaKeyAmounts(props: PropsLike) {
  if (!props || hasChromaKeyData(props)) return false;
  const keyframes = readKeyframeMap(props);
  return CHROMA_KEY_AMOUNT_FIELDS.some((field) =>
    field in props || (keyframes[field]?.length ?? 0) > 0);
}

export function validateChromaKeyModel(props: PropsLike): string | null {
  const hasData = hasChromaKeyData(props);
  const model = props?.chroma_key_model;
  if (!hasData && model == null) {
    return hasOrphanedChromaKeyAmounts(props)
      ? `Chroma key amounts are set without ${CHROMA_KEY_COLOR_FIELD}; the key would not apply.`
      : null;
  }
  if (model !== CHROMA_KEY_MODEL) {
    return hasData && model == null
      ? `Chroma key data is missing chroma_key_model (${CHROMA_KEY_MODEL} required).`
      : `Unsupported chroma key model: ${String(model)}.`;
  }
  const rawColor = props?.[CHROMA_KEY_COLOR_FIELD];
  if (!hasData) {
    return `Chroma key is declared but ${CHROMA_KEY_COLOR_FIELD} is not a #rrggbb colour: ${String(rawColor)}.`;
  }
  return null;
}

function assertSupportedChromaKey(props: PropsLike) {
  const issue = validateChromaKeyModel(props);
  if (issue) throw new Error(issue);
}

export function readChromaKeyProps(props: PropsLike): ChromaKey | null {
  assertSupportedChromaKey(props);
  if (!hasChromaKeyData(props)) return null;
  return {
    color: normalizeChromaKeyColor(props?.[CHROMA_KEY_COLOR_FIELD]),
    tolerance: normalizeChromaKeyAmount("chroma_key_tolerance", props?.chroma_key_tolerance),
    softness: normalizeChromaKeyAmount("chroma_key_softness", props?.chroma_key_softness),
    spill: normalizeChromaKeyAmount("chroma_key_spill", props?.chroma_key_spill),
  };
}

/**
 * The single time-resolution entry point shared by the Player and the render.
 * Returns null when the clip carries no key colour, so callers mount no effect
 * at all rather than an identity pass.
 */
export function resolveChromaKeyAtTime(props: PropsLike, timeSeconds: number): ChromaKey | null {
  const fallback = readChromaKeyProps(props);
  if (!fallback) return null;
  const amounts = Object.fromEntries(CHROMA_KEY_AMOUNT_FIELDS.map((field) => {
    const config = CHROMA_KEY_AMOUNT_CONFIG[field];
    const value = resolveNumberKeyframe(
      props,
      field,
      timeSeconds,
      fallback[config.key],
      { min: config.min, max: config.max },
    );
    return [config.key, normalizeChromaKeyAmount(field, value)];
  })) as ChromaKeyAmounts;
  return { color: fallback.color, ...amounts };
}

/** Parameter names belong to `colorKey()`; the timeline speaks in its own field names. */
export function buildColorKeyParams(chroma: ChromaKey) {
  return {
    keyColor: chroma.color,
    similarity: chroma.tolerance,
    smoothness: chroma.softness,
    spillSuppression: chroma.spill,
  };
}

function stripIdentityAmounts(props: Record<string, unknown>) {
  for (const field of CHROMA_KEY_AMOUNT_FIELDS) {
    const config = CHROMA_KEY_AMOUNT_CONFIG[field];
    if (
      field in props
      && !hasKeyframes(props, field)
      && Math.abs(normalizeChromaKeyAmount(field, props[field]) - config.identity) < 0.0005
    ) {
      delete props[field];
    }
  }
  if (!hasChromaKeyData(props)) delete props.chroma_key_model;
  return props;
}

export function commitChromaKeyColor(props: PropsLike, color: string | null) {
  const next = { ...(props ?? {}) };
  if (color == null) return resetChromaKey(next);
  next[CHROMA_KEY_COLOR_FIELD] = normalizeChromaKeyColor(color);
  next.chroma_key_model = CHROMA_KEY_MODEL;
  return stripIdentityAmounts(next);
}

export function commitChromaKeyAmountAtTime(
  props: PropsLike,
  timeSeconds: number,
  field: ChromaKeyAmountField,
  value: number,
) {
  assertSupportedChromaKey(props);
  const normalized = normalizeChromaKeyAmount(field, value);
  const next = hasKeyframes(props, field)
    ? upsertKeyframe(props, field, timeSeconds, normalized)
    : { ...(props ?? {}), [field]: normalized };
  if (hasChromaKeyData(next)) next.chroma_key_model = CHROMA_KEY_MODEL;
  return stripIdentityAmounts(next);
}

export function upsertChromaKeyKeyframe(
  props: PropsLike,
  timeSeconds: number,
  field: ChromaKeyAmountField,
  value: number,
) {
  assertSupportedChromaKey(props);
  const next = upsertKeyframe(props, field, timeSeconds, normalizeChromaKeyAmount(field, value));
  if (hasChromaKeyData(next)) next.chroma_key_model = CHROMA_KEY_MODEL;
  return next;
}

export function removeChromaKeyKeyframeAtTime(
  props: PropsLike,
  timeSeconds: number,
  field: ChromaKeyAmountField,
) {
  return stripIdentityAmounts(removeKeyframesAtTime(props, [field], timeSeconds));
}

export function hasChromaKeyKeyframeAtTime(
  props: PropsLike,
  field: ChromaKeyAmountField,
  timeSeconds: number,
) {
  return hasKeyframeAtTime(props, [field], timeSeconds);
}

export function resetChromaKey(props: PropsLike) {
  const next = removeKeyframes(props, CHROMA_KEY_KEYFRAME_FIELDS);
  for (const field of CHROMA_KEY_AMOUNT_FIELDS) delete next[field];
  delete next[CHROMA_KEY_COLOR_FIELD];
  delete next.chroma_key_model;
  return next;
}
