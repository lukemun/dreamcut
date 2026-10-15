import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createProject, readTimelineSnapshot } from "./store";

test("timeline context revision hashes the exact source bytes without rewriting migration", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-snapshot-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    const filename = path.join(root, "fixture", "timeline.json");
    const bytes = '{\n "elements": [], "transitions": []\n}\n';
    fs.writeFileSync(filename, bytes);
    const snapshot = readTimelineSnapshot("fixture");
    assert.equal(snapshot.revision, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(snapshot.timeline.elements, []);
    assert.equal(fs.readFileSync(filename, "utf8"), bytes);
    fs.writeFileSync(filename, bytes + " ");
    assert.notEqual(readTimelineSnapshot("fixture").revision, snapshot.revision);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
