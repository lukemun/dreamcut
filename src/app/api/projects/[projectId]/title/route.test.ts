import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject, readMetadata, readTimeline } from "@/lib/local-store/store";
import { PATCH } from "./route";

test("rename preserves project state and refuses invalid or stale titles", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-title-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("title-test", "reels", "Original title");
    const metadata = readMetadata("title-test");
    const timeline = readTimeline("title-test");
    const rename = (title: string, expected_title: string) => PATCH(new Request("http://localhost/api/projects/title-test/title", {
      method: "PATCH", headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
      body: JSON.stringify({ title, expected_title }),
    }), { params: Promise.resolve({ projectId: "title-test" }) });
    assert.equal((await rename("  Beach morning  ", "Original title")).status, 200);
    assert.deepEqual(readMetadata("title-test"), { ...metadata, title: "Beach morning" });
    assert.deepEqual(readTimeline("title-test"), timeline);
    assert.equal((await rename("Lost update", "Original title")).status, 409);
    assert.equal((await rename("   ", "Beach morning")).status, 400);
    assert.equal(readMetadata("title-test").title, "Beach morning");
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
