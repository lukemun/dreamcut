import assert from "node:assert/strict";
import test from "node:test";
import { applyGradientMap, gradientMapPreset, gradientMapRemovalPatch, hasGradientMapData, resolveGradientMapAtTime } from "./gradient-map";
import { gpuSceneCapabilityIssues } from "../gpu-preview/scene";
import type { CompositionElement } from "../render/composition-adapters";

test("color map is off at zero mix and resolves the thermal defaults", () => {
  assert.equal(resolveGradientMapAtTime({}, 0), null);
  assert.equal(resolveGradientMapAtTime({ gradient_map_amount: 0 }, 0), null);
  const map = resolveGradientMapAtTime({ gradient_map_amount: 1 }, 0)!;
  assert.deepEqual(map.stops.map(stop => stop.map(v => Math.round(v * 255))), [[0x5a, 0, 0], [0xff, 0x3c, 0], [0xff, 0xe4, 0x5c]]);
  assert.equal(map.contrast, 1);
});

test("luminance maps onto the three-stop ramp and mixes by amount", () => {
  const map = resolveGradientMapAtTime({ gradient_map_amount: 1 }, 0)!;
  assert.deepEqual(applyGradientMap(map, [0, 0, 0]).map(v => Math.round(v * 255)), [0x5a, 0, 0]);
  assert.deepEqual(applyGradientMap(map, [0.5, 0.5, 0.5]).map(v => Math.round(v * 255)), [0xff, 0x3c, 0]);
  assert.deepEqual(applyGradientMap(map, [1, 1, 1]).map(v => Math.round(v * 255)), [0xff, 0xe4, 0x5c]);
  const half = resolveGradientMapAtTime({ gradient_map_amount: 0.5 }, 0)!;
  assert.deepEqual(applyGradientMap(half, [0, 0, 0]).map(v => Math.round(v * 1000) / 1000), [0x5a / 255 / 2, 0, 0].map(v => Math.round(v * 1000) / 1000));
  const punchy = resolveGradientMapAtTime({ gradient_map_amount: 1, gradient_map_contrast: 3 }, 0)!;
  assert.deepEqual(applyGradientMap(punchy, [0.2, 0.2, 0.2]).map(v => Math.round(v * 255)), [0x5a, 0, 0], "contrast clamps dark grey to the shadow colour");
});

test("a keyed two-frame flash resolves on and off at exact frames", () => {
  const props = { gradient_map_amount: 0, keyframes: { gradient_map_amount: [{ t: 0, v: 0, ease: "hold" }, { t: 0.5, v: 1, ease: "hold" }, { t: 0.5 + 2 / 30, v: 0, ease: "hold" }] } };
  assert.equal(resolveGradientMapAtTime(props, 14 / 30), null);
  assert.equal(resolveGradientMapAtTime(props, 15 / 30)!.amount, 1);
  assert.equal(resolveGradientMapAtTime(props, 16 / 30)!.amount, 1);
  assert.equal(resolveGradientMapAtTime(props, 17 / 30), null);
  assert.equal(hasGradientMapData(props), true);
});

test("preset and removal are single patches", () => {
  const preset = gradientMapPreset({});
  assert.equal(resolveGradientMapAtTime(preset, 0)!.amount, 1);
  const removed = JSON.parse(JSON.stringify({ ...preset, ...gradientMapRemovalPatch(preset) }));
  assert.equal(hasGradientMapData(removed), false);
});

test("CanvasKit admits the color map with keyframes and rejects malformed colours", () => {
  const still = (props: Record<string, unknown>) => ({ id: "s", type: "still", source_url: "/fixture.png", timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0, volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0, props: { source_width: 160, source_height: 160, ...props } }) as unknown as CompositionElement;
  const props = { gradient_map_amount: 1, gradient_map_contrast: 1.4, gradient_map_shadows: "#5a0000", gradient_map_midtones: "#ff3c00", gradient_map_highlights: "#ffe45c", keyframes: { gradient_map_amount: [{ t: 0, v: 0 }, { t: 1, v: 1 }], gradient_map_contrast: [{ t: 0, v: 1 }, { t: 1, v: 2 }] } };
  assert.deepEqual(gpuSceneCapabilityIssues([still(props)], "fixture", "canvaskit"), []);
  assert.ok(gpuSceneCapabilityIssues([still({ gradient_map_shadows: "red" })], "fixture", "canvaskit").some(issue => issue.capability === "property:gradient_map_shadows"));
});
