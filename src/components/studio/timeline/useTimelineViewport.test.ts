import assert from "node:assert/strict";
import test from "node:test";

import {
  clampScrollSecWithinBounds,
  defaultTimelineZoom,
  readTimelineViewport,
  resolveAnchoredZoomScroll,
  resolveWorkspaceLayout,
  serializeWorkspaceLayoutChoice,
  workspaceLayoutForShape,
} from "@/components/studio/timeline/useTimelineViewport";

test("workspace layout follows the video shape: vertical and square shapes edit Tall, landscape Wide", () => {
  assert.equal(workspaceLayoutForShape("9:16"), "9:16");
  assert.equal(workspaceLayoutForShape("4:5"), "9:16");
  assert.equal(workspaceLayoutForShape("1:1"), "9:16");
  assert.equal(resolveWorkspaceLayout(null, "1:1"), "9:16");
  assert.equal(workspaceLayoutForShape("16:9"), "16:9");
  assert.equal(resolveWorkspaceLayout(null, "4:5"), "9:16");
  assert.equal(resolveWorkspaceLayout("invalid", "16:9"), "16:9");
});

test("a manual Tall/Wide flip is remembered only for the shape it was made for", () => {
  const wideForVertical = serializeWorkspaceLayoutChoice("16:9", "9:16");
  assert.equal(resolveWorkspaceLayout(wideForVertical, "9:16"), "16:9");
  assert.equal(resolveWorkspaceLayout(wideForVertical, "16:9"), "16:9");
  assert.equal(resolveWorkspaceLayout(wideForVertical, "4:5"), "9:16");
  assert.equal(resolveWorkspaceLayout(wideForVertical, "1:1"), "9:16");
  assert.equal(resolveWorkspaceLayout(serializeWorkspaceLayoutChoice("16:9", "1:1"), "1:1"), "16:9");
  const tallForLandscape = serializeWorkspaceLayoutChoice("9:16", "16:9");
  assert.equal(resolveWorkspaceLayout(tallForLandscape, "16:9"), "9:16");
  assert.equal(resolveWorkspaceLayout(tallForLandscape, "9:16"), "9:16");
});

test("a legacy layout without a shape no longer overrides the video shape", () => {
  assert.equal(resolveWorkspaceLayout("9:16", "16:9"), "16:9");
  assert.equal(resolveWorkspaceLayout("16:9", "9:16"), "9:16");
});

test("clampScrollSecWithinBounds keeps scroll inside the visible range", () => {
  assert.equal(clampScrollSecWithinBounds(-2, 10, 4), 0);
  assert.equal(clampScrollSecWithinBounds(12, 10, 4), 6);
  assert.equal(clampScrollSecWithinBounds(3, 10, 4), 3);
});

test("resolveAnchoredZoomScroll keeps the playhead at the same viewport position", () => {
  assert.equal(resolveAnchoredZoomScroll({
    anchorSec: 58,
    currentScrollSec: 52,
    currentVisibleDuration: 12,
    nextVisibleDuration: 3,
    totalDuration: 120,
  }), 56.5);
});

test("resolveAnchoredZoomScroll clamps the anchored view at timeline edges", () => {
  assert.equal(resolveAnchoredZoomScroll({
    anchorSec: 1,
    currentScrollSec: 0,
    currentVisibleDuration: 10,
    nextVisibleDuration: 2,
    totalDuration: 120,
  }), 0.8);
  assert.equal(resolveAnchoredZoomScroll({
    anchorSec: 120,
    currentScrollSec: 110,
    currentVisibleDuration: 10,
    nextVisibleDuration: 2,
    totalDuration: 120,
  }), 118);
});

test("project viewport restores zoom, lane height and custom expansions without accepting corrupt values", async () => {
  const {readTimelineViewport} = await import('./useTimelineViewport');
  assert.deepEqual(readTimelineViewport(JSON.stringify({version:1,zoomLevel:7.78,laneScale:0.8,scrollSec:20,laneManualDeltaByKey:{visual_0:120}})), {zoomLevel:7.78,laneScale:0.8,scrollSec:20,laneManualDeltaByKey:{visual_0:120}});
  assert.equal(readTimelineViewport('{bad').zoomLevel,1);
  assert.equal(readTimelineViewport('{"version":2,"zoomLevel":7}').zoomLevel,1);
  assert.equal(readTimelineViewport('{"version":1,"zoomLevel":-5,"laneScale":999}').zoomLevel,0.25);
  assert.equal(readTimelineViewport('{"version":1,"zoomLevel":-5,"laneScale":999}').laneScale,4);
});


test("new views show ten seconds while existing project zoom is preserved", () => {
  for (const duration of [30, 176, 3600]) {
    assert.equal(duration / defaultTimelineZoom(duration), 10);
    assert.equal(duration / readTimelineViewport(null, duration).zoomLevel, 10);
  }
  assert.equal(defaultTimelineZoom(5), 1);
  assert.equal(readTimelineViewport(JSON.stringify({version:1, zoomLevel:80}), 176).zoomLevel, 80);
});

test("new viewports use half-height lanes and preserve saved custom heights", () => {
  assert.equal(readTimelineViewport(null, 30).laneScale, 0.5);
  assert.equal(readTimelineViewport(JSON.stringify({version:1,laneScale:0.8}), 30).laneScale, 0.8);
});
