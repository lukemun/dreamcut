import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { recordEditingFeedback } from "./editing-feedback";
import { createProject } from "./store";
import { memoryEvents } from "./editing-memory";

test("feedback uses the existing ledger, is replay-safe, and never promotes learning", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-test-"));
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  createProject("demo", "web");
  const input = { project_id: "demo", session_id: "s", turn_id: "t", summary: "Keep the voice clear" };
  const first = recordEditingFeedback(input);
  const second = recordEditingFeedback(input);
  assert.deepEqual(first, second);
  const captured = memoryEvents("demo").filter(e => e.type === "editorial.feedback");
  assert.equal(captured.length, 1);
  assert.equal(captured[0].actor, "agent");
  assert.equal(captured[0].data?.provenance, "agent_recorded_interpretation_not_verified_quote");
  assert.throws(() => recordEditingFeedback({ ...input, summary: "Different reason" }), /conflict/);
  assert.throws(() => recordEditingFeedback({ ...input, project_id: "absent" }), /Existing project/);
  assert.equal(fs.existsSync(path.join(root, "profile/preferences.json")), false);
});
