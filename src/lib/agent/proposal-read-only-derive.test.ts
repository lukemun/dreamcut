import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  deriveProposalTimeline,
  parseEditorAgentProposal,
  previewEditorAgentProposal,
  previewEditorAgentProposalBatch,
  readOnlyProposalPreview,
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
  type EditorAgentOperation,
  type LiveOptionDerivation,
} from "./timeline-editor-agent-apply";
import { createProject, findElement, readTimeline, readTimelineSnapshot, withElementIdIndex, writeTimeline, type TimelineFile } from "@/lib/local-store/store";
import { splitSingleWordCaptions } from "@/lib/timeline/caption-word-elements";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-read-only-derive-"));

const SKY = "11111111-1111-4111-8111-111111111111";
const VOICE = "22222222-2222-4222-8222-222222222222";
const SAID = "33333333-3333-4333-8333-333333333333";
const WORDS = "44444444-4444-4444-8444-444444444444";
const now = "2026-10-25T00:00:00.000Z";

function row(id: string, projectId: string, overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id, project_id: projectId, type: "shape", source_url: null, beat_id: null, character_id: null, props: {},
    timeline_start: 0, duration: 8, lane_key: "visual_1", lane_index: 1, trim_start: 0, trim_end: 0, volume: 0, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now, ...overrides,
  } as TimelineElement;
}

/** A drawing, a voice clip with a one-word caption that follows it, and a multi-word single-word caption. */
function setup(projectId: string) {
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [
    row(SKY, projectId, { props: { title: "skyline", shape_kind: "rect", shape_width: 0.3, shape_height: 0.2, shape_fill: "#ffffff" } }),
    row(VOICE, projectId, { type: "vo_segment", source_url: "/api/projects/x/media/voice.wav", lane_key: "audio_narrator", lane_index: 0, volume: 1,
      props: { source_duration_seconds: 8, source_start_seconds: 0, source_end_seconds: 8 } }),
    row(SAID, projectId, { type: "caption_text", lane_key: "captions_0", lane_index: 0, timeline_start: 1, duration: 0.5,
      props: { text: "hello", timingMode: "single_word", fontPreset: "caveat", fontSizePx: 64, styleVariant: "none", wordTimings: [{ text: "hello", start: 0, end: 0.5 }],
        caption_follow_audio: true, caption_source_element_id: VOICE } }),
    row(WORDS, projectId, { type: "caption_text", lane_key: "captions_1", lane_index: 1, timeline_start: 2, duration: 1,
      props: { text: "two words", timingMode: "single_word", fontPreset: "caveat", fontSizePx: 64, styleVariant: "none",
        wordTimings: [{ text: "two", start: 0, end: 0.5 }, { text: "words", start: 0.5, end: 1 }] } }),
  ], transitions: [] }, "fixture");
}

const strip = (value: unknown) => JSON.stringify(value).replace(/"20\d\d-\d\d-\d\dT[0-9:.]+Z"/g, '"T"');

function proposalFor(projectId: string, operations: EditorAgentOperation[]) {
  return {
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Edit", assumptions: [], unresolved_gaps: [], rebase_policy: "independent", caps: { max_mutations: 24, requested_mutations: operations.length, max_renders: 0 },
    options: [{ id: "a", label: "Edit", recommended: true, summary: "Edit", requested_mutations: operations.length, operations }],
  };
}

const LANES = { element_id: "77777777-7777-4777-8777-777777777777", set_lane_order: { lane_order_keys: ["captions_1", "captions_0", "audio_narrator", "visual_1"] } } as unknown as EditorAgentOperation;
const FORMAT = { element_id: "88888888-8888-4888-8888-888888888888", set_output_format: { aspect_ratio: "9:16" } } as unknown as EditorAgentOperation;
const WIDEN = { element_id: SKY, props: { shape_width: 0.5 } } as EditorAgentOperation;

test("the preview shares untouched rows with a held base and carries lane order and output format", () => {
  const projectId = "read-only-preview";
  setup(projectId);
  const { timeline: base } = readTimelineSnapshot(projectId);
  const before = JSON.stringify(base);
  const proposal = parseEditorAgentProposal(proposalFor(projectId, [WIDEN, LANES, FORMAT]));
  const preview = previewEditorAgentProposal(proposal, "a", base);
  const copied = deriveProposalTimeline(structuredClone(readTimeline(projectId)), proposal.options[0]!.operations, projectId);
  assert.equal(strip({ timeline: preview.timeline, touched: preview.touched, lanes: preview.laneOrderKeys, format: preview.outputFormat }),
    strip({ timeline: copied.timeline, touched: copied.touched, lanes: copied.laneOrderKeys, format: copied.outputFormat }));
  assert.deepEqual(preview.laneOrderKeys, ["captions_1", "captions_0", "audio_narrator", "visual_1"]);
  assert.equal(preview.outputFormat?.aspect_ratio, "9:16");
  const readOnly = readOnlyProposalPreview(proposal, "a", base);
  assert.deepEqual(readOnly.laneOrderKeys, preview.laneOrderKeys);
  assert.deepEqual(readOnly.outputFormat, preview.outputFormat);
  assert.ok(preview.timeline.elements.includes(findElement(base, VOICE)!), "an untouched row is the base's own object");
  assert.ok(!preview.timeline.elements.includes(findElement(base, SKY)!), "a changed row is a copy");
  assert.equal(JSON.stringify(base), before);
  // Without a base, the timeline read for the call is private to it: the caller may change the result.
  const own = previewEditorAgentProposal(proposal, "a");
  own.timeline.elements[0]!.duration = 99;
  assert.notEqual(readTimelineSnapshot(projectId).timeline.elements[0]!.duration, 99);
});

test("a batch preview onto a held base shares untouched rows and never changes the base", () => {
  const projectId = "read-only-batch";
  setup(projectId);
  const { timeline: base } = readTimelineSnapshot(projectId);
  const before = JSON.stringify(base);
  const first = parseEditorAgentProposal(proposalFor(projectId, [WIDEN])).options[0]!;
  const second = parseEditorAgentProposal(proposalFor(projectId, [{ element_id: VOICE, patch: { volume: 0.5 } } as EditorAgentOperation])).options[0]!;
  const batch = previewEditorAgentProposalBatch(projectId, [first, second], base);
  const copied = previewEditorAgentProposalBatch(projectId, [first, second], structuredClone(readTimeline(projectId)));
  assert.equal(strip(batch), strip(copied));
  assert.ok(batch.timeline.elements.includes(findElement(base, SAID)!), "the caption rail stays shared");
  assert.equal(JSON.stringify(base), before);
});

test("a voice clip's new sound keeps its following captions shared; a clock change copies and moves them", () => {
  const projectId = "read-only-clock";
  setup(projectId);
  const { timeline: base } = readTimelineSnapshot(projectId);
  const louder = readOnlyProposalPreview(parseEditorAgentProposal(proposalFor(projectId, [{ element_id: VOICE, patch: { volume: 0.5 } } as EditorAgentOperation])), "a", base);
  assert.ok(louder.timeline.elements.includes(findElement(base, SAID)!), "a sound change is not a clock change");
  const later = [{ element_id: VOICE, patch: { timeline_start: 1 } } as EditorAgentOperation];
  const moved = deriveProposalTimeline(base, later, projectId);
  assert.equal(strip(moved), strip(deriveProposalTimeline(structuredClone(readTimeline(projectId)), later, projectId)));
  const caption = moved.timeline.elements.find((element) => element.id === SAID)!;
  assert.equal(caption.timeline_start, 2, "the caption follows its voice clip");
  assert.equal(findElement(base, SAID)!.timeline_start, 1);
});

test("validation can hand its observer the row-sharing derive read-only, frozen and equal to the copy", () => {
  const projectId = "read-only-observer";
  setup(projectId);
  const raw = proposalFor(projectId, [WIDEN, LANES]);
  for (const base of [readTimelineSnapshot(projectId).timeline, readTimeline(projectId)]) {
    const before = JSON.stringify(base);
    const copies: LiveOptionDerivation[] = [];
    const shared: LiveOptionDerivation[] = [];
    validateEditorAgentProposalAgainstProject(raw, 24, projectId, base, (derivation) => copies.push(derivation));
    validateEditorAgentProposalAgainstProject(raw, 24, projectId, base, (derivation) => shared.push(derivation), "read_only");
    assert.equal(shared.length, 1);
    const { derived } = shared[0]!;
    assert.equal(strip(derived), strip(copies[0]!.derived));
    assert.equal(shared[0]!.base, base);
    const baseRows = new Set(base.elements);
    assert.ok(derived.timeline.elements.includes(findElement(base, VOICE)!), "untouched rows are the base's own objects");
    for (const element of derived.timeline.elements) {
      if (!baseRows.has(element)) assert.ok(Object.isFrozen(element) && Object.isFrozen(element.props), `${element.id} is frozen`);
    }
    for (const value of [derived, derived.timeline, derived.timeline.elements, derived.timeline.transitions, derived.touched, derived.laneOrderKeys]) assert.ok(Object.isFrozen(value));
    const changed = derived.timeline.elements.find((element) => element.id === SKY)!;
    assert.equal(Reflect.set(changed, "duration", 1), false, "a changed row cannot be edited");
    assert.equal(Reflect.set(changed.props!, "shape_width", 1), false, "nor its props");
    assert.throws(() => { derived.timeline.elements.push(changed); }, TypeError);
    assert.equal(JSON.stringify(base), before, "the base is unchanged");
    assert.ok(!Object.isFrozen(copies[0]!.derived.timeline.elements), "the default copy stays the caller's to change");
    // A batch preview reuses the read-only derive and derives the next option onto it without changing it.
    const next = parseEditorAgentProposal(proposalFor(projectId, [{ element_id: VOICE, patch: { volume: 0.5 } } as EditorAgentOperation])).options[0]!;
    const option = parseEditorAgentProposal(raw).options[0]!;
    const reused = previewEditorAgentProposalBatch(projectId, [option, next], base, shared);
    assert.equal(strip(reused), strip(previewEditorAgentProposalBatch(projectId, [option, next], base, copies)));
  }
});

test("findElement answers from one index inside withElementIdIndex, always the first match", () => {
  const timeline: TimelineFile = { elements: [row("a", "p", {}), row("b", "p", {}), row("a", "p", { duration: 2 })], transitions: [] };
  const first = timeline.elements[0]!;
  withElementIdIndex(timeline, () => {
    assert.equal(findElement(timeline, "a"), first, "the first of two rows with one id");
    assert.equal(findElement(timeline, "missing"), undefined);
    timeline.elements.push(row("c", "p", {}), row("b", "p", { duration: 3 }));
    assert.equal(findElement(timeline, "c"), timeline.elements[3], "an appended row");
    assert.equal(findElement(timeline, "b"), timeline.elements[1], "an append never shadows an earlier row");
    const copy = structuredClone(first);
    timeline.elements[0] = copy;
    assert.equal(findElement(timeline, "a"), copy, "a row replaced in place by its own copy");
    timeline.elements = [row("d", "p", {}), ...timeline.elements];
    assert.equal(findElement(timeline, "d"), timeline.elements[0], "a reassigned row list");
    assert.equal(findElement(timeline, "a"), copy);
    timeline.elements.reverse();
    assert.equal(findElement(timeline, "a"), timeline.elements.find((element) => element.id === "a"), "moved rows fall back to a scan");
    assert.equal(findElement(timeline, "b"), timeline.elements.find((element) => element.id === "b"));
  });
  assert.equal(findElement(timeline, "a"), timeline.elements.find((element) => element.id === "a"), "outside the scope it scans");
});

test("the caption split never asks the scope check about captions that cannot split", () => {
  const asked: string[] = [];
  const one = row("one", "p", { type: "caption_text", props: { text: "hi", timingMode: "single_word", wordTimings: [{ text: "hi", start: 0, end: 0.5 }] } });
  const gone = row("gone", "p", { type: "caption_text", removed_at: now, props: { text: "a b", timingMode: "single_word", wordTimings: [{ text: "a", start: 0, end: 0.5 }, { text: "b", start: 0.5, end: 1 }] } });
  const two = row("two", "p", { type: "caption_text", duration: 1, props: { text: "a b", timingMode: "single_word", wordTimings: [{ text: "a", start: 0, end: 0.5 }, { text: "b", start: 0.5, end: 1 }] } });
  const elements = [one, gone, two];
  const changed = splitSingleWordCaptions(elements, { fps: 30, only: (element) => { asked.push(element.id); return true; } });
  assert.deepEqual(asked, ["two"]);
  assert.equal(changed.length, 2);
  assert.deepEqual(elements.map((element) => element.props?.text), ["hi", "a b", "a", "b"]);
});
