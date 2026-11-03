import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { POST } from "@/app/api/projects/[projectId]/timeline/elements/route";
import { createProject, readPeaks, readTimeline, readTimelineSnapshot } from "./store";

for (const failure of ["malformed", "missing", "unreadable"] as const) {
  test(`creating an element refuses a ${failure} timeline without writing project state`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-read-safety-"));
    const previousProjects = process.env.TIMELINE_PROJECTS_DIR;
    const previousProfile = process.env.DREAMCUT_PROFILE_DIR;
    process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
    process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
    try {
      createProject("fixture", "web");
      const project = path.join(root, "projects", "fixture");
      const filename = path.join(project, "timeline.json");
      if (failure === "malformed") fs.writeFileSync(filename, '{"elements":[');
      if (failure === "missing") fs.unlinkSync(filename);
      const before = failure === "missing" ? null : fs.readFileSync(filename, "utf8");
      const metadata = fs.readFileSync(path.join(project, "metadata.json"), "utf8");
      const files = fs.readdirSync(project);
      if (failure === "unreadable") {
        // chmod is ineffective when tests run as root; inject the same filesystem error.
        const read = fs.readFileSync;
        t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
          if (args[0] === filename) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
          return read(...args);
        });
      }

      assert.throws(() => readTimeline("fixture"));
      assert.throws(() => readTimelineSnapshot("fixture"));
      const response = await POST(new Request("http://localhost/api/projects/fixture/timeline/elements", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
        body: JSON.stringify({ type: "still", timeline_start: 0, duration: 1, lane_key: "visual_0", lane_index: 0 }),
      }), { params: Promise.resolve({ projectId: "fixture" }) });
      assert.equal(response.status, 500);
      assert.equal(typeof (await response.json()).error, "string");

      t.mock.restoreAll();
      assert.equal(fs.existsSync(filename), before !== null);
      if (before !== null) assert.equal(fs.readFileSync(filename, "utf8"), before);
      assert.equal(fs.readFileSync(path.join(project, "metadata.json"), "utf8"), metadata);
      assert.deepEqual(fs.readdirSync(project), files);
      assert.deepEqual(fs.readdirSync(path.join(project, "history")), []);
      assert.deepEqual(readPeaks("fixture"), {}, "missing optional caches still use defaults");
    } finally {
      t.mock.restoreAll();
      if (previousProjects === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
      else process.env.TIMELINE_PROJECTS_DIR = previousProjects;
      if (previousProfile === undefined) delete process.env.DREAMCUT_PROFILE_DIR;
      else process.env.DREAMCUT_PROFILE_DIR = previousProfile;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
