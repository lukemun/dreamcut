import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveClipPointerSelection,
  resolvePointerDownTarget,
  TIMELINE_RULER_HEIGHT,
  TIMELINE_SIDEBAR_WIDTH,
} from "@/components/studio/timeline/timeline-interaction-targets";

test("plain clip press collapses a stale multi-selection before dragging", () => {
  assert.deepEqual(
    resolveClipPointerSelection("clip-2", ["clip-1", "clip-2", "clip-3"], false),
    { selectionMode: "replace", beginDragElementIds: ["clip-2"] },
  );
});

test("short montage clips remain selectable beneath overlapping seam, trim and playhead targets", () => {
  const base = {
    x: 224, y: 140, isOverPlayhead: true, addLaneButtonRect: null,
    clipRegions: [{ elementId: "image", x: 220, y: 110, width: 8, height: 40 }],
    resizeRegions: [{ elementId: "image", edge: "start" as const, x: 220, y: 110, width: 6, height: 40 }],
    transitionRegions: [{ kind: "existing" as const, transitionId: "blur", x: 214, y: 125, width: 28, height: 18 }],
    muteRegions: [], soloRegions: [], laneResizeRegions: [], laneMenuBtnRegions: [],
    menuBtnRegions: [], beatMenuBtnRegions: [], beatResizeRegions: [], gainRegions: [],
    gainKeyframeRegions: [], envelopePointRegions: [], envelopeSegmentRegions: [],
  };
  assert.deepEqual(resolvePointerDownTarget(base), { kind: "clip_body", elementId: "image" });
  assert.deepEqual(resolvePointerDownTarget({...base, y:TIMELINE_RULER_HEIGHT+8, isOverPlayhead:false,
    clipRegions:[{elementId:"image",x:220,y:TIMELINE_RULER_HEIGHT,width:8,height:40}],
    resizeRegions:[],transitionRegions:[]}), {kind:"clip_body",elementId:"image"});
  assert.deepEqual(resolvePointerDownTarget({ ...base, y: 112, isOverPlayhead: false }),
    { kind: "clip_resize", elementId: "image", edge: "start" });
  assert.deepEqual(resolvePointerDownTarget({ ...base, resizeRegions: [], transitionRegions: [],
    clipRegions: [{ elementId: "image", x: 200, y: 110, width: 100, height: 40 }] }),
    { kind: "clip_body", elementId: "image" });
});

test("Shift changes selection without starting an accidental group drag", () => {
  assert.deepEqual(
    resolveClipPointerSelection("clip-2", ["clip-1"], true),
    { selectionMode: "add", beginDragElementIds: [] },
  );
  assert.deepEqual(
    resolveClipPointerSelection("clip-2", ["clip-1", "clip-2"], true),
    { selectionMode: "toggle_off", beginDragElementIds: [] },
  );
});

test("clip resize handle wins over playhead scrub when regions overlap", () => {
  const target = resolvePointerDownTarget({
    x: 220,
    y: 120,
    isOverPlayhead: true,
    addLaneButtonRect: null,
    clipRegions: [],
    resizeRegions: [{ elementId: "clip-1", edge: "start", x: 210, y: 110, width: 20, height: 20 }],
    transitionRegions: [],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [],
    beatMenuBtnRegions: [],
    beatResizeRegions: [],
    gainRegions: [],
    gainKeyframeRegions: [],
    envelopePointRegions: [],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "clip_resize", elementId: "clip-1", edge: "start" });
});

test("beat menu button wins over beat boundary resize in the ruler", () => {
  const target = resolvePointerDownTarget({
    x: TIMELINE_SIDEBAR_WIDTH + 20,
    y: TIMELINE_RULER_HEIGHT - 10,
    isOverPlayhead: false,
    addLaneButtonRect: null,
    clipRegions: [],
    resizeRegions: [],
    transitionRegions: [],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [],
    beatMenuBtnRegions: [{ beatId: "beat-1", x: 200, y: TIMELINE_RULER_HEIGHT - 24, size: 18 }],
    beatResizeRegions: [{ beatId: "beat-1", edge: "end", x: 198, y: TIMELINE_RULER_HEIGHT - 28, width: 24, height: 24 }],
    gainRegions: [],
    gainKeyframeRegions: [],
    envelopePointRegions: [],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "beat_menu", beatId: "beat-1" });
});

test("clip menu button wins over clip resize and clip body drag", () => {
  const target = resolvePointerDownTarget({
    x: 320,
    y: 180,
    isOverPlayhead: false,
    addLaneButtonRect: null,
    clipRegions: [{ elementId: "clip-1", x: 280, y: 150, width: 120, height: 60 }],
    resizeRegions: [{ elementId: "clip-1", edge: "end", x: 310, y: 170, width: 20, height: 20 }],
    transitionRegions: [],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [{ elementId: "clip-1", x: 312, y: 172, size: 16 }],
    beatMenuBtnRegions: [],
    beatResizeRegions: [],
    gainRegions: [],
    gainKeyframeRegions: [],
    envelopePointRegions: [],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "clip_menu", elementId: "clip-1" });
});

test("gain keyframe wins over clip body drag when both are hit", () => {
  const target = resolvePointerDownTarget({
    x: 350,
    y: 200,
    isOverPlayhead: false,
    addLaneButtonRect: null,
    clipRegions: [{ elementId: "clip-1", x: 280, y: 150, width: 120, height: 80 }],
    resizeRegions: [],
    transitionRegions: [],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [],
    beatMenuBtnRegions: [],
    beatResizeRegions: [],
    gainRegions: [{ elementId: "clip-1", x: 288, y: 160, width: 104, height: 60 }],
    gainKeyframeRegions: [{ elementId: "clip-1", keyframeIndex: 2, x: 350, y: 200, radius: 8 }],
    envelopePointRegions: [],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "gain_keyframe", elementId: "clip-1", keyframeIndex: 2 });
});

test("visual keyframe diamond wins over clip body drag and returns its exact time", () => {
  const target = resolvePointerDownTarget({
    x: 350,
    y: 220,
    isOverPlayhead: false,
    addLaneButtonRect: null,
    clipRegions: [{ elementId: "clip-1", x: 280, y: 150, width: 160, height: 90 }],
    resizeRegions: [],
    transitionRegions: [],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [],
    beatMenuBtnRegions: [],
    beatResizeRegions: [],
    gainRegions: [],
    gainKeyframeRegions: [],
    visualKeyframeRegions: [{ elementId: "clip-1", timeSec: 5.267, x: 350, y: 220, radius: 9 }],
    envelopePointRegions: [],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "visual_keyframe", elementId: "clip-1", timeSec: 5.267 });
});

test("visual keyframe diamond wins when the playhead is directly over it", () => {
  const target = resolvePointerDownTarget({
    x: 350,
    y: 220,
    isOverPlayhead: true,
    addLaneButtonRect: null,
    clipRegions: [{ elementId: "clip-1", x: 280, y: 150, width: 160, height: 90 }],
    resizeRegions: [],
    transitionRegions: [],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [],
    beatMenuBtnRegions: [],
    beatResizeRegions: [],
    gainRegions: [],
    gainKeyframeRegions: [],
    visualKeyframeRegions: [{ elementId: "clip-1", timeSec: 5.267, x: 350, y: 220, radius: 9 }],
    envelopePointRegions: [],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "visual_keyframe", elementId: "clip-1", timeSec: 5.267 });
});

test("selected gain line wins over clip body drag when both are hit", () => {
  const target = resolvePointerDownTarget({
    x: 350,
    y: 205,
    isOverPlayhead: false,
    addLaneButtonRect: null,
    clipRegions: [{ elementId: "clip-1", x: 280, y: 150, width: 120, height: 80 }],
    resizeRegions: [],
    transitionRegions: [],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [],
    beatMenuBtnRegions: [],
    beatResizeRegions: [],
    gainRegions: [{ elementId: "clip-1", x: 288, y: 160, width: 104, height: 60 }],
    gainKeyframeRegions: [],
    envelopePointRegions: [],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "gain_line", elementId: "clip-1" });
});

test("envelope endpoint keyframe wins over clip edge resize when overlapping", () => {
  const target = resolvePointerDownTarget({
    x: 398,
    y: 205,
    isOverPlayhead: false,
    addLaneButtonRect: null,
    clipRegions: [{ elementId: "clip-1", x: 280, y: 150, width: 120, height: 80 }],
    resizeRegions: [{ elementId: "clip-1", edge: "end", x: 392, y: 170, width: 16, height: 60 }],
    transitionRegions: [],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [],
    beatMenuBtnRegions: [],
    beatResizeRegions: [],
    gainRegions: [],
    gainKeyframeRegions: [],
    envelopePointRegions: [{ elementId: "clip-1", pointIndex: 4, x: 398, y: 205, radius: 8 }],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "gain_point", elementId: "clip-1", pointIndex: 4 });
});

test("transition create seam resolves before clip body drag", () => {
  const target = resolvePointerDownTarget({
    x: 350,
    y: 160,
    isOverPlayhead: false,
    addLaneButtonRect: null,
    clipRegions: [{ elementId: "clip-1", x: 280, y: 140, width: 140, height: 70 }],
    resizeRegions: [],
    transitionRegions: [{
      kind: "create",
      fromElementId: "clip-1",
      toElementId: "clip-2",
      x: 341,
      y: 151,
      width: 18,
      height: 18,
    }],
    muteRegions: [],
    soloRegions: [],
    laneResizeRegions: [],
    laneMenuBtnRegions: [],
    menuBtnRegions: [],
    beatMenuBtnRegions: [],
    beatResizeRegions: [],
    gainRegions: [],
    gainKeyframeRegions: [],
    envelopePointRegions: [],
    envelopeSegmentRegions: [],
  });

  assert.deepEqual(target, { kind: "transition_create", fromElementId: "clip-1", toElementId: "clip-2" });
});

test("track header eye toggles visibility separately from mute", () => {
  const base = {
    x: 0, y: 0, isOverPlayhead: false, addLaneButtonRect: null,
    clipRegions: [], resizeRegions: [], transitionRegions: [],
    muteRegions: [{ laneKey: "visual_0", x: 140, y: 100, size: 26 }], soloRegions: [],
    hideRegions: [{ laneKey: "visual_0", x: 170, y: 100, size: 26 }],
    laneResizeRegions: [], laneMenuBtnRegions: [], menuBtnRegions: [], beatMenuBtnRegions: [], beatResizeRegions: [],
    gainRegions: [], gainKeyframeRegions: [], envelopePointRegions: [], envelopeSegmentRegions: [],
  };
  assert.deepEqual(resolvePointerDownTarget({ ...base, x: 150, y: 110 }), { kind: "mute_lane", laneKey: "visual_0" });
  assert.deepEqual(resolvePointerDownTarget({ ...base, x: 180, y: 110 }), { kind: "hide_lane", laneKey: "visual_0" });
});
