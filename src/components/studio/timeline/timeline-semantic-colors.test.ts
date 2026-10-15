import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const globalsPath = new URL("../../../app/globals.css", import.meta.url);
const canvasTimelinePath = new URL("./CanvasTimeline.tsx", import.meta.url);
const frameTagControlsPath = new URL("./FrameTagControls.tsx", import.meta.url);
const timelineToolbarPath = new URL("./TimelineToolbar.tsx", import.meta.url);
const timelineStepPath = new URL("../TimelineStep.tsx", import.meta.url);
const sonnerPath = new URL("../../ui/sonner.tsx", import.meta.url);
const nextConfigPath = new URL("../../../../next.config.ts", import.meta.url);

function cssToken(source: string, name: string) {
  const match = source.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `Missing --${name}`);
  return match[1]!.trim().toLowerCase();
}

test("saved review marks use a distinct semantic color from the playhead", () => {
  const css = fs.readFileSync(globalsPath, "utf8");
  const playheadColor = cssToken(css, "timeline-position-color");
  const reviewMarkerColor = cssToken(css, "timeline-review-marker-color");

  assert.notEqual(reviewMarkerColor, playheadColor);

  const canvasTimeline = fs.readFileSync(canvasTimelinePath, "utf8");
  const frameTagControls = fs.readFileSync(frameTagControlsPath, "utf8");
  assert.match(canvasTimeline, /<TimelineMarks /);
  const markers = fs.readFileSync(new URL("./TimelineMarks.tsx", import.meta.url), "utf8");
  assert.match(markers, /var\(--timeline-review-marker-color\)/);
  assert.doesNotMatch(markers, /var\(--timeline-position-color\)/);
  for (const consumer of ["LibraryRhythmInspector.tsx", "../storyboard/SourceAudioTimeline.tsx"]) {
    assert.match(fs.readFileSync(new URL(consumer, import.meta.url), "utf8"), /<TimelineMarks /);
  }
  assert.match(frameTagControls, /var\(--timeline-review-marker-color\)/);
});

test("mark management stays grouped in the review index", () => {
  const frameTagControls = fs.readFileSync(frameTagControlsPath, "utf8");
  const popoverIndex = frameTagControls.indexOf("{open ? createPortal(");
  assert.ok(popoverIndex >= 0, "Missing marks popover");
  // The popover redesign titles the index "Marks", names the point mark for the viewer,
  // and drops the footer "Clear all"; the bar's trash button is the single clear action.
  assert.match(frameTagControls, /fontWeight: 600 \}\}>Marks<\/span>/);
  assert.match(frameTagControls, /left: panelLeft/);
  assert.match(frameTagControls, /Clear all marks/);
  assert.match(frameTagControls, /pointLabel = "Video mark — select a point on the viewer"/);
  assert.equal(
    frameTagControls.match(/onClick=\{clearAndClose\}/g)?.length,
    1,
    "The immediate trash button clears marks and closes the menu",
  );
  assert.doesNotMatch(frameTagControls, /Addressed|Filter review marks|All marks/);
  assert.doesNotMatch(frameTagControls, /More marking options|markMenuOpen/);
  assert.ok(frameTagControls.indexOf('onClick={onStartPointMark}') < popoverIndex,
    "Point marking is directly available beside frame marking");
  assert.match(frameTagControls, /position:\s*"fixed"/);
});

test("timeline actions remain directly reachable in a narrow vertical workspace", () => {
  const timelineToolbar = fs.readFileSync(timelineToolbarPath, "utf8");
  const timelineStep = fs.readFileSync(timelineStepPath, "utf8");

  // The bottom transport bar was removed: playback, edit-point skips and timecode live in
  // the player's preview controls, history in the timeline toolbar, marks in the review dock.
  const previewControls = fs.readFileSync(new URL("../../../lib/frame-runtime/preview-controls.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(timelineStep, /timeline-transport-toolbar/);
  assert.match(timelineStep, /className="timeline-history-controls"/);
  assert.match(timelineStep, /historyControls=\{historyControls\}/);
  assert.match(timelineToolbar, /\{historyControls\}/);
  // Marks sit in the timeline toolbar unless a review dock provides their slot.
  assert.match(timelineStep, /reviewControls=\{dock \? undefined : <>\{marksNode\}/);
  assert.match(timelineStep, /dock\?\.marksTarget \? createPortal\(marksNode, dock\.marksTarget\) : null/);
  assert.match(timelineStep, /onPreviousEditPoint=\{\(\) => seekToFrame\(previousTimelineEditPointFrame/);
  assert.match(timelineStep, /onNextEditPoint=\{\(\) => seekToFrame\(nextTimelineEditPointFrame/);
  assert.match(previewControls, /aria-label="Go to previous edit point"/);
  assert.match(previewControls, /aria-label="Go to next edit point"/);
  assert.match(previewControls, /className="preview-time" aria-label="Preview time"/);
  assert.doesNotMatch(timelineStep, /className="timeline-snap-control"/);
  assert.match(timelineToolbar, /aria-label="Timeline editing"/);
  assert.match(timelineStep, /headerActionsTarget \? createPortal\(/);
  assert.match(timelineStep, /<DownloadIcon data-icon="inline-start" \/>[\s\S]*Export/);
  assert.match(timelineStep, /variant="outline"[\s\S]*size="sm"[\s\S]*Export/);
});

// Marking no longer raises a confirmation toast; the mark appears in the marks bar.
test("frame marks do not raise confirmation toasts", () => {
  const timelineStep = fs.readFileSync(timelineStepPath, "utf8");
  assert.ok(!/toast\.success\(message,\s*\{\s*duration:\s*1400/.test(timelineStep));
});

test("development and notification chrome stays clear of playback controls", () => {
  const css = fs.readFileSync(globalsPath, "utf8");
  const sonner = fs.readFileSync(sonnerPath, "utf8");
  const nextConfig = fs.readFileSync(nextConfigPath, "utf8");

  assert.match(nextConfig, /devIndicators:\s*false/);
  assert.match(sonner, /position="bottom-right"/);
  assert.match(sonner, /offset=\{\{ bottom: 60, right: 12 \}\}/);
  assert.match(sonner, /visibleToasts=\{3\}/);
  assert.match(sonner, /"--width": "280px"/);
  assert.match(css, /\.cn-toast\[data-sonner-toast\]\[data-styled="true"\][\s\S]*min-height:\s*42px/);
});
