import assert from "node:assert/strict";
import test from "node:test";

import { filmLookPreset, filmLookRemovalPatch, filmTintVector, hasFilmLookData, resolveFilmLookAtTime } from "./film-look";
import { upsertKeyframe } from "./keyframes";

test("a film look draws nothing until one strength is above zero", () => {
  assert.equal(resolveFilmLookAtTime({}, 0), null);
  assert.equal(resolveFilmLookAtTime({ film_grain_size: 3, film_split_shadow_hue: 200 }, 0), null);
  assert.equal(resolveFilmLookAtTime({ film_vignette: 0.4 }, 0)?.vignette, 0.4);
});

test("strengths key over time, values clamp to their ranges and grain steps 24 times a second", () => {
  let props: Record<string, unknown> = upsertKeyframe({}, "film_bloom", 0, 0);
  props = upsertKeyframe(props, "film_bloom", 2, 1);
  props = { ...props, film_grain: 4, film_grain_size: -1 };
  const look = resolveFilmLookAtTime(props, 1)!;
  assert.equal(look.bloom, 0.5);
  assert.equal(look.grain, 1);
  assert.equal(look.grainSize, 0.5);
  assert.equal(look.grainStep, 24);
  assert.equal(resolveFilmLookAtTime(props, 1 / 24)!.grainStep, 1);
});

test("split-tone tints keep brightness", () => {
  for (const hue of [0, 35, 120, 195, 300]) {
    const [r, g, b] = filmTintVector(hue);
    assert.ok(Math.abs(0.2126 * r + 0.7152 * g + 0.0722 * b) < 1e-9, String(hue));
  }
  assert.ok(filmTintVector(35)[0] > 0 && filmTintVector(195)[2] > 0);
});

test("the preset turns the look on and removal clears every field and key", () => {
  const preset = filmLookPreset({});
  assert.ok(hasFilmLookData(preset) && resolveFilmLookAtTime(preset, 0)!.grain > 0);
  const keyed = upsertKeyframe({ ...preset }, "film_grain", 1, 0.5);
  const removed = { ...keyed, ...filmLookRemovalPatch(keyed) };
  for (const [key, value] of Object.entries(removed)) if (key.startsWith("film_")) assert.equal(value, undefined, key);
  assert.equal((removed.keyframes as Record<string, unknown>).film_grain, undefined);
});
