import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { proposalReviewDetail } from "./proposal-detail";
import {
  deriveProposalTimeline,
  parseEditorAgentProposal,
  previewEditorAgentProposal,
  readOnlyProposalPreview,
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
  type EditorAgentOperation,
} from "./timeline-editor-agent-apply";
import { saveProposal } from "@/lib/local-store/proposals";
import { createProject, readMetadata, readTimeline, readTimelineSnapshot, writeTimeline, type TimelineFile } from "@/lib/local-store/store";
import { changedFromUnmutated } from "@/lib/timeline/caption-word-elements";
import { gpuWriteAdmissionIssues } from "@/lib/timeline/gpu-write-admission";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-derive-sharing-"));

const SKY = "11111111-1111-4111-8111-111111111111";
const LABEL = "22222222-2222-4222-8222-222222222222";
const WHOOSH = "33333333-3333-4333-8333-333333333333";
const WORDS = "44444444-4444-4444-8444-444444444444";
const TOUCHED_WORDS = "55555555-5555-4555-8555-555555555555";
const NEW_SHAPE = "66666666-6666-4666-8666-666666666666";
const now = "2026-10-25T00:00:00.000Z";

function row(id: string, projectId: string, overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id, project_id: projectId, type: "shape", source_url: null, beat_id: null, character_id: null, props: {},
    timeline_start: 0, duration: 8, lane_key: "visual_1", lane_index: 1, trim_start: 0, trim_end: 0, volume: 0, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now, ...overrides,
  } as TimelineElement;
}

const words = (text: string) => ({ text, timingMode: "single_word", fontPreset: "caveat", fontSizePx: 64, styleVariant: "none",
  wordTimings: text.split(" ").map((word, index) => ({ text: word, start: index * 0.5, end: index * 0.5 + 0.5 })) });

/** A drawing with a label placed below it, a sound linked to it and two multi-word single-word captions. */
function setup(projectId: string) {
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [
    row(SKY, projectId, { props: { title: "skyline", shape_kind: "rect", shape_width: 0.3, shape_height: 0.2, shape_fill: "#ffffff", media_offset_x: 0.5, media_offset_y: -0.3 } }),
    row(LABEL, projectId, { type: "caption_text", lane_key: "captions_3", lane_index: 3, timeline_start: 1, duration: 3,
      props: { text: "skyline", fontPreset: "caveat", fontSizePx: 64, styleVariant: "none", maxWidth: 0.25, place: { relative_to: SKY, side: "below", gap: 0.02, align: "center" } } }),
    row(WHOOSH, projectId, { type: "sound_effect", source_url: "/api/sfx-catalog/media/impact.wav", lane_key: "sound_effect_0", lane_index: 0, timeline_start: 0.5, duration: 1, volume: 1,
      props: { follows_visual: { element_id: SKY, offset_seconds: 0.5 }, source_duration_seconds: 1, source_start_seconds: 0, source_end_seconds: 1 } }),
    row(WORDS, projectId, { type: "caption_text", lane_key: "captions_0", lane_index: 0, timeline_start: 2, duration: 1, props: words("two words") }),
    row(TOUCHED_WORDS, projectId, { type: "caption_text", lane_key: "captions_1", lane_index: 1, timeline_start: 4, duration: 1.5, props: words("three more words") }),
  ], transitions: [] }, "fixture");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// Each option changes rows that linked-row steps then change again in place: the moved drawing carries
// its label (placement relation) and its sound (sound link); a touched caption splits into words.
const OPTIONS: Record<string, EditorAgentOperation[]> = {
  move: [{ element_id: SKY, patch: { timeline_start: 2 }, props: { shape_width: 0.5 } }] as EditorAgentOperation[],
  caption: [{ element_id: TOUCHED_WORDS, props: { animationIn: "fade" } }] as EditorAgentOperation[],
  remove: [{ element_id: SKY, remove_visual: { reason: "Not needed" } }] as EditorAgentOperation[],
  create: [{ element_id: NEW_SHAPE, create_shape: { shape_kind: "rect", timeline_start: 9, duration_seconds: 2, lane_key: "visual_2", lane_index: 2,
    shape_width: 0.2, shape_height: 0.2, shape_fill: "#ff0000" } }] as unknown as EditorAgentOperation[],
};

// Per-call clocks are the only fields two derives may differ in.
const strip = (value: unknown) => JSON.stringify(value).replace(/"20\d\d-\d\d-\d\dT[0-9:.]+Z"/g, '"T"');

test("a derive onto a deep-frozen base never changes it and matches a derive onto a private copy", () => {
  const projectId = "derive-sharing-frozen";
  setup(projectId);
  const loose = readTimeline(projectId);
  const frozen = deepFreeze(structuredClone(loose));
  for (const [name, operations] of Object.entries(OPTIONS)) {
    const fromCopy = deriveProposalTimeline(structuredClone(loose), operations, projectId);
    const fromFrozen = deriveProposalTimeline(frozen, operations, projectId);
    assert.equal(strip(fromFrozen), strip(fromCopy), `${name}: same result`);
    // The public result is the caller's own: nothing in it is the base's, so it may be edited.
    assert.ok(fromFrozen.timeline.elements.every((element) => !frozen.elements.includes(element) && !Object.isFrozen(element)), `${name}: independent result`);
    const before = JSON.stringify(loose);
    deriveProposalTimeline(loose, operations, projectId);
    assert.equal(JSON.stringify(loose), before, `${name}: an unfrozen base is unchanged too`);
  }
  // The linked-row steps really ran on shared rows.
  const moved = deriveProposalTimeline(frozen, OPTIONS.move!, projectId);
  assert.deepEqual([...moved.touched].sort(), [SKY, LABEL, WHOOSH].sort());
  assert.equal(moved.timeline.elements.find((element) => element.id === WHOOSH)!.timeline_start, 2.5);
  // Older captions still holding several words: only the one the option touches splits into words.
  const LEFT = "77777777-7777-4777-8777-777777777777", SPLIT = "88888888-8888-4888-8888-888888888888";
  const withOlder = deepFreeze({ ...structuredClone(loose), elements: [...structuredClone(loose.elements),
    row(LEFT, projectId, { type: "caption_text", lane_key: "captions_5", lane_index: 5, timeline_start: 6, duration: 1, props: words("left alone") }),
    row(SPLIT, projectId, { type: "caption_text", lane_key: "captions_6", lane_index: 6, timeline_start: 6, duration: 1.5, props: words("split me now") })] });
  const option = [{ element_id: SPLIT, props: { animationIn: "fade" } }] as EditorAgentOperation[];
  const split = deriveProposalTimeline(withOlder, option, projectId);
  assert.equal(strip(split), strip(deriveProposalTimeline(structuredClone(withOlder), option, projectId)));
  assert.equal(split.timeline.elements.filter((element) => element.id === LEFT).length, 1);
  assert.equal(split.timeline.elements.filter((element) => element.id === SPLIT || element.props?.split_from_id === SPLIT).length, 3);
});

test("a read-only preview shares only the rows the option leaves alone", () => {
  const projectId = "derive-sharing-read-only";
  setup(projectId);
  const { timeline: base } = readTimelineSnapshot(projectId);
  const proposal = parseEditorAgentProposal({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Move the drawing", assumptions: [], unresolved_gaps: [], rebase_policy: "independent", caps: { max_mutations: 24, requested_mutations: 2, max_renders: 0 },
    options: [{ id: "move", label: "Move", recommended: true, summary: "Move", requested_mutations: 2, operations: OPTIONS.move }],
  });
  const shared = readOnlyProposalPreview(proposal, "move", base);
  const fresh = previewEditorAgentProposal(proposal, "move");
  assert.equal(strip({ timeline: shared.timeline, touched: shared.touched }), strip({ timeline: fresh.timeline, touched: fresh.touched }));
  const baseRows = new Set(base.elements);
  for (const element of shared.timeline.elements) {
    assert.equal(baseRows.has(element), !shared.touched.includes(element.id), `${element.id}: shared exactly when untouched`);
  }
});

test("editing a picture clip's look keeps sharing the caption rail", () => {
  const projectId = "derive-sharing-picture";
  setup(projectId);
  const CLIP = "99999999-9999-4999-8999-999999999999";
  const loose = readTimeline(projectId);
  const base = deepFreeze({ ...loose, elements: [...loose.elements, row(CLIP, projectId, { type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    lane_key: "visual_0", lane_index: 0, volume: 1, props: { source_duration_seconds: 8, source_start_seconds: 0, source_end_seconds: 8 } })] });
  const option = [{ element_id: CLIP, props: { media_scale: 1.1 } }] as EditorAgentOperation[];
  const derived = deriveProposalTimeline(base, option, projectId);
  assert.equal(strip(derived), strip(deriveProposalTimeline(structuredClone(base), option, projectId)));
  const proposal = parseEditorAgentProposal({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Zoom in", assumptions: [], unresolved_gaps: [], rebase_policy: "independent", caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [{ id: "zoom", label: "Zoom", recommended: true, summary: "Zoom", requested_mutations: 1, operations: option }],
  });
  const shared = readOnlyProposalPreview(proposal, "zoom", base);
  // Rows a linked-row step could change (the placed label, the linked sound) are copied up front.
  const captions = base.elements.filter((element) => element.type === "caption_text" && !element.props?.place);
  assert.ok(captions.length > 0 && captions.every((caption) => shared.timeline.elements.includes(caption)), "an edit stamp on the clip is not a clock change");
});

test("an option outside the row-scoped fields still starts from a full copy", () => {
  const projectId = "derive-sharing-fallback";
  setup(projectId);
  const frozen = deepFreeze(readTimeline(projectId));
  // A field outside the row-scoped set (here one derive does not know) makes it copy everything first.
  const derived = deriveProposalTimeline(frozen, [{ element_id: SKY, props: { shape_width: 0.5 }, a_future_field: true }] as unknown as EditorAgentOperation[], projectId);
  assert.ok(derived.timeline.elements.every((element) => !frozen.elements.includes(element)));
});

test("validation gives its observer an independent derive equal to the public one", () => {
  const projectId = "derive-sharing-validation";
  setup(projectId);
  const { timeline: base } = readTimelineSnapshot(projectId);
  const raw = {
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Move the drawing", assumptions: [], unresolved_gaps: [], rebase_policy: "independent", caps: { max_mutations: 24, requested_mutations: 2, max_renders: 0 },
    options: [{ id: "move", label: "Move", recommended: true, summary: "Move", requested_mutations: 2, operations: OPTIONS.move }],
  };
  const seen: TimelineFile[] = [];
  validateEditorAgentProposalAgainstProject(raw, 24, projectId, base, ({ derived }) => seen.push(derived.timeline));
  assert.equal(seen.length, 1);
  assert.equal(strip(seen[0]), strip(deriveProposalTimeline(base, OPTIONS.move!, projectId).timeline));
  assert.ok(seen[0]!.elements.every((element) => !base.elements.includes(element)), "the observer may keep and edit it");
});

test("changedFromUnmutated: the same object is unchanged without serializing it", () => {
  const before = [row(SKY, "p", {}), row(LABEL, "p", { type: "caption_text" })];
  const changed = changedFromUnmutated(before);
  assert.equal(changed(before[0]!), false);
  assert.equal(changed(structuredClone(before[1]!)), false, "an equal copy is unchanged");
  assert.equal(changed({ ...before[1]!, duration: 2 }), true);
  assert.equal(changed(row(WHOOSH, "p", {})), true, "a new row is changed");
});

test("GPU admission reuses a frozen base's projection only while its rows are the same objects", () => {
  const unsupported = (base: TimelineElement) => ({ ...base, props: { ...base.props, not_a_drawn_prop: 1 } });
  const shape = row(SKY, "p", { props: { shape_kind: "rect", shape_width: 0.2, shape_height: 0.2, shape_fill: "#ffffff" } });
  const other = row(LABEL, "p", { props: { shape_kind: "rect", shape_width: 0.2, shape_height: 0.2, shape_fill: "#ffffff" } });
  const frozenBase = deepFreeze({ elements: [unsupported(shape), other], transitions: [] });
  const after = { elements: [frozenBase.elements[0]!, unsupported(other)], transitions: [] };
  const expected = gpuWriteAdmissionIssues(structuredClone(frozenBase), after).map((issue) => `${issue.elementId}:${issue.capability}`);
  assert.deepEqual(expected, [`${LABEL}:property:not_a_drawn_prop`], "only the write's new issue");
  for (let pass = 0; pass < 2; pass += 1) {
    assert.deepEqual(gpuWriteAdmissionIssues(frozenBase, after).map((issue) => `${issue.elementId}:${issue.capability}`), expected);
  }
  // An unfrozen base edited in place between calls is projected again.
  const loose = { elements: [shape, other], transitions: [] };
  assert.equal(gpuWriteAdmissionIssues(loose, after).length, 2);
  loose.elements[0] = unsupported(shape);
  assert.equal(gpuWriteAdmissionIssues(loose, after).length, 1);
});

test("proposal detail derives onto the timeline it is given, not a second read of the file", () => {
  const projectId = "derive-sharing-detail";
  setup(projectId);
  const record = saveProposal(projectId, parseEditorAgentProposal({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Move the drawing", assumptions: [], unresolved_gaps: [], rebase_policy: "independent", caps: { max_mutations: 24, requested_mutations: 2, max_renders: 0 },
    options: [{ id: "move", label: "Move", recommended: true, summary: "Move", requested_mutations: 2, operations: OPTIONS.move }],
  }));
  const context = { timeline: readTimeline(projectId), revision: timelineRevision(projectId), laneOrderKeys: readMetadata(projectId).lane_order_keys };
  const detail = proposalReviewDetail(projectId, record, context);
  assert.ok(detail.review[0]!.playback_range, "the option has a playback range");
  const file = path.join(process.env.TIMELINE_PROJECTS_DIR!, projectId, "timeline.json");
  fs.renameSync(file, `${file}.away`);
  try {
    assert.deepEqual(proposalReviewDetail(projectId, record, context).review, detail.review);
  } finally {
    fs.renameSync(`${file}.away`, file);
  }
});
