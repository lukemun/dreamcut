import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
} from "@/lib/agent/timeline-editor-agent-apply";
import {
  evaluateProposalStaleness,
  proposalBaseValues,
  proposalElementFingerprints,
  proposalOverrides,
} from "@/lib/agent/proposal-staleness";
import { refreshPendingProposals } from "@/lib/agent/proposal-refresh";
import { readProposal, saveProposal } from "@/lib/local-store/proposals";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-editor-proposal-staleness-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const ELEMENT_A = "11111111-1111-4111-8111-111111111111";
const ELEMENT_B = "22222222-2222-4222-8222-222222222222";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-08-13T00:00:00.000Z";
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
    elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4 })],
    transitions: [],
  }, "fixture");
  return timelineRevision(projectId);
}

function proposalTouching(projectId: string, revision: string, elementId: string) {
  return validateEditorAgentProposalAgainstProject({
    schema_version: 2,
    project_id: projectId,
    expected_revision: revision,
    mode: "workshop",
    decision: "propose",
    summary: "Tighten it.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "tighten",
      label: "Tighten",
      recommended: true,
      summary: "Shorter.",
      requested_mutations: 1,
      operations: [{ element_id: elementId, patch: { duration: 3 } }],
    }],
  }, 24, projectId);
}

function proposalCreatingMusic(projectId: string, revision: string, elementId: string) {
  return validateEditorAgentProposalAgainstProject({
    schema_version: 2,
    project_id: projectId,
    expected_revision: revision,
    mode: "workshop",
    decision: "propose",
    summary: "Continue the score.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 13, requested_mutations: 13, max_renders: 0 },
    options: [{
      id: "music",
      label: "Music",
      recommended: true,
      summary: "Add a music bed after the opening cue.",
      requested_mutations: 13,
      operations: [{
        element_id: elementId,
        create_audio: {
          type: "music",
          source_url: "/api/music-catalog/media/licensed/track.mp3",
          title: "Music bed",
          timeline_start: 8,
          source_duration_seconds: 60,
          source_start_seconds: 0,
          source_end_seconds: 20,
          lane_key: "music_0",
          lane_index: 0,
          volume: 0.3,
          fade_in: 0.5,
          fade_out: 1,
          playback_rate: 1,
        },
      }],
    }],
  }, 13, projectId);
}

function proposalAddingVisualWithExistingLaneOrder(projectId: string, revision: string, elementId: string) {
  return validateEditorAgentProposalAgainstProject({
    schema_version: 2,
    project_id: projectId,
    expected_revision: revision,
    rebase_policy: "independent",
    mode: "workshop",
    decision: "propose",
    summary: "Add a card on the registered foreground lane.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "card",
      label: "Card",
      recommended: true,
      summary: "Keep the current lane ordering.",
      requested_mutations: 1,
      operations: [{
        element_id: elementId,
        set_lane_order: { lane_order_keys: ["visual_1", "visual_0"] },
      }],
    }],
  }, 1, projectId);
}

/** Save a pending record with fingerprints, the way the create route does. */
function savePending(projectId: string, revision: string, elementId: string, proposalId: string) {
  const proposal = proposalTouching(projectId, revision, elementId);
  return saveProposal(projectId, proposal, {
    proposalId,
    touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal),
    touchedBaseValues: proposalBaseValues(readTimeline(projectId), proposal),
  });
}

test("an edit to an UNRELATED clip does not make a proposal stale", () => {
  const projectId = "stale-unrelated-edit";
  const revision = seed(projectId);
  const record = savePending(projectId, revision, ELEMENT_A, "20260813T000000-aaaaaaaa");

  // The human edits the OTHER clip.
  writeTimeline(projectId, {
    elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4, duration: 2 })],
    transitions: [],
  }, "human_edit");

  const staleness = evaluateProposalStaleness(
    readProposal(projectId, record.proposal_id),
    readTimeline(projectId),
    timelineRevision(projectId),
  );
  assert.equal(staleness.stale, false);
  assert.equal(staleness.rebasable, true, "revision moved, so it needs a rebase to stay applicable");
});

test("the creator changing a setting the card also sets keeps it reviewable and names the override", () => {
  const projectId = "stale-touched-edit";
  const revision = seed(projectId);
  const record = savePending(projectId, revision, ELEMENT_A, "20260813T000001-bbbbbbbb");

  writeTimeline(projectId, {
    elements: [element(ELEMENT_A, { duration: 2 }), element(ELEMENT_B, { timeline_start: 4 })],
    transitions: [],
  }, "human_edit");

  const saved = readProposal(projectId, record.proposal_id);
  const staleness = evaluateProposalStaleness(saved, readTimeline(projectId), timelineRevision(projectId));
  assert.equal(staleness.stale, false);
  assert.equal(staleness.rebasable, true);
  // The card will replace the creator's new length, and says so.
  assert.deepEqual(proposalOverrides(saved, readTimeline(projectId)), [{ element_id: ELEMENT_A, field: "duration" }]);
});

test("refresh carries an unrelated-edit proposal onto the new revision so approval still works", () => {
  const projectId = "stale-refresh-rebase";
  const revision = seed(projectId);
  const record = savePending(projectId, revision, ELEMENT_A, "20260813T000002-cccccccc");

  writeTimeline(projectId, {
    elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4, duration: 2 })],
    transitions: [],
  }, "human_edit");
  const newRevision = timelineRevision(projectId);
  assert.notEqual(newRevision, revision);

  const refreshed = refreshPendingProposals(projectId);
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0]!.rebased, true);
  assert.equal(refreshed[0]!.staleness.stale, false);
  // Persisted, so the in-lock revision check at apply time will now pass.
  assert.equal(readProposal(projectId, record.proposal_id).proposal.expected_revision, newRevision);
});

test("refresh carries a card past the creator's own change, and retires it only when its clip is deleted", () => {
  const projectId = "stale-refresh-conflict";
  const revision = seed(projectId);
  const record = savePending(projectId, revision, ELEMENT_A, "20260813T000003-dddddddd");

  writeTimeline(projectId, {
    elements: [element(ELEMENT_A, { duration: 2 }), element(ELEMENT_B, { timeline_start: 4 })],
    transitions: [],
  }, "human_edit");
  const carried = refreshPendingProposals(projectId);
  assert.equal(carried[0]!.rebased, true);
  assert.equal(carried[0]!.staleness.stale, false);

  writeTimeline(projectId, { elements: [element(ELEMENT_B, { timeline_start: 4 })], transitions: [] }, "human_delete");
  const retired = refreshPendingProposals(projectId);
  assert.equal(retired[0]!.rebased, false);
  assert.equal(retired[0]!.staleness.stale, true);
  assert.match(retired[0]!.staleness.reason ?? "", /deleted/);
  assert.notEqual(readProposal(projectId, record.proposal_id).proposal.expected_revision, timelineRevision(projectId));
});

test("refresh carries a non-conflicting audio creation across an unrelated approval", () => {
  const projectId = "stale-create-audio-rebase";
  const revision = seed(projectId);
  const createdId = "33333333-3333-4333-8333-333333333333";
  const proposal = proposalCreatingMusic(projectId, revision, createdId);
  const record = saveProposal(projectId, proposal, {
    proposalId: "20260813T000006-11111111",
    touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal),
  });

  writeTimeline(projectId, {
    elements: [element(ELEMENT_A, { volume: 0.8 }), element(ELEMENT_B, { timeline_start: 4 })],
    transitions: [],
  }, "approve_other_proposal");
  const newRevision = timelineRevision(projectId);

  const refreshed = refreshPendingProposals(projectId);
  assert.equal(refreshed[0]!.rebased, true);
  assert.equal(refreshed[0]!.staleness.stale, false);
  assert.equal(readProposal(projectId, record.proposal_id).proposal.expected_revision, newRevision);
});

test("a lane-order assertion never strands a card; re-validation decides", () => {
  const projectId = "stale-noop-lane-order";
  const revision = seed(projectId);
  const proposal = proposalAddingVisualWithExistingLaneOrder(projectId, revision, ELEMENT_A);
  const record = saveProposal(projectId, proposal, {
    proposalId: "20260916T000008-12345678",
    touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal),
  });

  writeTimeline(projectId, {
    elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4, duration: 2 })],
    transitions: [],
  }, "approve_unrelated_card");

  const matchingLaneOrder = evaluateProposalStaleness(
    readProposal(projectId, record.proposal_id),
    readTimeline(projectId),
    timelineRevision(projectId),
    ["visual_1", "visual_0"],
  );
  assert.equal(matchingLaneOrder.stale, false);
  assert.equal(matchingLaneOrder.rebasable, true);

  const changedLaneOrder = evaluateProposalStaleness(
    readProposal(projectId, record.proposal_id),
    readTimeline(projectId),
    timelineRevision(projectId),
    ["visual_0", "visual_1"],
  );
  assert.equal(changedLaneOrder.stale, false);
  assert.equal(changedLaneOrder.rebasable, true);
});

test("refresh keeps an audio creation stale when the new timeline occupies its lane", () => {
  const projectId = "stale-create-audio-collision";
  const revision = seed(projectId);
  const createdId = "44444444-4444-4444-8444-444444444444";
  const proposal = proposalCreatingMusic(projectId, revision, createdId);
  saveProposal(projectId, proposal, {
    proposalId: "20260813T000007-22222222",
    touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal),
  });
  const competing = element("55555555-5555-4555-8555-555555555555", {
    type: "music",
    source_url: "/api/music-catalog/media/licensed/other.mp3",
    lane_key: "music_0",
    timeline_start: 10,
    duration: 4,
  });
  writeTimeline(projectId, {
    elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4 }), competing],
    transitions: [],
  }, "conflicting_music");

  const refreshed = refreshPendingProposals(projectId);
  assert.equal(refreshed[0]!.rebased, false);
  assert.equal(refreshed[0]!.staleness.stale, true);
  assert.match(refreshed[0]!.staleness.reason ?? "", /audio overlap/i);
});

test("a record without fingerprints is carried by re-validation like any other", () => {
  const projectId = "stale-legacy-record";
  const revision = seed(projectId);
  // Saved WITHOUT fingerprints, like every record written before this shipped.
  const legacy = saveProposal(projectId, proposalTouching(projectId, revision, ELEMENT_A), {
    proposalId: "20260813T000004-eeeeeeee",
  });

  writeTimeline(projectId, {
    elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4, duration: 2 })],
    transitions: [],
  }, "human_edit");

  const staleness = evaluateProposalStaleness(
    readProposal(projectId, legacy.proposal_id),
    readTimeline(projectId),
    timelineRevision(projectId),
  );
  assert.equal(staleness.stale, false);
  assert.equal(staleness.rebasable, true);
});

test("a resolved proposal is never reported stale", () => {
  const projectId = "stale-resolved-record";
  const revision = seed(projectId);
  const record = savePending(projectId, revision, ELEMENT_A, "20260813T000005-ffffffff");
  const resolved = { ...readProposal(projectId, record.proposal_id), status: "approved" as const };

  writeTimeline(projectId, {
    elements: [element(ELEMENT_A, { duration: 2 })],
    transitions: [],
  }, "human_edit");

  const staleness = evaluateProposalStaleness(resolved, readTimeline(projectId), timelineRevision(projectId));
  assert.equal(staleness.stale, false);
});

test("an effect card survives the creator's other edits to its clip, and goes out of date only when it cannot apply", () => {
  const projectId = "independent-effects";
  const revision = seed(projectId);
  const draft = validateEditorAgentProposalAgainstProject({
    ...proposalTouching(projectId, revision, ELEMENT_A), rebase_policy: "independent",
    options: [{id: "glow", label: "Glow", summary: "Glow", recommended: true, requested_mutations: 1,
      operations: [{element_id: ELEMENT_A, props: {transition_keyframes: {
        subject_glow: [{t: 0, v: 1.8, ease: "linear"}, {t: .3, v: 0, ease: "hold"}],
      }}}]}],
  }, 24, projectId);
  const original = readTimeline(projectId);
  const record = saveProposal(projectId, draft, {touchedFingerprints: proposalElementFingerprints(original, draft)});
  const moved = structuredClone(original);
  moved.elements[0].duration = 3;
  moved.elements[0].playback_rate = 1.2;
  moved.elements[0].props = {media_scale: 1.2, keyframes: {media_offset_x: [{t: 0, v: 0}, {t: 3, v: 2}]}};
  assert.equal(evaluateProposalStaleness(record, moved, "new").stale, false);
  moved.elements[0].props.subject_glow = 2;
  moved.elements[0].trim_start = .1;
  assert.equal(evaluateProposalStaleness(record, moved, "new").stale, false);
  moved.elements[0].trim_start = 0;
  // Its glow keys no longer fit in the clip: re-validation retires it.
  moved.elements[0].duration = .1;
  writeTimeline(projectId, moved, "shortened");
  assert.equal(refreshPendingProposals(projectId)[0].staleness.stale, true);
});
