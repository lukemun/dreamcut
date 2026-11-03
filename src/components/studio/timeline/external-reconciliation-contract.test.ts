import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const editorClient = fs.readFileSync(
  path.join(root, "src/app/p/[projectId]/EditorClient.tsx"),
  "utf8",
);
const timelineStep = fs.readFileSync(
  path.join(root, "src/components/studio/TimelineStep.tsx"),
  "utf8",
);
const timelineData = fs.readFileSync(
  path.join(root, "src/components/studio/timeline/useTimelineData.ts"),
  "utf8",
);

test("external project updates reconcile data without remounting the timeline editor", () => {
  assert.doesNotMatch(editorClient, /key=\{reloadKey\}/);
  assert.doesNotMatch(editorClient, /setReloadKey/);
  assert.match(editorClient, /externalRefreshToken=\{externalRefreshToken\}/);
  assert.match(timelineStep, /requestRefresh\(\)/);
});

test("an in-place refresh keeps the mounted Player visible while fresh data loads", () => {
  assert.match(timelineData, /const hasLoadedRef = useRef\(false\)/);
  assert.match(timelineData, /if \(!hasLoadedRef\.current\) setLoading\(true\)/);
  assert.match(timelineData, /hasLoaded\s*\?\s*timelineClient\.getTimeline\(\)/);
  assert.match(timelineData, /Promise\.all\(\[timelineClient\.getTimeline\(\), timelineClient\.getCharacters\(\)\]\)/);
  assert.match(timelineData, /hasLoadedRef\.current = true/);
});
