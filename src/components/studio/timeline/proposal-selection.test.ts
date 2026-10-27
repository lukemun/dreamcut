import assert from "node:assert/strict";
import test from "node:test";

import type { ProposalListEntry, ProposalOptionReview } from "./timeline-client";
import {
  compatibleProposalSelection,
  toggleProposalSelection,
  selectionForPlayedOption,
  proposalOptionsConflict,
  recommendedProposalSelection,
  selectionWithNewProposalDefaults,
} from "./proposal-selection";

function option(id: string, laneKey: string, start: number, duration: number): ProposalOptionReview {
  return {
    option_id: id, label: id, recommended: true, summary: id, requested_mutations: 1, impact: "one visual",
    rows: [{
      element_id: `${id}-element`, element_label: id, element_type: "still", action: "Add visual layer",
      changes: [
        { field: "lane_key", label: "Lane", before: "—", after: laneKey, after_value: laneKey, target: "create_visual", operation_index: 0 },
        { field: "timeline_start", label: "Start", before: "—", after: `${start}s`, after_value: start, target: "create_visual", operation_index: 0 },
        { field: "duration_seconds", label: "Duration", before: "—", after: `${duration}s`, after_value: duration, target: "create_visual", operation_index: 0 },
      ],
    }],
  };
}

function operationOption(
  id: string,
  elementId: string,
  target: ProposalOptionReview["rows"][number]["changes"][number]["target"],
  values: Record<string, unknown>,
): ProposalOptionReview {
  return {
    option_id: id, label: id, recommended: true, summary: id, requested_mutations: 1, impact: id,
    rows: [{
      element_id: elementId, element_label: id, element_type: "video_clip", action: id,
      changes: Object.entries(values).map(([field, after_value]) => ({
        field, label: field, before: "—", after: String(after_value), after_value, target, operation_index: 0,
      })),
    }],
  };
}

function entry(id: string, stale = false, createdAt = "2026-09-15T00:00:00Z"): ProposalListEntry {
  return {
    proposal_id: id, created_at: createdAt, status: "pending", brief: null,
    summary: id, mode: "edit", decision: "pending", option_count: 1,
    recommended_option_id: id, stale, stale_reason: null,
  };
}

test("number shortcut toggles only its selection and switches alternatives", () => {
  const entries = [entry("a"), entry("b")];
  const details = { a: { stale: false, review: [option("one", "visual_1", 0, 1), option("two", "visual_1", 0, 1)] }, b: { stale: false, review: [option("b", "visual_2", 0, 1)] } };
  const initial = { a: "one", b: "b" };
  const off = toggleProposalSelection(entries, details, initial, "a", "one");
  assert.deepEqual(off, { b: "b" });
  assert.deepEqual(toggleProposalSelection(entries, details, off, "a", "one"), initial);
  assert.deepEqual(toggleProposalSelection(entries, details, initial, "a", "two"), { a: "two", b: "b" });
  assert.deepEqual(initial, { a: "one", b: "b" });
});

test("playing an alternative selects it; a one-option card keeps its tick", () => {
  const entries = [entry("a"), entry("b")];
  const details = { a: { stale: false, review: [option("one", "visual_1", 0, 1), option("two", "visual_1", 0, 1)] }, b: { stale: false, review: [option("b", "visual_2", 0, 1)] } };
  const initial = { a: "one", b: "b" };
  assert.deepEqual(selectionForPlayedOption(entries, details, initial, "a", "two"), { a: "two", b: "b" });
  assert.equal(selectionForPlayedOption(entries, details, initial, "a", "one"), initial);
  assert.deepEqual(selectionForPlayedOption(entries, details, {}, "a", "two"), { a: "two" });
  assert.deepEqual(selectionForPlayedOption(entries, details, { a: "one" }, "b", "b"), { a: "one" });
  assert.deepEqual(initial, { a: "one", b: "b" });
});

test("overlapping created visuals on the same lane conflict", () => {
  assert.equal(proposalOptionsConflict(option("old", "visual_4", 94, 6), option("new", "visual_4", 95, 5)), true);
  assert.equal(proposalOptionsConflict(option("left", "visual_4", 94, 1), option("right", "visual_4", 95, 1)), false);
  assert.equal(proposalOptionsConflict(option("a", "visual_4", 94, 6), option("b", "visual_5", 94, 6)), false);
});

test("transition revisions with different IDs cannot be replayed as a conflicting batch", () => {
  const transition = (id: string, from = "clip-a", to = "clip-b") => operationOption(id, `${id}-transition`, "create_transition", {
    from_element_id: from, to_element_id: to, type: "whip", duration_seconds: .167,
  });
  assert.equal(proposalOptionsConflict(transition("old"), transition("new")), true);
  assert.equal(proposalOptionsConflict(transition("old"), transition("next", "clip-b", "clip-c")), false);
  const entries = [entry("old", false, "2026-09-15T00:00:00Z"), entry("new", false, "2026-09-15T00:01:00Z")];
  const details = { old: { stale: false, review: [transition("old")] }, new: { stale: false, review: [transition("new")] } };
  assert.deepEqual(selectionWithNewProposalDefaults(entries, details, { old: "old" }, new Set(["old"])), { new: "new" });
  assert.deepEqual(toggleProposalSelection(entries, details, { new: "new" }, "old", "old"), { old: "old" });
});

test("video creation spans derive duration from their source window", () => {
  const video = (id: string, start: number, sourceIn: number, sourceOut: number) => (
    operationOption(id, `${id}-element`, "create_visual", {
      type: "video_clip", lane_key: "visual_4", timeline_start: start,
      source_duration_seconds: 20, source_start_seconds: sourceIn, source_end_seconds: sourceOut,
    })
  );
  assert.equal(proposalOptionsConflict(video("a", 4, 3, 8), video("b", 8, 0, 2)), true);
  assert.equal(proposalOptionsConflict(video("a", 4, 3, 8), video("b", 9, 0, 2)), false);
});

test("overlapping created audio on the same lane conflicts after playback rate", () => {
  const audio = (id: string, laneKey: string, start: number, sourceIn: number, sourceOut: number, rate: number) => (
    operationOption(id, `${id}-element`, "create_audio", {
      lane_key: laneKey, timeline_start: start, source_start_seconds: sourceIn,
      source_end_seconds: sourceOut, playback_rate: rate,
    })
  );
  assert.equal(proposalOptionsConflict(audio("a", "audio_narrator", 4, 2, 10, 2), audio("b", "audio_narrator", 7, 0, 2, 1)), true);
  assert.equal(proposalOptionsConflict(audio("a", "audio_narrator", 4, 2, 10, 2), audio("b", "audio_narrator", 8, 0, 2, 1)), false);
  assert.equal(proposalOptionsConflict(audio("a", "audio_narrator", 4, 2, 10, 2), audio("b", "music_0", 7, 0, 2, 1)), false);
});

test("caption replacements claim the shared caption rail", () => {
  const left = operationOption("left", "left-operation", "replace_captions", { caption_track: "2 force-aligned cues" });
  const right = operationOption("right", "right-operation", "replace_captions", { caption_track: "3 force-aligned cues" });
  assert.equal(proposalOptionsConflict(left, right), true);
});

test("caption replacement conflicts with a patch to a caption it removes", () => {
  const replacement = operationOption("replacement", "replacement-operation", "replace_captions", {
    caption_track: "78 force-aligned cues",
  });
  const patch = operationOption("word-style", "existing-caption", "props", { fontSizePx: 160 });
  patch.rows[0]!.element_type = "caption_text";
  assert.equal(proposalOptionsConflict(replacement, patch), true);
  assert.equal(proposalOptionsConflict(patch, replacement), true);
});

test("removing an element conflicts with every other edit to that element", () => {
  const removed = operationOption("remove", "shared-element", "remove_visual", { remove_visual: "replace shot" });
  const patched = operationOption("patch", "shared-element", "props", { media_scale: 1.2 });
  const unrelated = operationOption("other", "other-element", "props", { media_scale: 1.2 });
  assert.equal(proposalOptionsConflict(removed, patched), true);
  assert.equal(proposalOptionsConflict(patched, removed), true);
  assert.equal(proposalOptionsConflict(removed, unrelated), false);
});

test("recommended selection keeps the newest compatible refinement", () => {
  const entries = [entry("new"), entry("old"), entry("other"), entry("stale", true)];
  const details = {
    new: { stale: false, review: [option("new", "visual_4", 94, 6)] },
    old: { stale: false, review: [option("old", "visual_4", 94, 6)] },
    other: { stale: false, review: [option("other", "visual_5", 94, 6)] },
    stale: { stale: true, review: [option("stale", "visual_6", 94, 6)] },
  };
  assert.deepEqual(recommendedProposalSelection(entries, details), { new: "new", other: "other" });
});

test("a newly checked conflict replaces the previous selection", () => {
  const entries = [entry("new"), entry("old")];
  const details = {
    new: { stale: false, review: [option("new", "visual_4", 94, 6)] },
    old: { stale: false, review: [option("old", "visual_4", 94, 6)] },
  };
  assert.deepEqual(compatibleProposalSelection(entries, details, { new: "new", old: "old" }, "old"), { old: "old" });
});

test("identical shared lane-order registrations remain batch selectable", () => {
  const sharedOrder = ["captions_0", "visual_4", "visual_0"];
  const left = operationOption("left", "left-lane-order", "set_lane_order", { lane_order_keys: sharedOrder });
  const right = operationOption("right", "right-lane-order", "set_lane_order", { lane_order_keys: sharedOrder });
  const entries = [entry("left"), entry("right")];
  const details = {
    left: { stale: false, review: [left] },
    right: { stale: false, review: [right] },
  };

  assert.equal(proposalOptionsConflict(left, right), false);
  assert.deepEqual(recommendedProposalSelection(entries, details), { left: "left", right: "right" });
});

test("different shared lane orders still conflict", () => {
  const left = operationOption("left", "left-lane-order", "set_lane_order", {
    lane_order_keys: ["captions_0", "visual_4", "visual_0"],
  });
  const right = operationOption("right", "right-lane-order", "set_lane_order", {
    lane_order_keys: ["captions_0", "visual_0", "visual_4"],
  });

  assert.equal(proposalOptionsConflict(left, right), true);
});

test("new actionable proposals default into batch review without restoring manual unchecks", () => {
  const entries = [entry("new"), entry("unchecked"), entry("selected")];
  const details = {
    new: { stale: false, review: [option("new", "visual_6", 20, 2)] },
    unchecked: { stale: false, review: [option("unchecked", "visual_5", 10, 2)] },
    selected: { stale: false, review: [option("selected", "visual_4", 0, 2)] },
  };
  assert.deepEqual(
    selectionWithNewProposalDefaults(
      entries,
      details,
      { selected: "selected" },
      new Set(["unchecked", "selected"]),
    ),
    { new: "new", selected: "selected" },
  );
});

test("new default selection still excludes stale proposals", () => {
  const entries = [entry("fresh"), entry("stale", true)];
  const details = {
    fresh: { stale: false, review: [option("fresh", "visual_4", 0, 2)] },
    stale: { stale: true, review: [option("stale", "visual_5", 0, 2)] },
  };
  assert.deepEqual(
    selectionWithNewProposalDefaults(entries, details, {}, new Set()),
    { fresh: "fresh" },
  );
});

test("auditions default to the first displayed option even when another is recommended", () => {
  const first = { ...option("first", "visual_4", 0, 2), recommended: false };
  const recommended = option("recommended", "visual_4", 0, 2);
  const entries = [entry("audition")];
  const details = { audition: { stale: false, review: [first, recommended] } };
  assert.deepEqual(selectionWithNewProposalDefaults(entries, details, {}, new Set()), { audition: "first" });
  assert.deepEqual(
    selectionWithNewProposalDefaults(entries, details, { audition: "recommended" }, new Set(["audition"])),
    { audition: "recommended" },
  );
  assert.deepEqual(selectionWithNewProposalDefaults(entries, details, {}, new Set(["audition"])), {});
});

test("a newly arrived conflicting revision replaces the older default", () => {
  const entries = [
    entry("old", false, "2026-09-15T00:00:00Z"),
    entry("new", false, "2026-09-15T00:01:00Z"),
  ];
  const details = {
    old: { stale: false, review: [option("old", "visual_4", 0, 2)] },
    new: { stale: false, review: [option("new", "visual_4", 0, 2)] },
  };
  assert.deepEqual(
    selectionWithNewProposalDefaults(entries, details, { old: "old" }, new Set(["old"])),
    { new: "new" },
  );
});

test("entrance and exit tracks on the same subject remain separately selectable", () => {
  const entrance = operationOption("entrance", "subject", "props", {transition_keyframes: {subject_glow: [{t:0,v:1.8},{t:.3,v:0}]}});
  const exit = operationOption("exit", "subject", "props", {transition_keyframes: {media_offset_x: [{t:2,v:0},{t:3,v:2}]}});
  assert.equal(proposalOptionsConflict(entrance, exit), false);
  assert.deepEqual(recommendedProposalSelection([entry("entrance"), entry("exit")], {
    entrance: {stale:false,review:[entrance]}, exit: {stale:false,review:[exit]},
  }), {entrance:"entrance",exit:"exit"});
  const otherGlow = operationOption("other", "subject", "props", {transition_keyframes: {subject_glow: [{t:0,v:2},{t:.4,v:0}]}});
  assert.equal(proposalOptionsConflict(entrance, otherGlow), true);
  assert.equal(proposalOptionsConflict(entrance, operationOption("scalar", "subject", "props", {subject_glow:2})), true);
});

test("cut cards on separate stretches of a recording can be selected together", () => {
  const cut = (start: number, end: number) => ({
    option_id: "main", label: "Cut", recommended: true, summary: "", requested_mutations: 1, impact: "",
    rows: [{ element_id: "talking-clip", element_label: "Talk", element_type: "video_clip", action: "Remove source range and ripple",
      changes: [
        { field: "source_start_seconds", label: "Start", before: "—", after: String(start), target: "source_range_cut", operation_index: 0, after_value: start },
        { field: "source_end_seconds", label: "End", before: "—", after: String(end), target: "source_range_cut", operation_index: 0, after_value: end },
      ] }],
  }) as never;
  assert.equal(proposalOptionsConflict(cut(10, 12), cut(20, 21)), false);
  assert.equal(proposalOptionsConflict(cut(10, 12), cut(11, 13)), true);
});
