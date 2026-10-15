import assert from "node:assert/strict";
import test from "node:test";

import { proposeAnnotationRebase, type HumanTrackDecision } from "./annotation-rebase";
import type { AnonymousTrack } from "./semantic-tracks";

function track(revision: string, id: string, x: number, times = [0, 0.5, 1], label: "face" | "person" = "person"): AnonymousTrack {
  return {
    analysis_revision: revision, track_id: id, shot_id: "shot_1", label,
    start_seconds: times[0]!, end_seconds: times.at(-1)!, confidence: 0.9,
    samples: times.map((time, index) => ({
      detection_id: `${id}_${index}`, frame_id: `f_${time}`, time_seconds: time, confidence: 0.9,
      box: { x, y: 0.2, width: 0.2, height: 0.4 },
    })),
  };
}

const decision: HumanTrackDecision = {
  decision_id: "decision_1", track_ref: { analysis_revision: "old", track_id: "person_01" },
  kind: "alias", value: "founder", confirmed_by: "human",
};

test("an exact rebase is only proposed and never silently confirmed", () => {
  const result = proposeAnnotationRebase({
    decisions: [decision], previous_tracks: [track("old", "person_01", 0.1)],
    next_tracks: [track("new", "person_08", 0.1)],
  });
  assert.equal(result[0]!.status, "proposed");
  assert.equal(result[0]!.confirmation_required, true);
  assert.deepEqual(result[0]!.proposed_track_ref, { analysis_revision: "new", track_id: "person_08" });
  assert.deepEqual(result[0]!.decision, decision, "the original human decision stays intact");
});

test("two equally plausible new tracks become needs_review", () => {
  const result = proposeAnnotationRebase({
    decisions: [decision], previous_tracks: [track("old", "person_01", 0.1)],
    next_tracks: [track("new", "person_a", 0.1), track("new", "person_b", 0.1)],
  });
  assert.equal(result[0]!.status, "needs_review");
  assert.equal(result[0]!.proposed_track_ref, null);
});

test("two old decisions cannot automatically target one new track", () => {
  const second = { ...decision, decision_id: "decision_2", track_ref: { analysis_revision: "old", track_id: "person_02" }, value: "guest" };
  const result = proposeAnnotationRebase({
    decisions: [decision, second],
    previous_tracks: [track("old", "person_01", 0.1), track("old", "person_02", 0.1)],
    next_tracks: [track("new", "person_09", 0.1)],
  });
  assert.deepEqual(result.map((item) => item.status), ["needs_review", "needs_review"]);
});

test("multiple decisions for the same old track travel as separate review proposals", () => {
  const role: HumanTrackDecision = { ...decision, decision_id: "role", kind: "role", value: "primary_subject" };
  const result = proposeAnnotationRebase({
    decisions: [decision, role], previous_tracks: [track("old", "person_01", 0.1)],
    next_tracks: [track("new", "person_09", 0.1)],
  });
  assert.deepEqual(result.map((item) => item.status), ["proposed", "proposed"]);
  assert.ok(result.every((item) => item.confirmation_required));
});

test("missing and weak matches preserve decisions as reviewable evidence", () => {
  const missingPrior = proposeAnnotationRebase({ decisions: [decision], previous_tracks: [], next_tracks: [] });
  assert.equal(missingPrior[0]!.status, "orphaned");
  assert.deepEqual(missingPrior[0]!.decision, decision);

  const weak = proposeAnnotationRebase({
    decisions: [decision], previous_tracks: [track("old", "person_01", 0.1)],
    next_tracks: [track("new", "person_02", 0.75)],
  });
  assert.equal(weak[0]!.status, "needs_review");
});

test("face tracks are never candidates for a person annotation", () => {
  const result = proposeAnnotationRebase({
    decisions: [decision], previous_tracks: [track("old", "person_01", 0.1)],
    next_tracks: [track("new", "face_01", 0.1, [0, 0.5, 1], "face")],
  });
  assert.equal(result[0]!.status, "orphaned");
});
