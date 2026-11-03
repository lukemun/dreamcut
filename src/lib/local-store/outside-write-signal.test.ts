import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProject, getRevision, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { readProductSignals } from "@/lib/observability/product-signals";
import { projectTimelinePath } from "@/lib/local-store/paths";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "outside-write-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
// Signals are skipped under the test runner by default; this file checks them on purpose.
const testContext = process.env.NODE_TEST_CONTEXT;
test.before(() => { delete process.env.NODE_TEST_CONTEXT; });
test.after(() => { process.env.NODE_TEST_CONTEXT = testContext; });
const outside = () => readProductSignals().signals.filter(signal => signal.event === "outside_write");
const marker = (projectId: string) => path.join(process.env.TIMELINE_PROJECTS_DIR!, projectId, ".last-api-write.json");

test("a direct timeline.json edit records one outside_write signal", () => {
  createProject("direct-edit", "web");
  getRevision("direct-edit");
  writeTimeline("direct-edit", { ...readTimeline("direct-edit"), elements: [] }, "editor_write");
  assert.equal(outside().length, 0, "DreamCut's own writes are not outside writes");

  const file = projectTimelinePath("direct-edit");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8"));
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5_000));
  getRevision("direct-edit");
  getRevision("direct-edit");
  const signals = outside();
  assert.equal(signals.length, 1);
  assert.deepEqual(signals[0], { ...signals[0], project_id: "direct-edit", client: "editor", writer: "file_edit", files: ["timeline"] });
});

test("a server restart is not an outside write", () => {
  createProject("restart", "web");
  getRevision("restart");
  const before = outside().length;
  const saved = JSON.parse(fs.readFileSync(marker("restart"), "utf8"));
  fs.writeFileSync(marker("restart"), JSON.stringify({ ...saved, pid: process.pid + 1 }));
  const old = new Date(Date.now() - (process.uptime() + 60) * 1000);
  fs.utimesSync(marker("restart"), old, old);
  getRevision("restart");
  assert.equal(outside().length, before);
});
