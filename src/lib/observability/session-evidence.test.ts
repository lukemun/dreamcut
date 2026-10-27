import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../local-store/store";
import { recordEditingFeedback } from "../local-store/editing-feedback";
import { appendMotionAuditEvent } from "../local-store/motion-audit";
import { recordProductSignal } from "./product-signals";
import { proposalWork } from "./proposal-work";
import { recordToolEvent } from "./tool-events";
import { sessionEvidenceBundle, sessionEvidenceManifest } from "./session-evidence";

test("the bundle gathers this project's local evidence only, lists what it carries, and keeps paths and other projects out", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-evidence-"));
  const previous = { profile: process.env.DREAMCUT_PROFILE_DIR, projects: process.env.TIMELINE_PROJECTS_DIR };
  process.env.DREAMCUT_PROFILE_DIR = path.join(dir, "profile");
  process.env.TIMELINE_PROJECTS_DIR = path.join(dir, "projects");
  try {
    createProject("guy", "web");
    createProject("other", "web");
    const session = "2fecdf32-9991-40d3-a255-6653202afd51";
    recordEditingFeedback({ project_id: "guy", session_id: "s1", turn_id: "t1", direction: "Draw it with the look I selected, from /Users/someone/clip.mov" });
    recordEditingFeedback({ project_id: "other", session_id: "s1", turn_id: "t1", direction: "Other project's secret" });
    const now = new Date().toISOString();
    const toolRow = (project: string, call: string) => ({ schema_version: 1, event: "dreamcut.tool_dispatch", call_id: call, request_id: "1", session_id: session, tool: "proposal_create",
      contract_version: 1, project_id: project, started_at: now, finished_at: now, duration_ms: 3, success: false, error_code: "INVALID_INPUT" });
    recordToolEvent(toolRow("guy", "7d4e2b1a-1c2d-4e3f-8a9b-0c1d2e3f4a5b"));
    recordToolEvent(toolRow("other", "7d4e2b1a-1c2d-4e3f-8a9b-0c1d2e3f4a5c"));
    recordToolEvent({ ...toolRow("guy", "7d4e2b1a-1c2d-4e3f-8a9b-0c1d2e3f4a5d"), project_id: undefined, tool: "editor_context_get", success: true, error_code: undefined });
    const envelope = (project?: string) => ({ schema_version: 1, signal_id: "8d4e2b1a-1c2d-4e3f-8a9b-0c1d2e3f4a5b", at: now, session_id: session, client: "mcp-direct", ...(project ? { project_id: project } : {}) });
    recordProductSignal({ ...envelope("guy"), event: "selection_read", tool: "editor_context_get", item_count: 1, items: [{ id: "template:LOOK-PROOF", kind: "Template" }] });
    recordProductSignal({ ...envelope("other"), event: "selection_read", tool: "timeline_get", item_count: 0, items: [] });
    const { attempt_id } = proposalWork("guy", { action: "start", recorded_by: "server", session_id: session });
    const span = proposalWork("guy", { action: "begin", attempt_id, phase: "validation", recorded_by: "server" });
    proposalWork("guy", { action: "end", attempt_id, span_id: span.event_id, outcome: "failed", recorded_by: "server" });
    appendMotionAuditEvent("guy", { kind: "composition", id: "walker" }, { type: "agent", name: "claude", model: null, effort: null },
      { type: "job_failed", error: "2 separable objects at /Users/someone/x", started_at: now, finished_at: now, job_key: null });

    const bundle = sessionEvidenceBundle("guy");
    assert.equal(bundle.project_id, "guy");
    assert.equal(bundle.memory_events.length, 1);
    assert.deepEqual(bundle.tool_events.map(event => event.tool), ["proposal_create", "editor_context_get"], "this project's rows and rows that name no project");
    assert.deepEqual(bundle.product_signals.map(signal => signal.event === "selection_read" && signal.items[0]?.id), ["template:LOOK-PROOF"]);
    assert.deepEqual(bundle.proposals, []);
    assert.deepEqual([bundle.proposal_work.length, bundle.proposal_work[0]?.recorded_by, bundle.proposal_work[0]?.spans[0]?.outcome], [1, "server", "failed"]);
    assert.deepEqual([bundle.motion_audit.length, bundle.motion_audit[0]?.events[0]?.type], [1, "job_failed"]);
    const text = JSON.stringify(bundle);
    assert.doesNotMatch(text, /Other project's secret|\/Users\//);
    assert.match(text, /<local path>/);
    assert.match(bundle.excluded.join(" "), /outside agent/);

    const manifest = sessionEvidenceManifest(bundle);
    assert.deepEqual(manifest.items.map(item => item.count), [1, 2, 1, 0, 1, 1]);
    assert.ok(manifest.bytes > 0);
    assert.equal(manifest.items.every(item => !/[_/]/.test(item.label)), true, "labels are everyday words");
  } finally {
    if (previous.profile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous.profile;
    if (previous.projects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous.projects;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
