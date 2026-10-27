import test from "node:test";
import { seedWorkspaceFromProject } from "./assembly-source-seed";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject, readMetadata, readTimeline, writeTimeline, writeTimelineAndMetadata,
  captureProjectHistorySnapshot, restoreProjectHistorySnapshot, type TimelineFile } from "./store";
import type { TimelineElement } from "@/components/studio/timeline/types";

test("invalid placements cannot change timeline, metadata or history through either store writer or restore", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lane-integrity-"));
  const prior = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    const element = { id: "caption", project_id: "fixture", type: "caption_text", lane_key: "captions_0",
      timeline_start: 0, duration: 3, props: { text: "Hello world" }, removed_at: null } as TimelineElement;
    writeTimeline("fixture", { elements: [element], transitions: [] }, "fixture");
    const timelinePath = path.join(root, "fixture", "timeline.json");
    const metadataPath = path.join(root, "fixture", "metadata.json");
    const before = fs.readFileSync(timelinePath, "utf8");
    const metadataBefore = fs.readFileSync(metadataPath, "utf8");
    const invalid: TimelineFile = { elements: [{ ...element, lane_key: "captions" }], transitions: [] };
    assert.throws(() => writeTimeline("fixture", invalid, "bad"), /not visible\/editable/);
    assert.throws(() => writeTimelineAndMetadata("fixture", invalid, { ...readMetadata("fixture"), title: "Changed" }, "bad"), /not visible\/editable/);
    assert.equal(fs.readFileSync(timelinePath, "utf8"), before);
    assert.equal(fs.readFileSync(metadataPath, "utf8"), metadataBefore);
    const snapshot = captureProjectHistorySnapshot("fixture", "valid");
    const historyPath = path.join(root, "fixture", "history", snapshot.id);
    const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    history.timeline = invalid;
    fs.writeFileSync(historyPath, JSON.stringify(history));
    assert.throws(() => restoreProjectHistorySnapshot("fixture", snapshot.id), /not visible\/editable/);
    assert.equal(fs.readFileSync(timelinePath, "utf8"), before);
    assert.equal(fs.readFileSync(metadataPath, "utf8"), metadataBefore);
    // Old deleted rows do not prevent a valid edit or restore.
    writeTimeline("fixture", { elements: [element, { ...invalid.elements[0]!, id: "deleted", removed_at: "2026-01-01" }], transitions: [] }, "valid");
    assert.equal(readTimeline("fixture").elements.length, 2);
    createProject("target", "web");
    const targetPath = path.join(root, "target", "timeline.json");
    const targetBefore = fs.readFileSync(targetPath, "utf8");
    // Simulate an old/outside write; copying must reject it before copying media.
    fs.writeFileSync(timelinePath, JSON.stringify(invalid));
    assert.throws(() => seedWorkspaceFromProject("fixture", "target"), /not visible\/editable/);
    assert.equal(fs.readFileSync(targetPath, "utf8"), targetBefore);
  } finally {
    if (prior === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
