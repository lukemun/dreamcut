import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const timelineDir = path.join(process.cwd(), "src/components/studio/timeline");
const studioDir = path.join(process.cwd(), "src/components/studio");

function read(relativePath: string) {
  return fs.readFileSync(path.join(timelineDir, relativePath), "utf8");
}

test("readiness and the Player shell never command playback directly", () => {
  for (const relativePath of [
    "usePreviewReadiness.ts",
    "TimelinePlaybackShell.tsx",
    "playback-shell-helpers.ts",
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /\.play\s*\(/, `${relativePath} must not start playback`);
    assert.doesNotMatch(
      source,
      /\bHTMLMediaElement\b[\s\S]*?\.pause\s*\(/,
      `${relativePath} must not pause individual media`,
    );
  }
});

test("the timeline has no ungated preview transport feature flag", () => {
  const source = fs.readFileSync(path.join(studioDir, "TimelineStep.tsx"), "utf8");
  assert.doesNotMatch(source, /timeline-preview-gate/);
  assert.match(source, /readiness=\{previewReadiness\}/);
  assert.match(source, /readiness:\s*previewReadiness/);
});

test("all Player play commands live in the playback controller", () => {
  const shellSource = read("TimelinePlaybackShell.tsx");
  const readinessSource = read("usePreviewReadiness.ts");
  const controllerSource = read("useTimelinePlaybackController.ts");

  assert.doesNotMatch(shellSource, /\binstance\.play\s*\(/);
  assert.doesNotMatch(readinessSource, /\.play\s*\(/);
  assert.match(controllerSource, /\bplayer\.play\s*\(/);
});

test("R replays the timeline without stealing rhythm-viewer or proposal replay", () => {
  const controllerSource = read("useTimelinePlaybackController.ts");
  const viewerSource = read("LibraryRhythmInspector.tsx");
  const timelineSource = fs.readFileSync(path.join(studioDir, "TimelineStep.tsx"), "utf8");
  assert.match(controllerSource, /event\.key\.toLowerCase\(\) === "r"/);
  assert.match(controllerSource, /target\.closest\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
  assert.match(controllerSource, /if \(isReplay \|\| event\.shiftKey\) \{\s*playFromStart\(\)/);
  // reviewDrawerOpen now means the Proposals tab of the review dock (or the local proposals drawer).
  assert.match(timelineSource, /const reviewDrawerOpen = dock \? dock\.tab === "proposals" : localReviewOpen;/);
  assert.match(timelineSource, /replayShortcutDisabled: reviewDrawerOpen,/);
  assert.match(viewerSource, /else \{ seek\(windowStart\); wantPlayback\.current = true; void playChannels\(\); \}/);
});
