import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const timelineDir = path.join(process.cwd(), "src/components/studio/timeline");
const reporter = fs.readFileSync(path.join(timelineDir, "useAutomaticPreviewQuality.ts"), "utf8");
const settings = fs.readFileSync(path.join(timelineDir, "PreviewQualitySettings.tsx"), "utf8");

test("a hidden tab never reports the player's size, and reports once it is shown", () => {
  assert.match(reporter, /document\.visibilityState !== "visible"\) return;/);
  assert.match(reporter, /document\.addEventListener\("visibilitychange", schedule\)/);
  assert.match(reporter, /document\.removeEventListener\("visibilitychange", schedule\)/);
});

test("preview settings poll only while previews prepare, and re-read when the prepared size changes", () => {
  assert.doesNotMatch(settings, /setInterval/);
  assert.match(settings, /if \(preparing\) timer = window\.setTimeout/);
  assert.match(settings, /addEventListener\(PREVIEW_QUALITY_EVENT, read\)/);
  assert.match(settings, /event\.key === previewQualityKey\(projectId\)/);
});
