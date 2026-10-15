import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { canvasSizeForValues, parseCompositionManifest, resolveManifestValues, validateCompositionSources } from "./composition-manifest";
import { resolveTiming } from "./composition-timing";

// The explainer Templates share one looks file; each template is one composition whose
// `look` control switches every look and whose `shape` control picks the canvas.
const ROOT = path.join(process.cwd(), ".agents/skills/motion-graphics/templates");
const TEMPLATES = ["explainer-sequence", "animated-chart", "plan-comparison", "walkthrough-steps", "kinetic-type"];
const looksText = fs.readFileSync(path.join(ROOT, "explainer-looks/looks.js"), "utf8");
const lookIds = [...looksText.slice(looksText.indexOf("const LOOKS"), looksText.indexOf("function hexA")).matchAll(/^ {4}([a-z]+): \{/gm)].map((match) => match[1]);

test("the shared looks file declares five original looks", () => {
  assert.deepEqual(lookIds, ["paper", "keynote", "swiss", "terminal", "chalk"]);
});

for (const id of TEMPLATES) {
  test(`${id}: controls file is valid, every control is read, looks and canvas match the shared file`, () => {
    const dir = path.join(ROOT, id);
    const manifest = parseCompositionManifest(JSON.parse(fs.readFileSync(path.join(dir, "dreamcut.controls.json"), "utf8")));
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    assert.match(html, /<script src="looks\.js"><\/script>/);
    const { errors } = validateCompositionSources(manifest, [{ path: "index.html", text: html }, { path: "looks.js", text: looksText }]);
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
