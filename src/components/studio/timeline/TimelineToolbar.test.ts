import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  formatZoomPercent,
  nextScrubPercentValue,
  scrubPercentValueFromVerticalDrag,
} from "@/components/studio/timeline/TimelineToolbar";

const toolbarSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/studio/timeline/TimelineToolbar.tsx"),
  "utf8",
);

test("timeline toolbar does not expose the unsupported Auto-place action", () => {
  assert.doesNotMatch(toolbarSource, /Auto-place|onAutoplace|showAutoplaceCta/);
});

test("lane height retains its percentage display", () => {
  assert.equal(formatZoomPercent(100), "100%");
  assert.equal(formatZoomPercent(125.4), "125%");
});

test("nextScrubPercentValue suppresses repeated updates at the percentage ceiling", () => {
  assert.equal(nextScrubPercentValue(1_000, 1_004, 25, 1_000), null);
  assert.equal(nextScrubPercentValue(1_000, 4_000, 25, 1_000), null);
});

test("nextScrubPercentValue returns a bounded changed value", () => {
  assert.equal(nextScrubPercentValue(996, 1_004, 25, 1_000), 1_000);
  assert.equal(nextScrubPercentValue(100, -50, 25, 1_000), 25);
});

test("percent scrubbing suppresses subpixel repeats and non-finite input", () => {
  assert.equal(nextScrubPercentValue(125, 125.4, 25, 10_000), null);
  assert.equal(nextScrubPercentValue(125, 124.9, 25, 10_000), null);
  assert.equal(nextScrubPercentValue(125, 125.6, 25, 10_000), 126);
  assert.equal(nextScrubPercentValue(125, NaN, 25, 10_000), null);
  assert.equal(nextScrubPercentValue(125, Infinity, 25, 10_000), null);
});

test("vertical scrub drag increases downward toward plus and decreases upward toward minus", () => {
  assert.equal(scrubPercentValueFromVerticalDrag(100, -10, 4), 60);
  assert.equal(scrubPercentValueFromVerticalDrag(100, 10, 4), 140);
});

test("vertical scrub can amplify only the upward decrease gesture", () => {
  assert.equal(scrubPercentValueFromVerticalDrag(100, -10, 4, 2), 20);
  assert.equal(scrubPercentValueFromVerticalDrag(100, 10, 4, 2), 140);
});


test("timeline time scale and lane height share a joined control without a fit button", () => {
  assert.match(toolbarSource, /<ScrubPercentControl label="Seconds visible across timeline"/);
  assert.match(toolbarSource, /precision=\{1\} unit="seconds"/);
  assert.doesNotMatch(toolbarSource, /ScrubNumberInput/);
  assert.match(toolbarSource, /unit="seconds" joined="start"/);
  // Lane height now carries an optional tall-layout icon between its label and join side.
  assert.match(toolbarSource, /label="Lane height"\s+icon=\{[^\n]*\}\s+joined="end"/);
  assert.doesNotMatch(toolbarSource, /onFitAll|Fit all/);
  assert.doesNotMatch(toolbarSource, /zoomPercent|onZoomPercentChange/);
});

test("seconds scrubbing preserves tenths and clamps without repeated commits", () => {
  assert.equal(nextScrubPercentValue(10, 10.1, 1, 120, 1), 10.1);
  assert.equal(nextScrubPercentValue(10, 10.01, 1, 120, 1), null);
  assert.equal(nextScrubPercentValue(1, 0.9, 1, 120, 1), null);
  assert.equal(nextScrubPercentValue(119.9, 120.1, 1, 120, 1), 120);
});

test("seconds zoom pulls inward on downward drag while lane height stays unchanged", () => {
  assert.equal(scrubPercentValueFromVerticalDrag(10, 10, 0.1, 1, true), 9);
  assert.equal(scrubPercentValueFromVerticalDrag(10, -10, 0.1, 1, true), 11);
  assert.equal(scrubPercentValueFromVerticalDrag(100, 10, 5), 150);
});
