import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { proposalOptionDerivationKey, proposalReviewDetail } from "@/lib/agent/proposal-detail";
import { refreshedOptionDerivations, refreshPendingProposals } from "@/lib/agent/proposal-refresh";
import { resolveProposalBatch } from "@/lib/agent/proposal-batch";
import { proposalElementFingerprints } from "@/lib/agent/proposal-staleness";
import { timelineRevision, validateEditorAgentProposalAgainstProject, type LiveOptionDerivation } from "@/lib/agent/timeline-editor-agent-apply";
import { listProposals, saveProposal } from "@/lib/local-store/proposals";
import { createProject, readMetadata, readTimeline, readTimelineSnapshot, writeTimeline } from "@/lib/local-store/store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-refresh-detail-reuse-"));
process.env.TIMELINE_PROJECTS_DIR = root;
process.env.MEDIA_PREPARATION_AUTOSTART = "0";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

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
  writeTimeline(projectId, { elements: [element(A), element(B, { timeline_start: 4 })], transitions: [] }, "fixture");
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId),
    mode: "workshop", decision: "propose", summary: "Shorten and nudge one clip.", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [
      { id: "short", label: "Short", recommended: true, summary: "Short.", requested_mutations: 1, operations: [{ element_id: A, patch: { duration: 3 } }] },
      { id: "nudge", label: "Nudge", recommended: false, summary: "Nudge.", requested_mutations: 1, operations: [{ element_id: A, props: { media_offset_x: 0.1 } }] },
    ],
  }, 24, projectId);
  return saveProposal(projectId, proposal, { touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal) });
}

/** An unrelated human edit: the card is rebased and re-validated on the next refresh. */
function editB(projectId: string, duration: number) {
  const timeline = readTimeline(projectId);
  writeTimeline(projectId, { ...timeline, elements: timeline.elements.map((row) => row.id === B ? { ...row, duration } : row) }, "human edit");
}

/** An assignment in strict mode, as the editor's modules run: a frozen target throws instead of ignoring it. */
function strictSet(target: object, key: string, value: unknown) {
  "use strict";
  (target as Record<string, unknown>)[key] = value;
}

function anyFrozen(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.isFrozen(value) || Object.values(value).some((child) => anyFrozen(child, seen));
}

test("detail answers identically with the refresh's derives and without them", () => {
  const projectId = "reuse-identical";
  seed(projectId);
  editB(projectId, 5);
  const snapshot = readTimelineSnapshot(projectId);
  const refreshed = refreshPendingProposals(projectId, snapshot);
  assert.equal(refreshed[0]!.rebased, true);
  const derivations = refreshedOptionDerivations(refreshed);
  assert.equal(derivations.size, 2, "both options validated and kept");
  const record = listProposals(projectId)[0]!;
  const context = { timeline: snapshot.timeline, revision: snapshot.revision, laneOrderKeys: readMetadata(projectId).lane_order_keys };
  const reused = proposalReviewDetail(projectId, record, context, derivations);
  const fresh = proposalReviewDetail(projectId, record, context);
  assert.deepEqual(reused, fresh);
  assert.ok(reused.review.every((review) => review.playback_range), "every option has its playback range");
});

test("detail reuses only a derive whose proposal, option, revision and base match", () => {
  const projectId = "reuse-keys";
  const record = seed(projectId);
  const snapshot = readTimelineSnapshot(projectId);
  const context = { timeline: snapshot.timeline, revision: snapshot.revision };
  const fresh = proposalReviewDetail(projectId, record, context);
  // A marker derive: clip A moved to 20 s. Where it is used, the playback range follows it.
  const marker = (base = snapshot.timeline, optionId = "short"): LiveOptionDerivation => ({
    option: record.proposal.options.find((option) => option.id === optionId)!,
    base,
    derived: { timeline: { ...base, elements: base.elements.map((row) => row.id === A ? { ...row, timeline_start: 20, duration: 3 } : row) }, touched: [A] },
  });
  const rangeOf = (detail: ReturnType<typeof proposalReviewDetail>, optionId: string) =>
    detail.review.find((review) => review.option_id === optionId)!.playback_range;
  const used = proposalReviewDetail(projectId, record, context, new Map([[proposalOptionDerivationKey(record.proposal_id, "short", snapshot.revision), marker()]]));
  assert.ok(rangeOf(used, "short")!.end_seconds > 20, "a matching derive is used");
  assert.deepEqual(rangeOf(used, "nudge"), rangeOf(fresh, "nudge"), "an option without a derive derives itself");
  for (const [label, key, derivation] of [
    ["another revision", proposalOptionDerivationKey(record.proposal_id, "short", "other-revision"), marker()],
    ["another proposal", proposalOptionDerivationKey("other-proposal", "short", snapshot.revision), marker()],
    ["another option's derive under this key", proposalOptionDerivationKey(record.proposal_id, "short", snapshot.revision), marker(snapshot.timeline, "nudge")],
    ["another base", proposalOptionDerivationKey(record.proposal_id, "short", snapshot.revision), marker(readTimeline(projectId))],
  ] as const) {
    assert.deepEqual(proposalReviewDetail(projectId, record, context, new Map([[key, derivation]])), fresh, label);
  }
});

test("refresh hands read-only derives and writes records independent of them", () => {
  const projectId = "reuse-frozen";
  seed(projectId);
  editB(projectId, 6);
  const snapshot = readTimelineSnapshot(projectId);
  const [result] = refreshPendingProposals(projectId, snapshot);
  assert.equal(result!.rebased, true);
  assert.equal(result!.derivations!.revision, snapshot.revision);
  for (const { derived, base } of result!.derivations!.options) {
    assert.equal(base, snapshot.timeline);
    const own = derived.timeline.elements.find((row) => row.id === A)!;
    assert.notEqual(own, snapshot.timeline.elements.find((row) => row.id === A), "the changed row is the derive's own");
    assert.ok(Object.isFrozen(derived) && Object.isFrozen(derived.timeline) && Object.isFrozen(derived.timeline.elements) && Object.isFrozen(own) && Object.isFrozen(derived.touched));
    assert.throws(() => { (derived.timeline.elements as TimelineElement[]).push(element("x")); }, TypeError);
    assert.throws(() => strictSet(own, "duration", 9), TypeError);
    assert.throws(() => strictSet(own.props!, "marker", 1), TypeError);
    assert.throws(() => { (derived.touched as string[]).push("x"); }, TypeError);
  }
  // What refresh stored and returned shares nothing frozen; the file holds the same record.
  assert.equal(anyFrozen(result!.record), false);
  assert.equal(result!.record.proposal.expected_revision, snapshot.revision);
  assert.ok(Object.values(result!.record.touched_fingerprints!).every((value) => typeof value === "string"));
  const stored = listProposals(projectId)[0]!;
  assert.deepEqual(stored, result!.record);
  result!.record.proposal.summary = "changed by the caller";
  assert.equal(listProposals(projectId)[0]!.proposal.summary, "Shorten and nudge one clip.");
  // A cached verdict derives nothing, so a repeat refresh offers no derive and detail derives itself.
  const again = refreshPendingProposals(projectId, readTimelineSnapshot(projectId));
  assert.equal(again[0]!.derivations, undefined);
  assert.equal(refreshedOptionDerivations(again).size, 0);
});

test("the batch's derives and live timeline are read-only", () => {
  const projectId = "reuse-batch";
  const record = seed(projectId);
  const batch = resolveProposalBatch(projectId, [{ proposal_id: record.proposal_id, option_id: "short" }]);
  const derived = batch.items[0]!.liveDerivation!.derived;
  assert.equal(batch.items[0]!.liveDerivation!.base, batch.timeline);
  assert.ok(batch.timeline.elements.every((row) => Object.isFrozen(row)), "the live rows are the frozen snapshot's");
  assert.throws(() => { (derived.timeline.elements as TimelineElement[]).pop(); }, TypeError);
  assert.throws(() => strictSet(derived.timeline.elements.find((row) => row.id === A)!, "duration", 1), TypeError);
  assert.equal(derived.timeline.elements.find((row) => row.id === A)!.duration, 3);
  assert.equal(batch.revision, timelineRevision(projectId));
  assert.equal(readTimeline(projectId).elements.find((row) => row.id === A)!.duration, 4, "nothing written");
});
