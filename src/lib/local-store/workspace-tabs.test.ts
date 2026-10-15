import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseWorkspaceTabs, readWorkspaceTabs, writeWorkspaceTabs } from "./workspace-tabs";

test("open project tabs keep order, drop duplicates and reject unsafe ids", () => {
  assert.deepEqual(parseWorkspaceTabs({ open: ["b", "a", "b", "../x", 3, ""] }), ["b", "a"]);
  assert.deepEqual(parseWorkspaceTabs(null), []);
});

test("open project tabs survive a restart through the profile", () => {
  const previous = process.env.DREAMCUT_PROFILE_DIR;
  process.env.DREAMCUT_PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-tabs-"));
  try {
    assert.deepEqual(readWorkspaceTabs(), []);
    writeWorkspaceTabs({ open: ["ui-smoke", "demo"] });
    assert.deepEqual(readWorkspaceTabs(), ["ui-smoke", "demo"]);
  } finally {
    if (previous === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous;
  }
});
