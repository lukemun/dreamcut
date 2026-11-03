import assert from "node:assert/strict";
import test from "node:test";

import {
  CHROMA_KEY_MODEL,
  DEFAULT_CHROMA_KEY_COLOR,
  buildColorKeyParams,
  commitChromaKeyAmountAtTime,
  commitChromaKeyColor,
  hasChromaKeyData,
  normalizeChromaKeyAmount,
  normalizeChromaKeyColor,
  readChromaKeyProps,
  removeChromaKeyKeyframeAtTime,
  resetChromaKey,
  resolveChromaKeyAtTime,
  upsertChromaKeyKeyframe,
  validateChromaKeyModel,
} from "./chroma-key";

const keyed = (extra: Record<string, unknown> = {}) => ({
  chroma_key_color: "#00ff00",
  chroma_key_model: CHROMA_KEY_MODEL,
  ...extra,
});

test("a clip without a key colour resolves to no effect at all", () => {
  assert.equal(hasChromaKeyData(null), false);
  assert.equal(hasChromaKeyData({}), false);
  assert.equal(resolveChromaKeyAtTime({}, 0), null);
  assert.equal(readChromaKeyProps({}), null);
});

test("the key colour is the enable switch", () => {
  assert.equal(hasChromaKeyData(keyed()), true);
  const resolved = resolveChromaKeyAtTime(keyed(), 0);
  assert.deepEqual(resolved, { color: "#00ff00", tolerance: 0.18, softness: 0.08, spill: 0.25 });
});

test("colour normalization lowercases valid hex and falls back to the default green", () => {
  assert.equal(normalizeChromaKeyColor("#00FF00"), "#00ff00");
  assert.equal(normalizeChromaKeyColor("  #1A2B3C "), "#1a2b3c");
  assert.equal(normalizeChromaKeyColor("rgb(0,255,0)"), DEFAULT_CHROMA_KEY_COLOR);
  assert.equal(normalizeChromaKeyColor(null), DEFAULT_CHROMA_KEY_COLOR);
});

test("amounts clamp into range and round to the stored precision", () => {
  assert.equal(normalizeChromaKeyAmount("chroma_key_tolerance", 5), 1);
  assert.equal(normalizeChromaKeyAmount("chroma_key_tolerance", -2), 0);
  assert.equal(normalizeChromaKeyAmount("chroma_key_softness", 0.12345), 0.123);
  assert.equal(normalizeChromaKeyAmount("chroma_key_spill", "nonsense"), 0.25);
});

test("amounts interpolate across keyframes and clamp at the ends", () => {
  const props = upsertChromaKeyKeyframe(
    upsertChromaKeyKeyframe(keyed(), 0, "chroma_key_tolerance", 0.1),
    2,
    "chroma_key_tolerance",
    0.5,
  );
  assert.equal(resolveChromaKeyAtTime(props, 0)!.tolerance, 0.1);
  assert.equal(resolveChromaKeyAtTime(props, 1)!.tolerance, 0.3);
  assert.equal(resolveChromaKeyAtTime(props, 2)!.tolerance, 0.5);
  assert.equal(resolveChromaKeyAtTime(props, 99)!.tolerance, 0.5);
});

test("timeline field names map onto colorKey() parameter names", () => {
  const params = buildColorKeyParams({ color: "#0d1f2d", tolerance: 0.3, softness: 0.2, spill: 0.4 });
  assert.deepEqual(params, {
    keyColor: "#0d1f2d",
    similarity: 0.3,
    smoothness: 0.2,
    spillSuppression: 0.4,
  });
});

test("committing a colour stamps the model and clearing it removes every trace", () => {
  const enabled = commitChromaKeyColor({}, "#123456");
  assert.equal(enabled.chroma_key_color, "#123456");
  assert.equal(enabled.chroma_key_model, CHROMA_KEY_MODEL);

  const cleared = commitChromaKeyColor(enabled, null);
  assert.equal("chroma_key_color" in cleared, false);
  assert.equal("chroma_key_model" in cleared, false);
});

test("identity amounts are not persisted, but keyframed amounts survive", () => {
  const atIdentity = commitChromaKeyAmountAtTime(keyed(), 0, "chroma_key_spill", 0.25);
  assert.equal("chroma_key_spill" in atIdentity, false);
  assert.equal(atIdentity.chroma_key_model, CHROMA_KEY_MODEL);

  const moved = commitChromaKeyAmountAtTime(keyed(), 0, "chroma_key_spill", 0.6);
  assert.equal(moved.chroma_key_spill, 0.6);

  const keyframedAtIdentity = commitChromaKeyAmountAtTime(
    upsertChromaKeyKeyframe(keyed(), 0, "chroma_key_spill", 0.6),
    1,
    "chroma_key_spill",
    0.25,
  );
  assert.equal(resolveChromaKeyAtTime(keyframedAtIdentity, 1)!.spill, 0.25);
});

test("removing the last keyframe at a time leaves the clip resolvable", () => {
  const props = upsertChromaKeyKeyframe(keyed(), 1.5, "chroma_key_softness", 0.4);
  const removed = removeChromaKeyKeyframeAtTime(props, 1.5, "chroma_key_softness");
  assert.equal(resolveChromaKeyAtTime(removed, 1.5)!.softness, 0.08);
});

test("reset strips the key entirely and leaves unrelated props alone", () => {
  const props = upsertChromaKeyKeyframe(
    keyed({ media_scale: 1.2, chroma_key_tolerance: 0.4 }),
    0,
    "chroma_key_softness",
    0.3,
  );
  const cleared = resetChromaKey(props);
  assert.equal(hasChromaKeyData(cleared), false);
  assert.equal("chroma_key_tolerance" in cleared, false);
  assert.equal("chroma_key_model" in cleared, false);
  assert.equal(cleared.media_scale, 1.2);
});

test("an unknown or missing model blocks export instead of being reinterpreted", () => {
  assert.equal(validateChromaKeyModel({}), null);
  assert.equal(validateChromaKeyModel(keyed()), null);
  assert.match(
    validateChromaKeyModel({ chroma_key_color: "#00ff00" }) ?? "",
    /missing chroma_key_model/,
  );
  assert.match(
    validateChromaKeyModel({ chroma_key_color: "#00ff00", chroma_key_model: "color-key-v2" }) ?? "",
    /Unsupported chroma key model/,
  );
  assert.throws(() => readChromaKeyProps({ chroma_key_color: "#00ff00" }));
});

test("amounts written without a key colour are reported rather than silently ignored", () => {
  assert.match(
    validateChromaKeyModel({ chroma_key_tolerance: 0.4 }) ?? "",
    /without chroma_key_color/,
  );
  assert.match(
    validateChromaKeyModel({ chroma_key_color: "not-a-colour", chroma_key_model: CHROMA_KEY_MODEL }) ?? "",
    /not a #rrggbb colour/,
  );
});
