import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { INSPECTOR_SECTIONS, visibleInspectorSections } from "./inspector-sections";

const video = { visual: true, caption: false, alpha: false, rhythm: false, musicTools: false };
test("every section has exactly one reachable domain across supported selection contexts", () => {
  const seen = new Set<string>();
  for (const context of [video, {...video, alpha: true}, {...video, alpha: true, composition: true}, {...video, visual: false, rhythm: true, musicTools: true}, {...video, visual: false, caption: true}, {...video, visual: false, shape: true}]) {
    const current = new Set<string>();
    for (const domain of ["position", "motion", "color", "mask", "effects", "audio", "timing"]) {
      for (const id of visibleInspectorSections(domain, context)) {
        assert.ok(!current.has(id), `${id} has competing homes`);
        current.add(id); seen.add(id);
      }
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(INSPECTOR_SECTIONS).sort());
});
test("a placed motion graphic's controls live in Animation, only for motion graphics", () => {
  assert.ok(visibleInspectorSections("motion", {...video, alpha: true, composition: true}).has("motion-graphic"));
  assert.ok(!visibleInspectorSections("motion", {...video, alpha: true}).has("motion-graphic"));
});
test("blur is discoverable in Animation for video and transparent subjects", () => {
  for (const context of [video, {...video, alpha: true}]) {
    assert.ok(visibleInspectorSections("motion", context).has("blur-reveal"));
    assert.ok(!visibleInspectorSections("appearance", context).has("blur-reveal"));
  }
});
test("timing follows picture, caption and audio ownership; detail views do not leak controls", () => {
  for (const [domain, context] of [["timing", video], ["timing", {...video, caption: true}], ["timing", {...video, visual: false}]] as const) {
    assert.ok(visibleInspectorSections(domain, context).has("timing"));
    assert.equal(visibleInspectorSections("keyframe", context).size, 0);
    assert.equal(visibleInspectorSections("transition", context).size, 0);
  }
});
test("every mounted Properties section uses a registered stable identity", () => {
  // Media and audio sections mount in ElementMenu; a selected shape's sections mount in ShapeProperties;
  // the camera section is one shared control both use.
  const sources = ["ElementMenu.tsx", "ShapeProperties.tsx", "CameraFollowControl.tsx"].map((file) =>
    ts.createSourceFile(file, fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  const mounted = new Set<string>();
  function visit(node: ts.Node, source: ts.SourceFile) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "InspectorSection") {
      const attribute = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === "sectionId");
      assert.ok(attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isStringLiteral(attribute.initializer), "Sections must declare a stable sectionId");
      const id = attribute.initializer.text;
      assert.ok(id in INSPECTOR_SECTIONS, `${id} has no domain route`);
      assert.ok(!mounted.has(id), `${id} is mounted twice`);
      mounted.add(id);
    }
    ts.forEachChild(node, (child) => visit(child, source));
  }
  for (const source of sources) visit(source, source);
  assert.deepEqual([...mounted].sort(), Object.keys(INSPECTOR_SECTIONS).sort(), "Registered sections must be mounted, not merely declared");
});

test('Properties hierarchy uses shared section, item and disclosure owners', () => {
  const read = (file: string) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const menu = read('./ElementMenu.tsx');
  assert.ok(menu.includes('from "./InspectorSection"'));
  assert.ok(!menu.includes('function InspectorSection('), 'Do not fork the shared section inside the inspector');
  assert.ok(read('./ClipEffects.tsx').includes('<InspectorItemHeader'));
  const scopes = read('./ColorWaveform.tsx');
  assert.ok(scopes.includes('<InspectorDisclosure title="Video scopes"'));
  assert.ok(!scopes.includes('Show video scopes'), 'Scope visibility is a compact disclosure, not a full-row action');
});


test("color, masks and effects have dedicated homes; blend remains with Layout geometry", () => {
  assert.deepEqual([...visibleInspectorSections("color", video)], ["color"]);
  assert.deepEqual([...visibleInspectorSections("effects", video)], ["stabilization", "effects"]);
  for (const id of ["shape-mask", "background-removal", "chroma-key"] as const) assert.ok(visibleInspectorSections("mask", video).has(id));
  assert.ok(visibleInspectorSections("position", video).has("placement"));
  assert.ok(visibleInspectorSections("position", video).has("perspective"));
  assert.ok(!visibleInspectorSections("position", video).has("timing"));
});
