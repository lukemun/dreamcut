import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const control = fs.readFileSync(new URL("./AddKeyframeControl.tsx", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("./TimelineInspectorPanel.tsx", import.meta.url), "utf8");

test("Properties offers add-keyframe before the first moment exists", () => {
  assert.match(panel, /keyframeUiVisible \|\| addKeyframeOptions.length > 0/);
  assert.match(panel, /addControl=\{<AddKeyframeControl/);
  assert.match(panel, /<AddKeyframeControl key=\{selectedElement.id\}/);
  assert.match(panel, /id: "volume".*add: props.toggleVolumeKeyframeAtPlayhead/);
});

test("the add affordance cannot toggle an existing keyframe off", () => {
  assert.match(control, /disabled=\{selected.exists\}/);
  assert.match(control, /if \(!selected.exists\) selected.add\(\)/);
  assert.doesNotMatch(control, /<select/);
});

test("strip follows the real timeline clock and separates seeking from adding", () => {
  const strip = fs.readFileSync(new URL("./KeyframeInspector.tsx", import.meta.url), "utf8");
  assert.match(panel, /playheadSeconds=\{props.timelinePlayheadSec - keyframeElement.timeline_start\}/);
  assert.match(strip, /aria-label="Clip playhead"/);
  assert.match(strip, /setPointerCapture/);
  assert.match(strip, /onPointerCancel/);
  assert.match(strip, /event.buttons === 0/);
});
