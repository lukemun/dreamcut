import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  authoredSegmentDurations,
  compositionCoverage,
  controlKindProblems,
  injectRuntimeIntoHtml,
  parseCompositionManifest,
  resolveManifestValues,
  validateCompositionSources,
  valuesSha256,
} from "./composition-manifest";

const manifest = parseCompositionManifest({
  schema_version: 1,
  controls: [
    { id: "headline", kind: "text", label: "Headline", default: "DreamCut", max_length: 24 },
    { id: "accent", kind: "color", label: "Accent", default: "#0A84FF" },
    { id: "spin_turns", kind: "number", label: "Spin", default: 1, min: 0, max: 3, step: 0.25 },
  ],
  actors: [{ id: "logo", label: "Logo" }],
  markers: [
    { id: "intro_end", at_seconds: 1.2 },
    { id: "hold", at_seconds: 1.2, stretch: { min_seconds: 0.5, max_seconds: 4 }, until: "outro_start" },
    { id: "outro_start", at_seconds: 2.7 },
  ],
});

test("parses an optional controls file and normalizes colors", () => {
  assert.equal(manifest.controls.length, 3);
  assert.equal(manifest.controls[1]!.default, "#0a84ff");
  assert.deepEqual(authoredSegmentDurations(manifest), { hold: 1.5 });
});

test("rejects broken manifests with a field-specific message", () => {
  assert.throws(() => parseCompositionManifest({ schema_version: 2 }), /schema_version/);
  assert.throws(() => parseCompositionManifest({
    schema_version: 1, controls: [{ id: "Bad Id", kind: "text", label: "x", default: "" }],
  }), /snake_case id/);
  assert.throws(() => parseCompositionManifest({
    schema_version: 1, controls: [{ id: "size", kind: "number", label: "Size", default: 9, min: 0, max: 5 }],
  }), /default must be within/);
  assert.throws(() => parseCompositionManifest({
    schema_version: 1,
    markers: [{ id: "hold", at_seconds: 1, stretch: { min_seconds: 0.5, max_seconds: 2 }, until: "missing" }],
  }), /unknown marker/);
  assert.throws(() => parseCompositionManifest({
    schema_version: 1,
    markers: [
      { id: "hold", at_seconds: 1, stretch: { min_seconds: 0.5, max_seconds: 2 }, until: "end" },
      { id: "end", at_seconds: 4 },
    ],
  }), /outside its stretch range/);
});

test("an empty manifest is valid", () => {
  assert.deepEqual(parseCompositionManifest({ schema_version: 1 }), {
    schema_version: 1, controls: [], actors: [], markers: [],
  });
});

test("fills defaults, validates supplied values and hashes them canonically", () => {
  const values = resolveManifestValues(manifest, { headline: "Cut faster" });
  assert.deepEqual(values, { headline: "Cut faster", accent: "#0a84ff", spin_turns: 1 });
  assert.throws(() => resolveManifestValues(manifest, { unknown: 1 }), /Unknown animation control/);
  assert.throws(() => resolveManifestValues(manifest, { spin_turns: 5 }), /between 0 and 3/);
  assert.throws(() => resolveManifestValues(manifest, { headline: "x".repeat(30) }), /up to 24/);
  assert.equal(
    valuesSha256({ a: 1, b: "two" }),
    valuesSha256({ b: "two", a: 1 }),
  );
});

test("injects runtime values at the start of head without allowing script breakout", () => {
  const html = injectRuntimeIntoHtml("<html><head><title>x</title></head><body></body></html>", {
    controls: { headline: "</script><script>alert(1)</script>" },
    segment_durations: { hold: 1.5 },
  });
  assert.match(html, /^<html><head><script>window\.__dreamcut=Object\.freeze\(/);
  assert.ok(!html.includes("</script><script>alert"));
  assert.match(html, /\\u003c\/script>/);
});

const goodSources = [
  {
    path: "index.html",
    text: `<div data-actor="logo"></div><script>
      const dc = window.__dreamcut ?? { controls: {}, segment_durations: {} };
      const headline = dc.controls.headline; const accent = dc.controls["accent"]; const turns = dc.controls.spin_turns;
      const hold = dc.segment_durations.hold;
    </script>`,
  },
];

test("validation gates correctness: ignored controls and missing actor tags fail", () => {
  assert.deepEqual(validateCompositionSources(manifest, goodSources), { errors: [], warnings: [] });
  const ignoring = [{ path: "index.html", text: `<div data-actor="logo"></div><script>window.__dreamcut.controls.headline; window.__dreamcut.segment_durations</script>` }];
  const result = validateCompositionSources(manifest, ignoring);
  assert.deepEqual(result.errors, [
    'Declared control "accent" is not read by the composition',
    'Declared control "spin_turns" is not read by the composition',
  ]);
  const untagged = validateCompositionSources(manifest, [{ path: "index.html", text: goodSources[0]!.text.replace('data-actor="logo"', "") }]);
  assert.deepEqual(untagged.errors, ['Declared actor "logo" has no element with data-actor="logo"']);
});

test("validation never gates coverage: no manifest and remote scripts are allowed", () => {
  const sources = [{ path: "index.html", text: `<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><div data-actor="extra"></div>` }];
  const result = validateCompositionSources(null, sources);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /remote resource/);
});

test("coverage is descriptive", () => {
  assert.deepEqual(compositionCoverage(null, [{ path: "index.html", text: `<i data-actor="a"></i>` }]), {
    has_manifest: false,
    declared_controls: 0,
    declared_actors: 0,
    declared_markers: 0,
    undeclared_actor_attributes: 1,
    missing_actor_attributes: 0,
  });
  assert.deepEqual(compositionCoverage(manifest, goodSources), {
    has_manifest: true,
    declared_controls: 3,
    declared_actors: 1,
    declared_markers: 3,
    undeclared_actor_attributes: 0,
    missing_actor_attributes: 0,
  });
});

test("a whole number with a few positions and no unit must be a named choice", () => {
  const manifest = parseCompositionManifest({ schema_version: 1, controls: [
    { id: "number", kind: "number", label: "Point number", default: 1, min: 1, max: 4, step: 1 },
    { id: "rows", kind: "number", label: "Rows", default: 2, min: 1, max: 4, step: 1, unit: "rows" },
    { id: "blur", kind: "number", label: "Blur", default: 4, min: 0, max: 20, step: 0.5 },
  ] });
  const problems = controlKindProblems(manifest.controls);
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /Point number.*choice/);
});

test("a choice option can take its name from a text control", () => {
  const manifest = parseCompositionManifest({ schema_version: 1, controls: [
    { id: "point_1", kind: "text", label: "Point 1", default: "Thesis" },
    { id: "section", kind: "choice", label: "Section", default: "1", options: [
      { value: "1", label: "First", label_from: "point_1" }, { value: "2", label: "Second" },
    ] },
  ] });
  const section = manifest.controls[1]!;
  assert.equal(section.kind === "choice" && section.options[0]!.label_from, "point_1");
  assert.throws(() => parseCompositionManifest({ schema_version: 1, controls: [
    { id: "section", kind: "choice", label: "Section", default: "1", options: [{ value: "1", label: "A", label_from: "missing" }, { value: "2", label: "B" }] },
  ] }), /label_from must name a text control/);
});

test("a fixed control keeps rendering from its value but is marked as never shown", () => {
  const manifest = parseCompositionManifest({ schema_version: 1, controls: [
    { id: "duration", kind: "number", label: "Duration", default: 1.5, min: 1, max: 4, unit: "s", fixed: true },
    { id: "accent", kind: "color", label: "Pen colour", default: "#1F4FBF", fixed: false },
  ] });
  assert.equal(manifest.controls[0]!.fixed, true);
  assert.equal("fixed" in manifest.controls[1]!, false);
  assert.throws(() => parseCompositionManifest({ schema_version: 1, controls: [{ id: "a", kind: "switch", label: "A", default: true, fixed: "yes" }] }), /fixed must be true or false/);
});

test("a canvas control chooses the render size of the root", async () => {
  const { applyCanvasSizeToHtml, canvasSizeForValues } = await import("./composition-manifest");
  const sized = parseCompositionManifest({
    schema_version: 1,
    controls: [{ id: "shape", kind: "choice", label: "Shape", default: "wide", options: [{ value: "wide", label: "16:9" }, { value: "tall", label: "9:16" }] }],
    canvas: { control: "shape", sizes: { wide: { width: 1920, height: 1080 }, tall: { width: 1080, height: 1920 } } },
  });
  const size = canvasSizeForValues(sized, resolveManifestValues(sized, { shape: "tall" }));
  assert.deepEqual(size, { width: 1080, height: 1920 });
  const html = applyCanvasSizeToHtml('<body><div id="root" data-composition-id="main" data-width="1920" data-height="1080"><div data-width="5"></div></div></body>', size!);
  assert.match(html, /data-composition-id="main" data-width="1080" data-height="1920">/);
  assert.match(html, /<div data-width="5">/);
  assert.throws(() => parseCompositionManifest({
    schema_version: 1,
    controls: [{ id: "shape", kind: "choice", label: "Shape", default: "wide", options: [{ value: "wide", label: "16:9" }, { value: "tall", label: "9:16" }] }],
    canvas: { control: "shape", sizes: { wide: { width: 1920, height: 1080 } } },
  }), /canvas size for "tall"/);
});

test("an opaque switch marks a full-screen render as expected, not a broken alpha encode", async () => {
  const { rendersOpaque } = await import("./composition-manifest");
  const card = parseCompositionManifest({
    schema_version: 1,
    controls: [{ id: "backdrop", kind: "switch", label: "Backdrop", default: true }],
    opaque_control: "backdrop",
  });
  assert.equal(rendersOpaque(card, resolveManifestValues(card, {})), true);
  assert.equal(rendersOpaque(card, resolveManifestValues(card, { backdrop: false })), false);
  assert.equal(rendersOpaque(manifest, resolveManifestValues(manifest, {})), false);
  assert.throws(() => parseCompositionManifest({ schema_version: 1, controls: [], opaque_control: "backdrop" }), /opaque_control/);
});

test("a declared length is written into the root and the layers that span it", async () => {
  const { applyDurationToHtml } = await import("./composition-manifest");
  const html = '<div id="root" data-composition-id="main" data-duration="6.4"><div class="clip" data-duration="6.4"></div><div class="clip" data-duration="1.2"></div></div>';
  const timed = applyDurationToHtml(html, 8);
  assert.match(timed, /data-composition-id="main" data-duration="8">/);
  assert.match(timed, /<div class="clip" data-duration="8">/);
  assert.match(timed, /<div class="clip" data-duration="1.2">/, "shorter clips keep their own length");
  const unauthored = '<div id="root" data-composition-id="main"><div data-duration="2"></div></div>';
  assert.equal(applyDurationToHtml(unauthored, 8), unauthored, "a composition that sizes itself is left alone");
});

test("Word Search Trace runs for its Overlay length and always fits its last outline", async () => {
  const { resolveTiming } = await import("./composition-timing");
  const raw = JSON.parse(fs.readFileSync(new URL("../../../.agents/skills/motion-graphics/templates/word-search-trace/dreamcut.controls.json", import.meta.url), "utf8"));
  const manifest = parseCompositionManifest(raw);
  assert.equal(resolveTiming(manifest.timing!, resolveManifestValues(manifest, {})).duration, 6.4);
  assert.equal(resolveTiming(manifest.timing!, resolveManifestValues(manifest, { length: 8 })).duration, 8);
  assert.equal(resolveTiming(manifest.timing!, resolveManifestValues(manifest, { length: 3 })).duration, 5.9);
});
