import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyEditorAgentProposal,
  deriveProposalTimeline,
  parseEditorAgentProposal,
  previewEditorAgentProposal,
  proposalOption,
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
  SOLE_OPTION_ID,
  type EditorAgentOption,
} from "@/lib/agent/timeline-editor-agent-apply";
import { refreshPendingProposals } from "@/lib/agent/proposal-refresh";
import { proposalElementFingerprints } from "@/lib/agent/proposal-staleness";
import { reviewOption } from "@/lib/agent/proposal-review";
import {
  listProposals,
  readProposal,
  resolveProposal,
  saveProposal,
} from "@/lib/local-store/proposals";
import {
  createProject,
  readTimeline,
  restoreProjectHistorySnapshot,
  writeTimeline,
} from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { POST as approveProposal } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/approve/route";
import { POST as previewProposal } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/preview/route";
import { POST as previewProposalBatch } from "@/app/api/projects/[projectId]/timeline/proposals/batch/preview/route";
import { POST as approveProposalBatch } from "@/app/api/projects/[projectId]/timeline/proposals/batch/approve/route";
import { projectHistoryDir } from "@/lib/local-store/paths";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-editor-proposal-contract-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const ELEMENT_A = "11111111-1111-4111-8111-111111111111";
const ELEMENT_B = "22222222-2222-4222-8222-222222222222";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-07-21T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

/** Two visual clips, back to back. */
function seed(projectId: string) {
  createProject(projectId, "web");
  writeTimeline(projectId, {
    elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4 })],
    transitions: [],
  }, "fixture");
  return timelineRevision(projectId);
}

function head(projectId: string, revision: string, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    project_id: projectId,
    expected_revision: revision,
    mode: "workshop",
    decision: "propose",
    summary: "Tighten the opening.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [],
    ...overrides,
  };
}

test("audio accepts silence and the full supported gain range but rejects out-of-range gain", () => {
  const id = "boosted-mute";
  seed(id);
  const timeline = readTimeline(id);
  timeline.elements[0].volume = 1.18;
  writeTimeline(id, timeline, "fixture-gain");
  const draft = (volume: number) => head(id, timelineRevision(id), {
    options: [{ id: "gain", label: "Gain", recommended: true, summary: "Adjust gain", requested_mutations: 1,
      operations: [{ element_id: ELEMENT_A, patch: { volume } }] }],
  });
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(draft(0), 24, id));
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(draft(3), 24, id));
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(17), 24, id));
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(-0.1), 24, id));
});

test("text size can cross the full bounded review range", () => {
  const id = "text-size-range";
  seed(id);
  const timeline = readTimeline(id);
  timeline.elements[0].type = "caption_text";
  timeline.elements[0].lane_key = "captions_0";
  timeline.elements[0].props = { text: "Title", fontSizePx: 60 };
  writeTimeline(id, timeline, "fixture-text");
  const draft = (fontSizePx: number) => head(id, timelineRevision(id), {
    options: [{ id: "size", label: "Size", recommended: true, summary: "Enlarge title", requested_mutations: 1,
      operations: [{ element_id: ELEMENT_A, props: { fontSizePx } }] }],
  });
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(draft(300), 24, id));
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(301), 24, id));
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(17), 24, id));
});

test("proposal rebase policy defaults to strict for existing callers", () => {
  const revision = seed("strict-rebase-default");
  const proposal = validateEditorAgentProposalAgainstProject(
    head("strict-rebase-default", revision, {
      options: [option("tighten", { recommended: true })],
    }),
    24,
    "strict-rebase-default",
  );

  assert.equal(proposal.rebase_policy, "strict");
});

test("approving one independent card preserves a valid non-overlapping sibling", async () => {
  const projectId = "independent-proposal-rebase";
  const revision = seed(projectId);
  const first = validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      options: [option("first", {
        recommended: true,
        operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }],
      })],
    }),
    24,
    projectId,
  );
  const second = validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      rebase_policy: "independent",
      options: [option("second", {
        recommended: true,
        operations: [{ element_id: ELEMENT_B, patch: { duration: 3 } }],
      })],
    }),
    24,
    projectId,
  );
  const firstRecord = saveProposal(projectId, first, { proposalId: "20260730T060000-feedface" });
  const secondRecord = saveProposal(projectId, second, { proposalId: "20260730T060001-deadbeef" });

  const response = await approveProposal(
    new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/${firstRecord.proposal_id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ option_id: "first" }),
    }),
    { params: Promise.resolve({ projectId: projectId, proposalId: firstRecord.proposal_id }) },
  );
  const result = await response.json() as {
    after_revision: string;
    rebased_proposal_ids: string[];
  };
  const rebased = readProposal(projectId, secondRecord.proposal_id);

  assert.equal(response.status, 200);
  assert.deepEqual(result.rebased_proposal_ids, [secondRecord.proposal_id]);
  assert.equal(rebased.status, "pending");
  assert.equal(rebased.proposal.rebase_policy, "independent");
  assert.equal(rebased.proposal.expected_revision, result.after_revision);
});

test("approving a successor resolves only the pending drafts it explicitly supersedes", async () => {
  const projectId = "explicit-proposal-supersession";
  const revision = seed(projectId);
  const older = saveProposal(projectId, validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      options: [option("older", {
        recommended: true,
        operations: [{ element_id: ELEMENT_A, patch: { duration: 3.5 } }],
      })],
    }), 24, projectId,
  ), { proposalId: "20260918T210000-aaaabbbb" });
  const independent = saveProposal(projectId, validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      rebase_policy: "independent",
      options: [option("independent", {
        recommended: true,
        operations: [{ element_id: ELEMENT_B, patch: { duration: 3 } }],
      })],
    }), 24, projectId,
  ), { proposalId: "20260918T210001-ccccdddd" });
  const successor = saveProposal(projectId, validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      supersedes_proposal_ids: [older.proposal_id],
      options: [option("successor", {
        recommended: true,
        operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }],
      })],
    }), 24, projectId,
  ), { proposalId: "20260918T210002-eeeeffff" });

  const response = await approveProposal(
    new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/${successor.proposal_id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ option_id: "successor" }),
    }),
    { params: Promise.resolve({ projectId: projectId, proposalId: successor.proposal_id }) },
  );
  const result = await response.json() as {
    after_revision: string;
    superseded_proposal_ids: string[];
    rebased_proposal_ids: string[];
    history: { before: { id: string }; after: { id: string } };
  };
  const superseded = readProposal(projectId, older.proposal_id);
  const preserved = readProposal(projectId, independent.proposal_id);

  assert.equal(response.status, 200);
  assert.deepEqual(result.superseded_proposal_ids, [older.proposal_id]);
  assert.equal(superseded.status, "rejected");
  assert.equal(superseded.resolution?.superseded_by_proposal_id, successor.proposal_id);
  assert.match(superseded.resolution?.reason ?? "", /Superseded by approved proposal/);
  assert.equal(preserved.status, "pending");
  assert.deepEqual(result.rebased_proposal_ids, [independent.proposal_id]);

  restoreProjectHistorySnapshot(projectId, result.history.before.id, "history_restore_undo");
  assert.equal(readProposal(projectId, successor.proposal_id).status, "pending");
  assert.equal(readProposal(projectId, older.proposal_id).status, "pending");
  assert.equal(readProposal(projectId, independent.proposal_id).proposal.expected_revision, revision);
  assert.equal(readTimeline(projectId).elements.find((entry) => entry.id === ELEMENT_A)?.duration, 4);

  restoreProjectHistorySnapshot(projectId, result.history.after.id, "history_restore_redo");
  assert.equal(readProposal(projectId, successor.proposal_id).status, "approved");
  assert.equal(readProposal(projectId, older.proposal_id).status, "rejected");
  assert.equal(readProposal(projectId, independent.proposal_id).proposal.expected_revision, result.after_revision);
  assert.equal(readTimeline(projectId).elements.find((entry) => entry.id === ELEMENT_A)?.duration, 3);
});

test("approval returns undo-ready history descriptors bracketing the write", async () => {
  const projectId = "approval-history-descriptors";
  const revision = seed(projectId);
  const beforeTimeline = readTimeline(projectId);
  const proposal = validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      options: [option("tighten", {
        recommended: true,
        operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }],
      })],
    }),
    24,
    projectId,
  );

  const applied = await applyEditorAgentProposal(proposal, 24, "tighten");

  assert.ok(applied.history, "approval must return history descriptors");
  const { before, after } = applied.history;
  assert.notEqual(before.id, after.id);
  const historyDir = path.join(root, projectId, "history");
  const beforeSnapshot = JSON.parse(fs.readFileSync(path.join(historyDir, before.id), "utf8")) as { timeline: { elements: TimelineElement[] } };
  const afterSnapshot = JSON.parse(fs.readFileSync(path.join(historyDir, after.id), "utf8")) as { timeline: { elements: TimelineElement[] } };
  // The before snapshot embeds the pre-approval timeline (undo restores it);
  // the after snapshot embeds the applied result (redo restores it).
  assert.deepEqual(beforeSnapshot.timeline.elements, beforeTimeline.elements);
  assert.equal(afterSnapshot.timeline.elements.find((entry) => entry.id === ELEMENT_A)?.duration, 3);
});

test("batch review previews selected independent edits on one composite timeline", async () => {
  const projectId = "batch-proposal-preview";
  const revision = seed(projectId);
  const first = saveProposal(projectId, validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      rebase_policy: "independent",
      options: [option("first", { recommended: true, operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }] })],
    }), 24, projectId,
  ), { proposalId: "20260914T220000-baaabaaa" });
  const second = saveProposal(projectId, validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      rebase_policy: "independent",
      options: [option("second", { recommended: true, operations: [{ element_id: ELEMENT_B, patch: { duration: 2 } }] })],
    }), 24, projectId,
  ), { proposalId: "20260914T220001-bbbbcccc" });

  const response = await previewProposalBatch(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/batch/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ selections: [
      { proposal_id: first.proposal_id, option_id: "first" },
      { proposal_id: second.proposal_id, option_id: "second" },
    ] }),
  }), { params: Promise.resolve({ projectId: projectId }) });
  const result = await response.json() as { timeline: { elements: TimelineElement[] }; touched_element_ids: string[] };

  assert.equal(response.status, 200);
  assert.equal(result.timeline.elements.find((entry) => entry.id === ELEMENT_A)?.duration, 3);
  assert.equal(result.timeline.elements.find((entry) => entry.id === ELEMENT_B)?.duration, 2);
  assert.deepEqual(new Set(result.touched_element_ids), new Set([ELEMENT_A, ELEMENT_B]));
  assert.equal(readTimeline(projectId).elements.find((entry) => entry.id === ELEMENT_A)?.duration, 4);
});

test("batch approval applies selected edits in one undo snapshot and leaves unchecked edits pending", async () => {
  const projectId = "batch-proposal-approval";
  seed(projectId);
  const baseline = readTimeline(projectId);
  Object.assign(baseline.elements[0], {duration: 3.8333333333333335, playback_rate: .6, trim_start: 2/3, trim_end: 3.6, props: {source_duration_seconds:6.57}});
  writeTimeline(projectId, baseline, "fixture-handles");
  const revision = timelineRevision(projectId);
  const records = [
    saveProposal(projectId, validateEditorAgentProposalAgainstProject(head(projectId, revision, {
      rebase_policy: "independent",
      options: [option("first", { recommended: true, operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }] })],
    }), 24, projectId), { proposalId: "20260914T221000-aaaabbbb" }),
    saveProposal(projectId, validateEditorAgentProposalAgainstProject(head(projectId, revision, {
      rebase_policy: "independent",
      options: [option("second", { recommended: true, operations: [{ element_id: ELEMENT_B, patch: { duration: 2 } }] })],
    }), 24, projectId), { proposalId: "20260914T221001-ccccdddd" }),
    saveProposal(projectId, validateEditorAgentProposalAgainstProject(head(projectId, revision, {
      rebase_policy: "independent",
      options: [option("unchecked", { recommended: true, operations: [{ element_id: ELEMENT_B, props: { media_scale: 1.1 }, patch: undefined }] })],
    }), 24, projectId), { proposalId: "20260914T221002-eeeeffff" }),
  ];
  const beforeHistory = fs.readdirSync(projectHistoryDir(projectId)).length;
  const response = await approveProposalBatch(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/batch/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ selections: records.slice(0, 2).map((record, index) => ({
      proposal_id: record.proposal_id,
      option_id: index === 0 ? "first" : "second",
    })) }),
  }), { params: Promise.resolve({ projectId: projectId }) });
  const result = await response.json() as { approved_count: number; after_revision: string };

  assert.equal(response.status, 200);
  assert.equal(result.approved_count, 2);
  assert.equal(readProposal(projectId, records[0]!.proposal_id).status, "approved");
  assert.equal(readProposal(projectId, records[1]!.proposal_id).status, "approved");
  const unchecked = readProposal(projectId, records[2]!.proposal_id);
  assert.equal(unchecked.status, "pending");
  // Every card stands alone: the unchecked card still applies after the others, so it
  // stays pending and moves onto the new revision, ready to review next.
  assert.equal(unchecked.proposal.expected_revision, result.after_revision);
  assert.equal(fs.readdirSync(projectHistoryDir(projectId)).length, beforeHistory + 3);
});

test("approving one card carries a sibling that changes another setting of the same clip", async () => {
  const projectId = "overlapping-proposal-stays-stale";
  const revision = seed(projectId);
  const first = validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      options: [option("first", {
        recommended: true,
        operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }],
      })],
    }),
    24,
    projectId,
  );
  const overlapping = validateEditorAgentProposalAgainstProject(
    head(projectId, revision, {
      rebase_policy: "independent",
      options: [option("overlapping", {
        recommended: true,
        operations: [{ element_id: ELEMENT_A, patch: { volume: 0.5 } }],
      })],
    }),
    24,
    projectId,
  );
  const firstRecord = saveProposal(projectId, first, { proposalId: "20260730T060002-cafebabe" });
  const siblingRecord = saveProposal(projectId, overlapping, { proposalId: "20260730T060003-acde1234" });

  const response = await approveProposal(
    new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/${firstRecord.proposal_id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ option_id: "first" }),
    }),
    { params: Promise.resolve({ projectId: projectId, proposalId: firstRecord.proposal_id }) },
  );
  const result = await response.json() as {
    after_revision: string;
    rebased_proposal_ids: string[];
  };
  const sibling = readProposal(projectId, siblingRecord.proposal_id);

  // Length and volume are separate settings: the volume card still applies after the trim,
  // so it moves onto the new revision instead of going out of date.
  assert.equal(response.status, 200);
  assert.deepEqual(result.rebased_proposal_ids, [siblingRecord.proposal_id]);
  assert.equal(sibling.status, "pending");
  assert.equal(sibling.proposal.expected_revision, result.after_revision);
});

function option(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label: `Option ${id}`,
    recommended: false,
    summary: `Summary for ${id}`,
    requested_mutations: 1,
    operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }],
    ...overrides,
  };
}

test("a schema-1 proposal normalizes to one recommended option without changing its meaning", () => {
  const revision = seed("v1-normalize");
  const parsed = parseEditorAgentProposal({
    schema_version: 1,
    project_id: "v1-normalize",
    expected_revision: revision,
    mode: "workshop",
    decision: "propose",
    summary: "Trim the opener.",
    assumptions: [],
    unresolved_gaps: [],
    operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }],
    caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
  });

  assert.equal(parsed.schema_version, 2);
  assert.equal(parsed.options.length, 1);
  assert.equal(parsed.options[0]?.id, SOLE_OPTION_ID);
  assert.equal(parsed.options[0]?.recommended, true);
  assert.equal(parsed.options[0]?.requested_mutations, 1);
  assert.deepEqual(parsed.options[0]?.operations[0]?.patch, { duration: 3 });
  // The sole option is what proposalOption resolves to with no explicit id.
  assert.equal(proposalOption(parsed).id, SOLE_OPTION_ID);
});

test("caps are per-option, so alternatives do not consume each other's budget", () => {
  const revision = seed("per-option-caps");
  // Three alternatives of 5 mutations each: 15 across the proposal, but only one
  // is ever applied, so the cap must be judged per option rather than summed.
  const alternative = (id: string, recommended: boolean) => option(id, {
    recommended,
    requested_mutations: 5,
    operations: [{
      element_id: ELEMENT_A,
      patch: { duration: 3, timeline_start: 1, volume: 0.8 },
      props: { media_scale: 1.1, media_opacity: 0.9 },
    }],
  });

  const raw = head("per-option-caps", revision, {
    caps: { max_mutations: 24, requested_mutations: 5, max_renders: 0 },
    options: [alternative("a", true), alternative("b", false), alternative("c", false)],
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 24, "per-option-caps");
  assert.equal(validated.options.length, 3);
  // The proposal-level figure is the widest single option, not the sum.
  assert.equal(validated.caps.requested_mutations, 5);
});

test("option lists must be internally consistent", () => {
  const revision = seed("option-validation");

  assert.throws(
    () => validateEditorAgentProposalAgainstProject(
      head("option-validation", revision, { options: [option("a", { recommended: true }), option("a", { recommended: false })] }),
      24, "option-validation",
    ),
    /Duplicate option id a/,
  );

  assert.throws(
    () => validateEditorAgentProposalAgainstProject(
      head("option-validation", revision, { options: [option("a"), option("b")] }),
      24, "option-validation",
    ),
    /exactly one option must be recommended/,
  );

  assert.throws(
    () => validateEditorAgentProposalAgainstProject(
      head("option-validation", revision, { options: [option("a", { recommended: true }), option("b", { recommended: true })] }),
      24, "option-validation",
    ),
    /exactly one option must be recommended/,
  );

  assert.throws(
    () => validateEditorAgentProposalAgainstProject(
      head("option-validation", revision, {
        options: [option("a", { recommended: true, requested_mutations: 7 })],
        caps: { max_mutations: 24, requested_mutations: 7, max_renders: 0 },
      }),
      24, "option-validation",
    ),
    /must equal the number of changed or cleared fields in this option/,
  );

  assert.throws(
    () => validateEditorAgentProposalAgainstProject(
      head("option-validation", revision, {
        supersedes_proposal_ids: ["20260918T210000-aaaabbbb", "20260918T210000-aaaabbbb"],
        options: [option("a", { recommended: true })],
      }),
      24, "option-validation",
    ),
    /must not contain duplicate proposal ids/,
  );
});

test("an option cannot exceed the declared mutation cap even when another option fits", () => {
  const revision = seed("cap-ceiling");
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(
      head("cap-ceiling", revision, {
        caps: { max_mutations: 2, requested_mutations: 3, max_renders: 0 },
        options: [
          option("small", { recommended: true }),
          option("big", {
            requested_mutations: 3,
            operations: [{ element_id: ELEMENT_A, patch: { duration: 3, timeline_start: 1, volume: 0.5 } }],
          }),
        ],
      }),
      2, "cap-ceiling",
    ),
    /exceeds the declared mutation cap/,
  );
});

test("preview derives a draft timeline and writes nothing", () => {
  const projectId = "preview-is-pure";
  const revision = seed(projectId);
  const raw = head(projectId, revision, { options: [option("tighten", { recommended: true })] });
  const proposal = validateEditorAgentProposalAgainstProject(raw, 24, projectId);

  const before = readTimeline(projectId);
  const preview = previewEditorAgentProposal(proposal);

  assert.equal(preview.stale, false);
  assert.deepEqual(preview.touched, [ELEMENT_A]);
  // The draft reflects the edit...
  assert.equal(preview.timeline.elements.find((entry) => entry.id === ELEMENT_A)?.duration, 3);
  // ...while disk and the in-memory source are untouched.
  assert.equal(timelineRevision(projectId), revision);
  assert.equal(readTimeline(projectId).elements.find((entry) => entry.id === ELEMENT_A)?.duration, 4);
  assert.equal(before.elements.find((entry) => entry.id === ELEMENT_A)?.duration, 4);
});

test("what preview shows is what approval writes", async () => {
  const projectId = "preview-matches-apply";
  const revision = seed(projectId);
  const raw = head(projectId, revision, {
    caps: { max_mutations: 24, requested_mutations: 3, max_renders: 0 },
    options: [option("tighten", {
      recommended: true,
      requested_mutations: 3,
      operations: [{ element_id: ELEMENT_A, patch: { duration: 3, timeline_start: 1 }, props: { media_scale: 1.2 } }],
    })],
  });
  const proposal = validateEditorAgentProposalAgainstProject(raw, 24, projectId);

  const previewed = previewEditorAgentProposal(proposal).timeline;
  await applyEditorAgentProposal(proposal, 24);
  const applied = readTimeline(projectId);

  const strip = (value: unknown) => JSON.parse(JSON.stringify(value, (key, entry) => (key === "updated_at" ? undefined : entry)));
  assert.deepEqual(strip(applied), strip(previewed));
});

test("approval applies the chosen option, not merely the recommended one", async () => {
  const projectId = "choose-option";
  const revision = seed(projectId);
  const raw = head(projectId, revision, {
    options: [
      option("recommended", { recommended: true, operations: [{ element_id: ELEMENT_A, patch: { duration: 3 } }] }),
      option("alternate", { operations: [{ element_id: ELEMENT_B, patch: { duration: 1.5 } }] }),
    ],
  });
  const proposal = validateEditorAgentProposalAgainstProject(raw, 24, projectId);

  const applied = await applyEditorAgentProposal(proposal, 24, "alternate");
  assert.equal(applied.option_id, "alternate");
  assert.deepEqual(applied.touched_element_ids, [ELEMENT_B]);

  const timeline = readTimeline(projectId);
  assert.equal(timeline.elements.find((entry) => entry.id === ELEMENT_A)?.duration, 4, "recommended option must not have been applied");
  assert.equal(timeline.elements.find((entry) => entry.id === ELEMENT_B)?.duration, 1.5);
});

test("a proposal whose timeline moved underneath it is refused", async () => {
  const projectId = "stale-refused";
  const revision = seed(projectId);
  const raw = head(projectId, revision, { options: [option("tighten", { recommended: true })] });
  const proposal = validateEditorAgentProposalAgainstProject(raw, 24, projectId);

  // A hand-edit lands between proposing and approving.
  const timeline = readTimeline(projectId);
  timeline.elements[1]!.timeline_start = 5;
  writeTimeline(projectId, timeline, "hand_edit");
  assert.notEqual(timelineRevision(projectId), revision);

  assert.equal(previewEditorAgentProposal(proposal).stale, true, "preview reports staleness rather than hiding it");
  await assert.rejects(
    () => applyEditorAgentProposal(proposal, 24),
    (error: Error & { status?: number }) => error.status === 409 && /revision changed/i.test(error.message),
  );
});

test("derive refuses two operations on the same element", () => {
  const projectId = "duplicate-ops";
  seed(projectId);
  assert.throws(
    () => deriveProposalTimeline(readTimeline(projectId), [
      { element_id: ELEMENT_A, patch: { duration: 3 } },
      { element_id: ELEMENT_A, patch: { duration: 2 } },
    ]),
    /Duplicate operation for element/,
  );
});

test("review rows describe the real patch and pass the agent's rationale through untouched", () => {
  const projectId = "review-rows";
  seed(projectId);
  const timeline = readTimeline(projectId);

  const review = reviewOption(timeline, {
    id: "tighten",
    label: "Tighten",
    recommended: true,
    summary: "Shorten the opener.",
    requested_mutations: 2,
    operations: [
      { element_id: ELEMENT_A, patch: { duration: 3 }, rationale: "The hook lands a beat earlier." },
      { element_id: ELEMENT_B, patch: { volume: 0.5 } },
    ],
  });

  assert.equal(review.impact, "2 clips · 2 fields");

  const [first, second] = review.rows;
  assert.equal(first?.action, "Retime");
  assert.equal(first?.element_label, "shot.mp4");
  assert.equal(first?.rationale, "The hook lands a beat earlier.");
  assert.deepEqual(first?.changes, [{
    field: "duration", label: "Duration", before: "4.00s", after: "3.00s",
    target: "patch", operation_index: 0, after_value: 3,
  }]);

  assert.equal(second?.action, "Rebalance audio");
  assert.equal(second?.rationale, undefined, "no rationale is reported when the agent supplied none");
  assert.deepEqual(second?.changes, [{
    field: "volume", label: "Volume", before: "1", after: "0.5",
    target: "patch", operation_index: 1, after_value: 0.5,
  }]);
});

test("an operation touching several field groups is not described as only one of them", () => {
  const projectId = "review-multi";
  seed(projectId);
  // The effect-control props are added to the schema dynamically from
  // EFFECT_CONTROLS, so zod's inferred type does not list them even though the
  // runtime schema accepts them. Source only ever parses these, never builds
  // them, so the cast is confined to tests.
  const review = reviewOption(readTimeline(projectId), {
    id: "mixed", label: "Mixed", recommended: true, summary: "Several things at once.",
    requested_mutations: 2,
    operations: [{ element_id: ELEMENT_A, patch: { duration: 3 }, props: { media_scale: 1.2 } }],
  } as unknown as EditorAgentOption);
  assert.equal(review.rows[0]?.action, "Multiple edits");
});

test("proposal records persist, resolve once, and compute staleness rather than storing it", () => {
  const projectId = "record-lifecycle";
  const revision = seed(projectId);
  const raw = head(projectId, revision, { options: [option("tighten", { recommended: true })] });
  const proposal = validateEditorAgentProposalAgainstProject(raw, 24, projectId);

  const saved = saveProposal(projectId, proposal, { brief: "Tighten the opening." });
  assert.equal(saved.status, "pending");
  assert.match(saved.proposal_id, /^\d{8}T\d{6}-[0-9a-f]{8}$/);

  const loaded = readProposal(projectId, saved.proposal_id);
  assert.equal(loaded.brief, "Tighten the opening.");
  assert.equal(loaded.proposal.options[0]?.id, "tighten");
  assert.equal("stale" in loaded, false, "staleness is derived on read, never persisted");

  assert.equal(listProposals(projectId, { status: "pending" }).length, 1);
  assert.equal(listProposals(projectId, { status: "approved" }).length, 0);

  resolveProposal(projectId, saved.proposal_id, "approved", { option_id: "tighten" });
  assert.equal(readProposal(projectId, saved.proposal_id).status, "approved");
  assert.equal(listProposals(projectId, { status: "pending" }).length, 0);

  assert.throws(
    () => resolveProposal(projectId, saved.proposal_id, "rejected", {}),
    (error: Error & { status?: number }) => error.status === 409 && /already approved/.test(error.message),
  );
});

test("unknown proposal and option ids fail closed", () => {
  const projectId = "unknown-ids";
  const revision = seed(projectId);
  const proposal = validateEditorAgentProposalAgainstProject(
    head(projectId, revision, { options: [option("tighten", { recommended: true })] }),
    24, projectId,
  );

  assert.throws(() => proposalOption(proposal, "nope"), /Unknown option nope/);
  assert.throws(
    () => readProposal(projectId, "20260721T000000-deadbeef"),
    (error: Error & { status?: number }) => error.status === 404,
  );
  assert.throws(
    () => readProposal(projectId, "../../escape"),
    (error: Error & { status?: number }) => error.status === 400,
  );
});

test("transition proposal previews without writing and enforces adjacent boundaries", () => {
  const projectId = "slide-transition-review";
  const revision = seed(projectId);
  const operation = { element_id: "33333333-3333-4333-8333-333333333333", create_transition: {
    from_element_id: ELEMENT_A, to_element_id: ELEMENT_B, type: "slide", duration_seconds: 0.3,
    params: { direction: "from-right", motion: "smear", whip_blur_strength: 1.5 },
  } };
  const proposal = parseEditorAgentProposal(head(projectId, revision, { caps: { max_mutations: 5, requested_mutations: 5, max_renders: 0 }, options: [{ id: "slide", label: "Slide left", summary: "Incoming from right with blur", recommended: true, requested_mutations: 5, operations: [operation] }] }));
  const before = readTimeline(projectId);
  const option = proposal.options[0]!;
  const preview = deriveProposalTimeline(before, option.operations, projectId);
  assert.equal(before.transitions.length, 0);
  assert.equal(readTimeline(projectId).transitions.length, 0);
  assert.equal(preview.timeline.transitions[0]?.params?.whip_blur_strength, 1.5);
  assert.equal(preview.timeline.transitions[0]?.params?.motion, "smear");
  assert.deepEqual(preview.touched, [ELEMENT_A, ELEMENT_B]);
  assert.equal(reviewOption(before, option).rows[0]?.action, "Add motion-smear transition");
  assert.throws(() => deriveProposalTimeline(preview.timeline, option.operations, projectId), /already exists/);
  const gap = structuredClone(before); gap.elements[1]!.timeline_start = 5;
  assert.throws(() => deriveProposalTimeline(gap, option.operations, projectId), /touch/);
});

test("an implicit Advanced transition dial previews, approves and undoes with identical accounting", async () => {
  const projectId = "implicit-transition-adjustment";
  const revision = seed(projectId);
  const proposal = validateEditorAgentProposalAgainstProject(head(projectId, revision, {
    caps: { max_mutations: 4, requested_mutations: 4, max_renders: 0 },
    options: [{ id: "fade", label: "Fade", summary: "Fade between pictures", recommended: true,
      requested_mutations: 4, review_controls: [{ operation_index: 0, target: "create_transition", field: "duration_seconds" }],
      operations: [{ element_id: "33333333-3333-4333-8333-333333333333", create_transition: {
        from_element_id: ELEMENT_A, to_element_id: ELEMENT_B, type: "fade", duration_seconds: .5,
      } }],
    }],
  }), 4, projectId);
  const record = saveProposal(projectId, proposal);
  const context = { params: Promise.resolve({ projectId, proposalId: record.proposal_id }) };
  const request = (action: string) => new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/${record.proposal_id}/${action}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ option_id: "fade", overrides: [{ operation_index: 0, target: "create_transition", field: "params.motion_start_progress", value: .2 }] }),
  });
  const previewResponse = await previewProposal(request("preview"), context);
  const preview = await previewResponse.json();
  assert.equal(previewResponse.status, 200, JSON.stringify(preview));
  assert.equal(readTimeline(projectId).transitions.length, 0);
  const approvedResponse = await approveProposal(request("approve"), context);
  const approved = await approvedResponse.json();
  assert.equal(approvedResponse.status, 200, JSON.stringify(approved));
  const normalized = (transitions: Record<string, unknown>[]) => transitions.map(({ created_at, updated_at, ...value }) => value);
  assert.deepEqual(normalized(readTimeline(projectId).transitions as unknown as Record<string, unknown>[]), normalized(preview.timeline.transitions));
  assert.equal(readTimeline(projectId).transitions[0]?.params?.motion_start_progress, .2);
  assert.equal(readProposal(projectId, record.proposal_id).status, "approved");
  restoreProjectHistorySnapshot(projectId, approved.history.before.id, "history_restore_undo");
  assert.equal(readTimeline(projectId).transitions.length, 0);
  assert.equal(readProposal(projectId, record.proposal_id).status, "pending");
  restoreProjectHistorySnapshot(projectId, approved.history.after.id, "history_restore_redo");
  assert.equal(readTimeline(projectId).transitions[0]?.params?.motion_start_progress, .2);
  assert.equal(readProposal(projectId, record.proposal_id).status, "approved");
});


test("grade removal resets scalar and RGB fields plus their animation, preserving the other actor", () => {
  const timeline = { elements: [element(ELEMENT_A, {props: {color_grade_model: "linear-srgb-v1", grade_saturation: 0, grade_exposure_ev: 0.85, grade_contrast: 0.65, grade_lift_rgb: [0.2,0.2,0.2], grade_gamma_rgb: [1.5,1.5,1.5], keyframes: {grade_saturation: [{t:0,v:0}], media_scale: [{t:0,v:1}]}}}), element(ELEMENT_B, {timeline_start: 4})], transitions: [] };
  const fields = ["grade_saturation", "grade_exposure_ev", "grade_contrast", "grade_lift_rgb", "grade_gamma_rgb"] as const;
  const proposal = parseEditorAgentProposal(head("fixture", "a".repeat(64), {caps: {max_mutations: 5, requested_mutations: 5, max_renders: 0}, options: [{id:"reset",label:"Original clouds",recommended:true,summary:"Remove cloud grade",requested_mutations:5,operations:[{element_id:ELEMENT_A,clear_props:[...fields]}]}]}));
  const after = deriveProposalTimeline(timeline, proposal.options[0]!.operations).timeline;
  for (const field of fields) assert.equal(after.elements[0]!.props?.[field], undefined);
  assert.deepEqual(after.elements[0]!.props?.keyframes, {media_scale:[{t:0,v:1}]});
  assert.deepEqual(after.elements[1], timeline.elements[1]);
  assert.equal(timeline.elements[0]!.props?.grade_saturation, 0);
});

test("grade proposal dials accept full supported ranges and still reject out-of-range values", () => {
  const timeline = { elements: [element(ELEMENT_A)], transitions: [] };
  const ranges = { grade_exposure_ev: [-3, 3], grade_contrast: [0, 2], grade_saturation: [0, 2], grade_temperature: [-1, 1], grade_tint: [-1, 1], grade_hue_degrees: [-180, 180] };
  for (const [field, [min, max]] of Object.entries(ranges)) {
    const make = (value: number) => parseEditorAgentProposal(head("fixture", "a".repeat(64), {caps: {max_mutations: 1, requested_mutations: 1, max_renders: 0}, options: [{id:"grade",label:"Grade",recommended:true,summary:"Tune grade",requested_mutations:1,operations:[{element_id:ELEMENT_A,props:{[field]:value}}]}]}));
    for (const value of [min!, max!]) {
      const proposal = make(value);
      const after = deriveProposalTimeline(timeline, proposal.options[0]!.operations).timeline;
      assert.equal(after.elements[0]!.props?.[field], value);
      const opposite = make(value === min ? max! : min!);
      assert.doesNotThrow(() => deriveProposalTimeline(after, opposite.options[0]!.operations));
    }
    assert.throws(() => make(max! + 0.1));
    assert.throws(() => make(min! - 0.1));
  }
  assert.deepEqual(timeline.elements[0]!.props, {});
});

test("a batch reuses its one live timeline read: same preview as fresh reads, input never mutated", async () => {
  const { resolveProposalBatch } = await import("./proposal-batch");
  const { previewEditorAgentProposalBatch } = await import("./timeline-editor-agent-apply");
  const { readTimeline } = await import("../local-store/store");
  const id = "batch-shared-timeline";
  const revision = seed(id);
  const records = [ELEMENT_A, ELEMENT_B].map((elementId, index) => saveProposal(id, parseEditorAgentProposal(head(id, revision, { options: [{
    id: "gain", label: "Gain", recommended: true, summary: "Gain", requested_mutations: 1,
    operations: [{ element_id: elementId, patch: { volume: 0.3 + index * 0.2 } }],
  }] }))));
  const batch = resolveProposalBatch(id, records.map((record) => ({ proposal_id: record.proposal_id, option_id: "gain" })));
  const live = JSON.stringify(batch.timeline);
  assert.equal(live, JSON.stringify(readTimeline(id)), "the batch carries the live timeline it validated against");
  const options = batch.items.map((item) => item.option);
  const strip = (value: unknown) => JSON.stringify(value).replace(/"20\d\d-\d\d-\d\dT[0-9:.]+Z"/g, '"T"');
  assert.equal(strip(previewEditorAgentProposalBatch(id, options, batch.timeline)), strip(previewEditorAgentProposalBatch(id, options)));
  assert.equal(JSON.stringify(batch.timeline), live, "validating and previewing never mutate the shared read");
});

test("review tuning survives reload and supplies a revision baseline without changing authored or live state", async () => {
  const { saveProposalTuning, readProposalTuning, tunedProposalBaseline } = await import("../local-store/proposal-tuning");
  const id = "durable-review-tuning";
  const revision = seed(id);
  const proposal = parseEditorAgentProposal(head(id, revision, { options: [{
    id: "gain", label: "Gain", recommended: true, summary: "Gain", requested_mutations: 1,
    operations: [{ element_id: ELEMENT_A, patch: { volume: 0.8 } }],
  }] }));
  const record = saveProposal(id, proposal);
  const overrides = [{ operation_index: 0, target: "patch", field: "volume", value: 0.5 }];
  await saveProposalTuning(id, record.proposal_id, "gain", overrides);
  assert.deepEqual(readProposalTuning(id, record.proposal_id).gain, overrides);
  assert.equal(tunedProposalBaseline(record, readProposalTuning(id, record.proposal_id)).options[0].operations[0].patch?.volume, 0.5);
  assert.equal(readProposal(id, record.proposal_id).proposal.options[0].operations[0].patch?.volume, 0.8);
  const { resolveProposalBatch } = await import("./proposal-batch");
  assert.equal(resolveProposalBatch(id, [{proposal_id:record.proposal_id,option_id:"gain"}]).items[0].option.operations[0].patch?.volume,0.5);
  assert.equal(resolveProposalBatch(id, [{proposal_id:record.proposal_id,option_id:"gain",overrides:[]}]).items[0].option.operations[0].patch?.volume,0.8);
  assert.equal(timelineRevision(id), revision);
  assert.equal(listProposals(id).length, 1, "tuning files are not proposals");
  await assert.rejects(saveProposalTuning(id, record.proposal_id, "gain", [{ ...overrides[0], field: "source_url", value: "unsafe" }]));
  await saveProposalTuning(id, record.proposal_id, "gain", []);
  assert.deepEqual(readProposalTuning(id, record.proposal_id).gain, []);
  const { memoryEvents } = await import("../local-store/editing-memory");
  const tuningEvents = memoryEvents(id).filter(event => event.type === "proposal.tuned");
  assert.deepEqual(tuningEvents.map(event => event.data?.overrides), [overrides, []], "each saved tuning is immutable evidence, including reset");
  resolveProposal(id, record.proposal_id, "rejected", { at: new Date().toISOString() });
  await assert.rejects(saveProposalTuning(id, record.proposal_id, "gain", overrides), /resolved/);
});

test("combined preview rejects violation of an earlier option's preservation in either order", async () => {
  const { previewEditorAgentProposalBatch } = await import("./timeline-editor-agent-apply");
  const id="combined-preservation"; const revision=seed(id);
  const make=(id: string, element_id: string, preserve_fields: unknown[])=>parseEditorAgentProposal(head("combined-preservation",revision,{options:[{
    id,label:id,recommended:true,summary:id,requested_mutations:1,
    operations:[{element_id,props:{media_offset_x:0.1}}],preserve_fields,
  }]})).options[0];
  const first=make("first",ELEMENT_A,[{element_id:ELEMENT_B,fields:["props.media_offset_x"]}]);
  const second=make("second",ELEMENT_B,[]);
  for (const options of [[first,second],[second,first]]) {
    assert.throws(()=>previewEditorAgentProposalBatch(id,options), /[Pp]rotected|[Pp]reserv/);
  }
  const { applyEditorAgentProposalBatch } = await import("./timeline-editor-agent-apply");
  await assert.rejects(applyEditorAgentProposalBatch(id,revision,[first,second]), /[Pp]rotected|[Pp]reserv/);
  assert.equal(timelineRevision(id),revision);
});

for (const reverse of [false, true]) test(`same-actor independent effects approve in either order and undo together (${reverse})`, async () => {
  const projectId = `effect-rebase-${reverse}`;
  seed(projectId);
  const baseline = readTimeline(projectId);
  Object.assign(baseline.elements[0], {duration: 3.8333333333333335, playback_rate: .6, trim_start: 2/3, trim_end: 3.6, props: {source_duration_seconds:6.57}});
  writeTimeline(projectId, baseline, "fixture-handles");
  const revision = timelineRevision(projectId);
  const records = [
    {props: {subject_glow: 1.8, transition_keyframes: {subject_glow: [{t:0,v:1.8,ease:"hold"},{t:.3,v:0,ease:"hold"}]}}},
    {patch: {timeline_start:0,duration:2.8,trim_start:2/3,trim_end:3.1,playback_rate:1}, props: {media_offset_x: .5, transition_keyframes: {media_offset_x: [{t:0,v:0,ease:"hold"},{t:2,v:.5,ease:"linear"},{t:2.8,v:2,ease:"hold"}]}}},
  ].map((operation, i) => {
    const draft = validateEditorAgentProposalAgainstProject(head(projectId, revision, {
      rebase_policy: "independent", caps: {max_mutations:24,requested_mutations:i === 0 ? 2 : 7,max_renders:0},
      options: [option(`effect${i}`, {recommended: true, requested_mutations:i === 0 ? 2 : 7,
        operations: [{element_id: ELEMENT_A, ...operation}]} )],
    }), 24, projectId);
    return saveProposal(projectId, draft, {touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), draft)});
  });
  if (reverse) records.reverse();
  const [first, second] = records;
  const response = await approveProposal(new Request("http://localhost/approve", {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({option_id: first.proposal.options[0].id}),
  }), {params: Promise.resolve({projectId, proposalId: first.proposal_id})});
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.deepEqual(result.rebased_proposal_ids, [second.proposal_id]);
  assert.equal(readProposal(projectId, second.proposal_id).proposal.expected_revision, result.after_revision);
  restoreProjectHistorySnapshot(projectId, result.history.before.id, "undo");
  assert.equal(readProposal(projectId, first.proposal_id).status, "pending");
  assert.equal(readProposal(projectId, second.proposal_id).proposal.expected_revision, revision);
  restoreProjectHistorySnapshot(projectId, result.history.after.id, "redo");
  refreshPendingProposals(projectId);
  const next = await approveProposal(new Request("http://localhost/approve", {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({option_id: second.proposal.options[0].id}),
  }), {params: Promise.resolve({projectId, proposalId: second.proposal_id})});
  assert.equal(next.status, 200, JSON.stringify(await next.json()));
  const props = readTimeline(projectId).elements[0].props;
  assert.equal(props.subject_glow, 1.8);
  assert.equal(props.media_offset_x, .5);
});

test("slow clips can tune speed across the advertised range and preserve review/approval parity", async () => {
  const {saveProposalTuning, readProposalTuning} = await import("../local-store/proposal-tuning");
  const id = "slow-clip-speed-dial";
  seed(id);
  const timeline = readTimeline(id);
  timeline.elements[0].playback_rate = .6;
  timeline.elements[1].timeline_start = 20; // Leave room for the slow-end duration.
  writeTimeline(id, timeline, "fixture-slow-source");
  const revision = timelineRevision(id);
  const draft = validateEditorAgentProposalAgainstProject(head(id, revision, {
    options: [option("speed", {recommended:true, operations:[{element_id:ELEMENT_A,patch:{playback_rate:1}}]})],
  }),24,id);
  const record = saveProposal(id,draft);
  const overrides = (value:number) => [{operation_index:0,target:"patch" as const,field:"playback_rate",value}];
  for (const speed of [.5,1.53,1.6,1.61,2,4]) {
    await saveProposalTuning(id,record.proposal_id,"speed",overrides(speed));
    const response = await previewProposal(new Request("http://localhost/preview",{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({option_id:"speed"}),
    }),{params:Promise.resolve({projectId:id,proposalId:record.proposal_id})});
    const result = await response.json();
    assert.equal(response.status,200,JSON.stringify(result));
    assert.equal(result.timeline.elements.find((e:TimelineElement)=>e.id===ELEMENT_A).playback_rate,speed);
    assert.equal(readProposalTuning(id,record.proposal_id).speed[0].value,speed);
    assert.equal(timelineRevision(id),revision,"tuning never applies to the working cut");
  }
  for (const speed of [0,-1,4.01]) {
    await assert.rejects(saveProposalTuning(id,record.proposal_id,"speed",overrides(speed)));
  }
  const response = await approveProposal(new Request("http://localhost/approve",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({option_id:"speed",overrides:overrides(4)}),
  }),{params:Promise.resolve({projectId:id,proposalId:record.proposal_id})});
  const result = await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert.equal(readTimeline(id).elements[0].playback_rate,4);
  restoreProjectHistorySnapshot(id,result.history.before.id,"undo-speed");
  assert.equal(readTimeline(id).elements[0].playback_rate,.6);
});
