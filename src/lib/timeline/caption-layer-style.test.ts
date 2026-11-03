import assert from "node:assert/strict";
import test from "node:test";

import {
  NEUTRAL_CAPTION_LAYERS,
  captionBoxWrapCSS, captionColorCycleDeg, captionGradientFillCSS,
  applyCaptionLayers,
  captionLayerShadows,
  captionStrokeColor,
  captionVariantLayers,
} from "./caption-layer-style";
import { captionStyleCSS, captionTreatmentCSS, resolveCaptionProps } from "./captions";

const typography = { fontWeight: 600, lineHeight: 1.12, letterSpacing: "0.01em" };

test("neutral layers leave every treatment's CSS unchanged", () => {
  for (const variant of ["none", "cinematic", "bold_outline", "neon", "boxed"] as const) {
    const base = captionStyleCSS(variant);
    assert.deepEqual(applyCaptionLayers(base, NEUTRAL_CAPTION_LAYERS, typography), base);
  }
});

test("a stored caption without layer fields renders exactly as before", () => {
  const props = resolveCaptionProps({ text: "Hello", styleVariant: "cinematic" });
  assert.deepEqual(captionTreatmentCSS(props), captionStyleCSS("cinematic"));
});

test("an outline colour recolours the treatment's stroke and keeps its width", () => {
  const style = applyCaptionLayers(captionStyleCSS("bold_outline"), { ...NEUTRAL_CAPTION_LAYERS, outlineColor: "#ff0000" }, typography);
  assert.equal(style.WebkitTextStroke, "4px #ff0000");
  assert.equal(captionStrokeColor(style.WebkitTextStroke), "#ff0000");
  assert.equal(captionStrokeColor(undefined), null);
});

test("extrude stacks hard steps toward its angle, nearest on top, then shadow, own shadows and glow", () => {
  const layers = { ...NEUTRAL_CAPTION_LAYERS, extrudeDepthEm: 0.1, extrudeAngleDeg: 90, shadowOpacity: 0.5, glowStrength: 0.4 };
  const { above, below } = captionLayerShadows(layers);
  assert.equal(above[0], "0em 0.0063em 0 #000000");
  assert.equal(above[15], "0em 0.1em 0 #000000");
  assert.match(above.at(-1)!, /rgba\(0, 0, 0, 0\.5\)$/);
  assert.equal(below.length, 3);
  const style = applyCaptionLayers(captionStyleCSS("cinematic"), layers, typography);
  const shadows = String(style.textShadow);
  assert.ok(shadows.indexOf("0em 0.1em 0 #000000") < shadows.indexOf("rgba(0,0,0,0.72)"));
  assert.ok(shadows.indexOf("rgba(0,0,0,0.72)") < shadows.indexOf("0 0 0.06em"));
});

test("spacing adds to the font's own tracking and scales its line height", () => {
  const style = applyCaptionLayers({}, { ...NEUTRAL_CAPTION_LAYERS, letterSpacingEm: 0.05, lineHeightScale: 1.5 }, typography);
  assert.equal(style.letterSpacing, "0.06em");
  assert.equal(style.lineHeight, 1.68);
});

test("Glow and Extruded are presets of the layer controls and can be tuned away", () => {
  const glow = resolveCaptionProps({ text: "Hi", styleVariant: "glow" });
  assert.equal(glow.glowStrength, captionVariantLayers("glow").glowStrength);
  assert.match(String(captionTreatmentCSS(glow).textShadow), /rgba\(255, 79, 216/);
  const off = resolveCaptionProps({ text: "Hi", styleVariant: "glow", glowStrength: 0 });
  assert.equal(captionTreatmentCSS(off).textShadow, undefined);
  const extruded = resolveCaptionProps({ text: "Hi", styleVariant: "extruded" });
  assert.equal(extruded.extrudeDepthEm, 0.09);
  assert.equal(captionTreatmentCSS(extruded).WebkitTextStroke, "3px #1a1a1a");
  assert.equal(resolveCaptionProps({ text: "Hi", styleVariant: "extruded", outlineColor: null }).outlineColor, null);
});

test("inverse and media fills take no layers", () => {
  const props = resolveCaptionProps({ text: "Hi", styleVariant: "inverse", glowStrength: 1 });
  assert.deepEqual(captionTreatmentCSS(props), captionStyleCSS("inverse"));
});

test("a second outline rings the first, starting where the first ends", () => {
  const style = applyCaptionLayers(captionStyleCSS("bold_outline"), { ...NEUTRAL_CAPTION_LAYERS, outline2WidthEm: 0.05, outline2Color: "#ffffff" }, typography);
  const shadows = String(style.textShadow);
  assert.match(shadows, /^calc\(0\.05em \+ 2px\) calc\(0em \+ 0px\) 0 #ffffff/);
  assert.equal((shadows.match(/#ffffff/g) ?? []).length, 16);
});

test("a box draws behind each line or the whole caption", () => {
  const lineLayers = { ...NEUTRAL_CAPTION_LAYERS, boxColor: "#000000", boxOpacity: 0.5 };
  // The positioned caption cannot break into lines or fit its text, so the box goes on a span inside it.
  assert.equal(applyCaptionLayers(captionStyleCSS("cinematic"), lineLayers, typography).backgroundColor, undefined);
  const line = captionBoxWrapCSS(lineLayers)!;
  assert.equal(line.backgroundColor, "rgba(0, 0, 0, 0.5)");
  assert.equal(line.display, "inline");
  assert.equal(line.boxDecorationBreak, "clone");
  const blockLayers = { ...NEUTRAL_CAPTION_LAYERS, boxColor: "#22c55e", boxScope: "block" as const };
  // A treatment's own box gives way to the box layer rather than surrounding it.
  const boxed = applyCaptionLayers(captionStyleCSS("boxed"), blockLayers, typography);
  assert.equal(boxed.backgroundColor, "transparent");
  assert.equal(boxed.padding, 0);
  assert.equal(boxed.border, "none");
  const block = captionBoxWrapCSS(blockLayers)!;
  assert.equal(block.display, "inline-block");
  assert.equal(block.backgroundColor, "rgba(34, 197, 94, 1)");
});

test("a two-colour fill is a fill-only copy, and never on a boxed treatment", () => {
  const layers = { ...NEUTRAL_CAPTION_LAYERS, fillGradientColor: "#ff4fd8", fillGradientAngleDeg: 90 };
  const fill = captionGradientFillCSS(layers, captionStyleCSS("bold_outline"))!;
  assert.equal(fill.backgroundImage, "linear-gradient(90deg, #ffffff, #ff4fd8)");
  assert.equal(fill.color, "transparent");
  assert.equal(fill.textShadow, "none");
  assert.equal(captionGradientFillCSS(NEUTRAL_CAPTION_LAYERS, captionStyleCSS("bold_outline")), null);
  assert.equal(captionGradientFillCSS(layers, captionStyleCSS("boxed")), null);
});

test("RGB split and echo draw behind the text", () => {
  const style = applyCaptionLayers(captionStyleCSS("cinematic"), { ...NEUTRAL_CAPTION_LAYERS, chromaSplitEm: 0.05, echoCount: 2, echoDistanceEm: 0.1, echoAngleDeg: 0 }, typography);
  const shadows = String(style.textShadow);
  assert.ok(shadows.indexOf("rgba(0,0,0,0.72)") < shadows.indexOf("-0.05em 0 0 rgba(255, 0, 64"));
  assert.match(shadows, /0\.1em 0em 0 rgba\(255, 255, 255, 0\.6\), 0\.2em 0em 0 rgba\(255, 255, 255, 0\.3\)$/);
});

test("a middle colour makes the fill three colours and the colour cycle turns once per period", () => {
  const fill = captionGradientFillCSS({ ...NEUTRAL_CAPTION_LAYERS, fillGradientColor: "#ff0000", fillGradientMidColor: "#00ff00" }, { color: "#ffffff" });
  assert.equal(fill?.backgroundImage, "linear-gradient(180deg, #ffffff, #00ff00, #ff0000)");
  assert.equal(captionColorCycleDeg({ colorCycleSeconds: 0 }, 1.3), 0);
  assert.equal(captionColorCycleDeg({ colorCycleSeconds: 2 }, 0.5), 90);
  assert.equal(captionColorCycleDeg({ colorCycleSeconds: 2 }, 2.5), 90);
});
