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

test("a placeholder rejection note is not an undrafted request; a typed reason still is", async () => {
  const { feedbackCoverage, pendingFeedbackRequests } = await import("../timeline/editing-feedback");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-reject-"));
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  createProject("demo", "web");
  const rejection = { project_id: "demo", session_id: "proposal-review", provenance: "user_words" as const, targets: { proposal_ids: ["20261022T170614-37282a65"] } };
  recordEditingFeedback({ ...rejection, turn_id: "a", direction: "Rejected in the editor" }, "human");
  recordEditingFeedback({ ...rejection, turn_id: "b", direction: "Too fast, slow the scramble" }, "human");
  const pending = pendingFeedbackRequests(feedbackCoverage(memoryEvents("demo"), []));
  assert.deepEqual(pending.map(request => request.direction), ["Too fast, slow the scramble"]);
});

test("the closeout check lists unaccounted directions in full and the rest one line each", async () => {
  const { feedbackCheck, feedbackCoverage } = await import("../timeline/editing-feedback");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-check-"));
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  createProject("demo", "web");
  const base = { project_id: "demo", session_id: "s", provenance: "user_words" as const };
  const answered = recordEditingFeedback({ ...base, turn_id: "a", direction: `Make it neon.\n${"Every line glows. ".repeat(40)}` });
  const open = recordEditingFeedback({ ...base, turn_id: "b", direction: "Windows come in later" });
  const proposal = { proposal_id: "20261028T032215-72694024", status: "approved", proposal: { summary: "x".repeat(400), responds_to_feedback_ids: [answered.event_id] } };
  const check = feedbackCheck(feedbackCoverage(memoryEvents("demo"), [proposal]));
  assert.deepEqual(check.unaccounted_feedback_ids, [open.event_id]);
  assert.deepEqual(check.unaccounted.map(direction => direction.direction), ["Windows come in later"]);
  assert.deepEqual(check.accounted, [{ id: answered.event_id, time: check.accounted[0].time, direction: "Make it neon.", session_id: "s", proposals: ["20261028T032215-72694024 approved"] }]);
  assert.ok(!JSON.stringify(check).includes("x".repeat(400)));
});
