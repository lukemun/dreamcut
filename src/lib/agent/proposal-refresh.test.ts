import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { proposalElementFingerprints } from "@/lib/agent/proposal-staleness";
import { refreshPendingProposals } from "@/lib/agent/proposal-refresh";
import { readProposal, resolveProposal, saveProposal } from "@/lib/local-store/proposals";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { projectProposalPath } from "@/lib/local-store/paths";
import type { TimelineElement } from "@/components/studio/timeline/types";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-editor-proposal-refresh-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-10-25T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

function seed(projectId: string) {
  createProject(projectId, "web");
  writeTimeline(projectId, {
    elements: [element(A), element(B, { timeline_start: 4 }), element(C, { timeline_start: 8 })],
    transitions: [],
  }, "fixture");
}

function card(projectId: string, elementId: string, patch: Record<string, unknown>, wave?: Record<string, unknown>) {
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId),
    mode: "workshop", decision: "propose", summary: "Adjust one clip.", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    ...(wave ? { wave } : {}),
    options: [{ id: "adjust", label: "Adjust", recommended: true, summary: "Adjust.", requested_mutations: 1,
      operations: [{ element_id: elementId, patch }] }],
  }, 24, projectId);
  return saveProposal(projectId, proposal, { touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal) });
}

/** A human edit written the way the editor writes one. */
function edit(projectId: string, elementId: string, change: (element: TimelineElement) => TimelineElement) {
  const timeline = readTimeline(projectId);
  writeTimeline(projectId, { ...timeline, elements: timeline.elements.map((item) => item.id === elementId ? change({ ...item }) : item) }, "human edit");
}

const fileBytes = (projectId: string, proposalId: string) => fs.readFileSync(projectProposalPath(projectId, proposalId), "utf8");
const summary = (projectId: string) => refreshPendingProposals(projectId).map(({ record, staleness, rebased }) => ({
  id: record.proposal_id, revision: record.proposal.expected_revision, fingerprints: record.touched_fingerprints, staleness, rebased,
}));

test("unchanged polls answer the same and write nothing", () => {
  const projectId = "refresh-unchanged";
  seed(projectId);
  const record = card(projectId, A, { duration: 3 });
  const before = fileBytes(projectId, record.proposal_id);
  const first = summary(projectId);
  assert.deepEqual(first, [{ id: record.proposal_id, revision: timelineRevision(projectId), fingerprints: record.touched_fingerprints,
    staleness: { stale: false, rebasable: false, reason: null }, rebased: false }]);
  assert.deepEqual(summary(projectId), first);
  assert.deepEqual(summary(projectId), first);
  assert.equal(fileBytes(projectId, record.proposal_id), before);
});

test("an edit to an unrelated clip moves the card onto exactly the new revision", () => {
  const projectId = "refresh-unrelated";
  seed(projectId);
  const record = card(projectId, A, { duration: 3 });
  summary(projectId);
  edit(projectId, B, (item) => ({ ...item, volume: 0.4 }));
  const revision = timelineRevision(projectId);
  const [result] = summary(projectId);
  assert.equal(result.rebased, true);
  assert.equal(result.revision, revision);
  assert.deepEqual(result.staleness, { stale: false, rebasable: false, reason: null });
  assert.deepEqual(result.fingerprints, record.touched_fingerprints);
  assert.equal(readProposal(projectId, record.proposal_id).proposal.expected_revision, revision);
  // The next poll on that revision has nothing to move.
  assert.equal(summary(projectId)[0].rebased, false);
});

test("an edit to a clip the card touches is re-validated: carried while it applies, out of date once deleted", () => {
  const projectId = "refresh-touched";
  seed(projectId);
  const record = card(projectId, A, { duration: 3 });
  summary(projectId);
  edit(projectId, A, (item) => ({ ...item, volume: 0.5 }));
  const [carried] = summary(projectId);
  assert.equal(carried.rebased, true);
  assert.equal(carried.revision, timelineRevision(projectId));
  assert.notDeepEqual(carried.fingerprints, record.touched_fingerprints);

  edit(projectId, A, (item) => ({ ...item, removed_at: "2026-10-25T01:00:00.000Z", removed_reason: "deleted" }));
  const before = fileBytes(projectId, record.proposal_id);
  const [retired] = summary(projectId);
  assert.equal(retired.rebased, false);
  assert.deepEqual(retired.staleness, { stale: true, rebasable: false, reason: "A clip this card changes was deleted." });
  assert.equal(fileBytes(projectId, record.proposal_id), before);
});

test("a card that no longer validates after an edit is refused with the validator's reason, and validates again once it applies", () => {
  const projectId = "refresh-refused";
  seed(projectId);
  // Moving C to 13 s is fine now; once A is moved to 14 s the lane collides.
  const record = card(projectId, C, { timeline_start: 13 });
  edit(projectId, A, (item) => ({ ...item, timeline_start: 14 }));
  const [refused] = summary(projectId);
  assert.equal(refused.rebased, false);
  assert.equal(refused.staleness.stale, true);
  assert.match(refused.staleness.reason ?? "", /^No longer applies: /);
  // A new revision (not the drafted one) on which it applies again.
  edit(projectId, A, (item) => ({ ...item, timeline_start: 0, volume: 0.9 }));
  const [carried] = summary(projectId);
  assert.equal(carried.rebased, true);
  assert.equal(readProposal(projectId, record.proposal_id).proposal.expected_revision, timelineRevision(projectId));
});

test("a wave step waits on its earlier step without validating, then re-validates and moves once that step is approved", () => {
  const projectId = "refresh-wave";
  seed(projectId);
  const first = card(projectId, A, { duration: 3 }, { id: "pass", step: 1, title: "Trim" });
  const second = card(projectId, B, { volume: 0.5 }, { id: "pass", step: 2, title: "Level", needs_steps: [1] });
  edit(projectId, C, (item) => ({ ...item, volume: 0.8 }));
  const secondBefore = fileBytes(projectId, second.proposal_id);
  const waiting = summary(projectId);
  assert.deepEqual(waiting.find((result) => result.id === second.proposal_id)?.staleness, { stale: false, rebasable: false, reason: null });
  assert.equal(waiting.find((result) => result.id === second.proposal_id)?.rebased, false);
  assert.equal(waiting.find((result) => result.id === first.proposal_id)?.rebased, true);
  assert.equal(fileBytes(projectId, second.proposal_id), secondBefore);

  // The creator applies step 1 (a timeline write) and it is marked approved.
  edit(projectId, A, (item) => ({ ...item, duration: 3 }));
  resolveProposal(projectId, first.proposal_id, "approved", { option_id: "adjust" } as Parameters<typeof resolveProposal>[3]);
  const opened = summary(projectId);
  assert.deepEqual(opened.map((result) => result.id), [second.proposal_id]);
  assert.equal(opened[0].rebased, true);
  assert.equal(opened[0].revision, timelineRevision(projectId));
});
