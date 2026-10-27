import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { POST } from "@/app/api/projects/route";
import { readMetadata, readTimeline } from "@/lib/local-store/store";

test("project creation saves the chosen canvas and refuses invalid or duplicate requests", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-creation-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  const request = (body: unknown) => new Request("http://localhost/api/projects", { method: "POST", body: JSON.stringify(body) });
  try {
    for (const [i, ratio] of ["9:16", "4:5", "1:1", "16:9"].entries()) {
      const id = `canvas-${i}`;
      assert.equal((await POST(request({ id, aspect_ratio: ratio }))).status, 201);
      assert.equal(readMetadata(id).output_aspect_ratio, ratio);
      assert.equal(readMetadata(id).delivery_target, "web");
      assert.equal(readMetadata(id).agent_workspace, undefined);
      assert.equal(readTimeline(id).elements.length, 0);
      assert.equal((await POST(request({ id, aspect_ratio: "16:9" }))).status, 409);
      assert.equal(readMetadata(id).output_aspect_ratio, ratio);
    }
    assert.equal((await POST(request({ id: "../escape", aspect_ratio: "9:16" }))).status, 400);
    assert.equal((await POST(request({ id: "bad-ratio", aspect_ratio: "2:3" }))).status, 400);
    assert.equal((await POST(new Request("http://localhost/api/projects", { method: "POST", body: "{" }))).status, 400);
    assert.equal(fs.readdirSync(root).length, 4);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
