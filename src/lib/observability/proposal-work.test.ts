import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../local-store/store";
import { proposalWork, summarizeProposalWork } from "./proposal-work";

test("overlapping phases remain separate; open spans and absent handoff stay unknown", () => {
  const events = [
    { id: "a", action: "start", at: "2026-01-01T00:00:00Z" },
    { id: "b", action: "begin", phase: "preparation", at: "2026-01-01T00:00:01Z" },
    { id: "c", action: "begin", phase: "engineering", at: "2026-01-01T00:00:02Z" },
    { id: "d", action: "end", span_id: "b", outcome: "failed", at: "2026-01-01T00:00:04Z" },
    { id: "e", action: "saved", proposal_id: "draft", at: "2026-01-01T00:00:05Z" },
  ];
  const report = summarizeProposalWork(events);
  assert.equal(report.capture_to_saved_ms, 5000);
  assert.equal(report.capture_to_handoff_ms, null);
  assert.deepEqual(report.spans.map(s => s.elapsed_ms), [3000, null]);
  assert.equal(report.spans[0].outcome, "failed");
});

test("private work attempts persist without changing a timeline; invalid lifecycle rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-work-"));
  const previous = { profile: process.env.DREAMCUT_PROFILE_DIR, projects: process.env.TIMELINE_PROJECTS_DIR };
  process.env.DREAMCUT_PROFILE_DIR = path.join(dir, "profile");
  process.env.TIMELINE_PROJECTS_DIR = path.join(dir, "projects");
  try {
    createProject("work-test", "web");
    const timelinePath = path.join(dir, "projects", "work-test", "timeline.json");
    const before = fs.readFileSync(timelinePath, "utf8");
    const { attempt_id } = proposalWork("work-test", { action: "start" });
    const span = proposalWork("work-test", { action: "begin", attempt_id, phase: "composition" });
    assert.throws(() => proposalWork("work-test", { action: "handoff", attempt_id }), /closed spans/);
    proposalWork("work-test", { action: "end", attempt_id, span_id: span.event_id, outcome: "completed" });
    assert.throws(() => proposalWork("work-test", { action: "end", attempt_id, span_id: span.event_id, outcome: "completed" }), /remain open/);
    proposalWork("work-test", { action: "saved", attempt_id, proposal_id: "draft" });
    proposalWork("work-test", { action: "handoff", attempt_id });
    assert.equal(proposalWork("work-test", { action: "report", attempt_id }).spans.length, 1);
    assert.throws(() => proposalWork("work-test", { action: "begin", attempt_id, phase: "preparation" }), /already handed/);
    assert.equal(fs.readFileSync(timelinePath, "utf8"), before);
  } finally {
    if (previous.profile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous.profile;
    if (previous.projects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous.projects;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
