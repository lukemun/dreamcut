import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const read = (file: string) => fs.readFileSync(new URL(file, import.meta.url), "utf8");
test("selecting a keyframe seeks and selects its moment without changing its property domain without opening a replacement inspector", () => {
  const code = read("./TimelineInspectorPanel.tsx");
  const tree = ts.createSourceFile("panel.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "selectKeyframe") {
      found = true;
      const calls: string[] = [];
      function collect(n: ts.Node) { if (ts.isCallExpression(n)) calls.push(n.expression.getText(tree)); ts.forEachChild(n, collect); }
      collect(node);
      assert.ok(calls.includes("setSelectedKeyframeTimeSeconds"));
      assert.ok(calls.includes("props.onSeekTimelineSeconds"));
      assert.ok(!calls.includes("setElementInspectorSubpanel"));
      assert.ok(!calls.includes("setCaptionInspectorSubpanel"));
      assert.ok(!node.getText(tree).includes('Subpanel("keyframe")'), "Never open a replacement keyframe inspector");
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(found);
  for (const file of ["./ElementMenu.tsx", "./TimelineInspectorPanel.tsx"]) assert.ok(!read(file).includes("Back to Properties"));
});
test("offscreen positions and blur use their supported ranges in keyframe controls", () => {
  const code = read("./KeyframeInspector.tsx");
  for (const axis of ["x", "y"]) {
    assert.ok(code.includes(`media_offset_${axis}: { min: -2, max: 2`));
    assert.ok(code.includes(`directional_blur_${axis}: { min: 0, max: 1080, step: 1, unit: "px" }`));
  }
});
test("specialized blur shares property actions rather than a private diamond implementation", () => {
  const code = read("./TransitionEffectControls.tsx");
  assert.ok(code.includes("<InspectorPropertyControl"));
  assert.ok(code.includes("hasKeyframeAtTime"));
  assert.ok(code.includes("removeKeyframesAtTime"));
  assert.ok(!code.includes(">◇</button>"));
});

test("selected keyframe values have one global owner inside the collapsible strip", () => {
  const panel = read("./TimelineInspectorPanel.tsx");
  assert.equal((panel.match(/<KeyframeValuesPanel/g) ?? []).length, 1);
  assert.ok(panel.indexOf("<KeyframeValuesPanel") > panel.indexOf("<KeyframeStrip"));
  assert.ok(panel.indexOf("<KeyframeValuesPanel") < panel.indexOf("</KeyframeStrip>"));
  assert.ok(!read("./ElementMenu.tsx").includes("<KeyframeValuesPanel"));
  const strip = read("./KeyframeInspector.tsx");
  assert.ok(strip.includes('<InspectorDisclosure title="Keyframes"'));
  assert.ok(!strip.includes('rotate(45deg)'));
});
