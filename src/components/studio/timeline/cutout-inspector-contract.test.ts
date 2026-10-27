import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { visibleInspectorSections } from "./inspector-sections";

const elementMenu = readFileSync(new URL("./ElementMenu.tsx", import.meta.url), "utf8");

test("background removal and shape masks share Mask while color and effects remain separate", () => {
  const context = { visual: true, caption: false, alpha: false, rhythm: false, musicTools: false };
  assert.deepEqual([...visibleInspectorSections("mask", context)].sort(), ["background-removal", "chroma-key", "shape-mask"]);
  assert.deepEqual([...visibleInspectorSections("color", context)], ["color"]);
  assert.deepEqual([...visibleInspectorSections("effects", context)], ["stabilization", "effects"]);
  assert.ok(elementMenu.includes('<InspectorSection sectionId="shape-mask" title="Shape mask">'));
  assert.ok(elementMenu.includes('activeVerticalSubpanel === "mask" ? <VisualMaskEditor'));
});

test("applied effects replace diagnostic modes in both layouts", () => {
  assert.equal(elementMenu.match(/<CutoutEffectControls/g)?.length, 2);
  assert.ok(!elementMenu.includes("Preview only · export is unchanged"));
  const controls = readFileSync(new URL("./CutoutEffectControls.tsx", import.meta.url), "utf8");
  assert.ok(controls.includes('"Background removal" : "Scratchpad"'));
  assert.ok(controls.includes('aria-pressed={state[key]}'));
});

test("background removal is only the controls for an agent-made cutout; there is no manual cutout dialog", () => {
  // Creator direction 2026-10-26: cutouts come from the agent as proposals.
  assert.ok(!elementMenu.includes("CustomCutoutDialog"));
  assert.ok(!elementMenu.includes("Remove background…"));
  assert.ok(elementMenu.includes('{isAlphaCutout && selectedElement ? <InspectorSection sectionId="background-removal"'));
  assert.ok(!existsSync(new URL("./CustomCutoutDialog.tsx", import.meta.url)));
});
