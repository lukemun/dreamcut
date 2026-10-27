import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { canvasSizeForValues, parseCompositionManifest, resolveManifestValues, validateCompositionSources } from "./composition-manifest";
import { resolveTiming } from "./composition-timing";
import { buildLookBundle, lookIdFromValues, sharedLooksTemplates } from "./look-bundle";

// The explainer Templates load looks.js, which DreamCut supplies per graphic: the runtime, the
// drawing kit and the graphic's one look. Each template's `look` control picks that look and its
// `shape` control picks the canvas.
const ROOT = path.join(process.cwd(), ".agents/skills/motion-graphics/templates");
const TEMPLATES = ["explainer-sequence", "animated-chart", "plan-comparison", "walkthrough-steps", "kinetic-type", "illustrated-explainer"];
const LOOKS_DIR = path.join(process.cwd(), ".agents/skills/motion-graphics/looks");
const looksOrder = JSON.parse(fs.readFileSync(path.join(LOOKS_DIR, "looks.json"), "utf8")) as { works_with: string[]; order: string[] };
const looksManifest = { works_with: looksOrder.works_with, looks: looksOrder.order.map((id) => JSON.parse(fs.readFileSync(path.join(LOOKS_DIR, `${id}.json`), "utf8")) as { id: string; examples: { template: string; controls: Record<string, unknown> }[] }) };
const lookIds = looksManifest.looks.map((look) => look.id);

test("each look builds its own bundle that registers only that look", () => {
  assert.deepEqual(sharedLooksTemplates(), TEMPLATES);
  for (const id of lookIds) {
    const bundle = buildLookBundle(id);
    const registered = [...bundle.matchAll(/DreamcutMotion\.register\("([a-z0-9-]+)"/g)].map((match) => match[1]);
    assert.deepEqual(registered, [id], `${id} bundle`);
    assert.doesNotThrow(() => new Function(bundle), `${id} bundle parses`);
  }
  assert.match(buildLookBundle("no-such-look"), /register\("paper"/, "an unknown look falls back to Paper");
});

test("every look ships three examples whose controls exist on their template", () => {
  for (const look of looksManifest.looks) {
    assert.equal(look.examples.length, 3, look.id);
    for (const example of look.examples) {
      const manifest = parseCompositionManifest(JSON.parse(fs.readFileSync(path.join(ROOT, example.template, "dreamcut.controls.json"), "utf8")));
      const ids = new Set(manifest.controls.map((control) => control.id));
      for (const key of Object.keys(example.controls)) assert.ok(ids.has(key), `${look.id}: ${key} is not a control of ${example.template}`);
      assert.doesNotThrow(() => resolveManifestValues(manifest, example.controls as never));
    }
  }
});

test("looks draw from time alone: no clocks or unseeded randomness", () => {
  for (const file of ["runtime.js", "kit.js", ...lookIds.map((id) => `${id}.js`)]) {
    assert.doesNotMatch(fs.readFileSync(path.join(LOOKS_DIR, file), "utf8"), /Math\.random|Date\.now|performance\.now|requestAnimationFrame/, file);
  }
});

for (const id of TEMPLATES) {
  test(`${id}: controls file is valid, every control is read with its supplied look, looks and canvas match`, () => {
    const dir = path.join(ROOT, id);
    const manifest = parseCompositionManifest(JSON.parse(fs.readFileSync(path.join(dir, "dreamcut.controls.json"), "utf8")));
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    assert.match(html, /<script src="looks\.js"><\/script>/);
    const bundle = buildLookBundle(lookIdFromValues(resolveManifestValues(manifest, {})));
    const { errors } = validateCompositionSources(manifest, [{ path: "index.html", text: html }, { path: "looks.js", text: bundle }]);
    assert.deepEqual(errors, []);

    const look = manifest.controls.find((control) => control.id === "look");
    assert.equal(look?.kind, "choice");
    assert.deepEqual(look.kind === "choice" && look.options.map((option) => option.value), lookIds);
    const shape = manifest.controls.find((control) => control.id === "shape");
    assert.equal(shape?.fixed, true, "the canvas follows where the graphic is placed");
    const values = resolveManifestValues(manifest, {});
    assert.deepEqual(canvasSizeForValues(manifest, values), { width: 1920, height: 1080 });
    assert.deepEqual(canvasSizeForValues(manifest, { ...values, shape: "tall" }), { width: 1080, height: 1920 });

    // Timing knobs: cues (and the length, where declared) resolve for the defaults and move with the knobs.
    assert.ok(manifest.timing && manifest.timing.cues.length > 0);
    const resolved = resolveTiming(manifest.timing, values);
    for (const cue of manifest.timing.cues) assert.ok(Number.isFinite(resolved.cues[cue.id]));
    const slower = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "number" && /hold|beat|gap|start|lead_in|intro/.test(key) ? value * 1.5 : value]));
    const moved = resolveTiming(manifest.timing, slower);
    assert.ok(manifest.timing.cues.some((cue) => moved.cues[cue.id] > resolved.cues[cue.id]), "a timing knob moves a cue");
    // Card dials stay within the first-class limit only through choice; the full set stays editable.
    assert.ok(manifest.controls.length <= 64);
  });
}
