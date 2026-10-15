import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  agentActorFromArgs,
  appendMotionAuditEvent,
  motionAuditPath,
  readMotionAudit,
  recordRevisionIfChanged,
  summarizeProjectMotionAudit,
} from "./motion-audit";

const sha = (char: string) => char.repeat(64);

function withProjects(run: (projectId: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "motion-audit-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    fs.mkdirSync(path.join(root, "demo"), { recursive: true });
    run("demo");
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const subject = { kind: "composition" as const, id: "logo-sting" };
const agent = { type: "agent" as const, name: "claude", model: "claude-opus-5-5", effort: "high" };
const person = { type: "person" as const, via: "editor" as const };

function revision(fingerprint: string) {
  return {
    type: "revision" as const,
    source_fingerprint_sha256: fingerprint,
    manifest_sha256: null,
    files: [{ path: "index.html", sha256: fingerprint }],
    feedback_ids: ["fb-1"],
    proposal_id: null,
    request: "Animate the logo",
  };
}

test("appends events outside the composition source and reads them back in order", () => {
  withProjects((projectId) => {
    appendMotionAuditEvent(projectId, subject, agent, revision(sha("a")));
    appendMotionAuditEvent(projectId, subject, person, {
      type: "review", source_fingerprint_sha256: sha("a"), decision: "approved", rating: 4, proposal_id: null,
    });
    const filePath = motionAuditPath(projectId, "composition", "logo-sting");
    assert.match(filePath, /audit[/\\]motion[/\\]compositions[/\\]logo-sting\.jsonl$/);
    assert.ok(!filePath.includes(`${path.sep}hyperframes${path.sep}`));
    const { events, invalid_lines } = readMotionAudit(projectId, "composition", "logo-sting");
    assert.equal(invalid_lines, 0);
    assert.deepEqual(events.map((event) => event.type), ["revision", "review"]);
    assert.equal(events[0]!.actor.type, "agent");
  });
});

test("rejects malformed events before writing anything", () => {
  withProjects((projectId) => {
    assert.throws(() => appendMotionAuditEvent(projectId, subject, person, {
      type: "review", source_fingerprint_sha256: sha("a"), decision: "approved", rating: 7, proposal_id: null,
    }), /Invalid review event/);
    assert.throws(() => appendMotionAuditEvent(projectId, { kind: "composition", id: "../escape" }, person, revision(sha("a"))));
    assert.equal(fs.existsSync(motionAuditPath(projectId, "composition", "logo-sting")), false);
  });
});

test("records a revision only when the source fingerprint changes", () => {
  withProjects((projectId) => {
    assert.ok(recordRevisionIfChanged(projectId, subject, agent, revision(sha("a"))));
    assert.equal(recordRevisionIfChanged(projectId, subject, agent, revision(sha("a"))), null);
    assert.ok(recordRevisionIfChanged(projectId, subject, agent, revision(sha("b"))));
    const { events } = readMotionAudit(projectId, "composition", "logo-sting");
    assert.equal(events.filter((event) => event.type === "revision").length, 2);
  });
});

test("skips corrupt lines and summarizes edits, missed controls and ratings", () => {
  withProjects((projectId) => {
    appendMotionAuditEvent(projectId, subject, agent, revision(sha("a")));
    appendMotionAuditEvent(projectId, subject, person, {
      type: "value_change", target: "control:headline", old_value: "A", new_value: "B", proposal_id: null, element_id: "el-1",
    });
    appendMotionAuditEvent(projectId, subject, agent, {
      type: "model_request", feedback_id: "fb-2", satisfiable_by: ["control:accent"], note: null,
    });
    appendMotionAuditEvent(projectId, subject, person, {
      type: "review", source_fingerprint_sha256: sha("a"), decision: "approved", rating: 3, proposal_id: null,
    });
    appendMotionAuditEvent(projectId, subject, person, {
      type: "review", source_fingerprint_sha256: sha("a"), decision: "approved", rating: null, proposal_id: null,
    });
    fs.appendFileSync(motionAuditPath(projectId, "composition", "logo-sting"), "{not json\n");
    appendMotionAuditEvent(projectId, { kind: "sound", id: "whoosh" }, agent, { ...revision(sha("c")) });

    const summaries = summarizeProjectMotionAudit(projectId);
    assert.deepEqual(summaries.map((summary) => `${summary.kind}:${summary.id}`), ["composition:logo-sting", "sound:whoosh"]);
    const composition = summaries[0]!;
    assert.equal(composition.invalid_lines, 1);
    assert.equal(composition.value_changes.by_person, 1);
    assert.deepEqual(composition.value_changes.by_target, { "control:headline": 1 });
    assert.equal(composition.missed_controls, 1);
    assert.deepEqual(composition.reviews, { approved: 2, rejected: 0, ratings: [3], mean_rating: 3 });
  });
});

test("reads agent identity from CLI flags without guessing missing fields", () => {
  assert.deepEqual(agentActorFromArgs(["--agent", "claude", "--model", "claude-opus-5-5"]), {
    type: "agent", name: "claude", model: "claude-opus-5-5", effort: null,
  });
  assert.deepEqual(agentActorFromArgs(["--agent", "--model", "x"]), {
    type: "agent", name: null, model: "x", effort: null,
  });
});
