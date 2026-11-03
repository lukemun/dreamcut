import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { deriveProposalTimeline, editorAgentPropsSchema, timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { internalGridMatteDirectory } from "@/lib/local-store/internal-masks";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-subject-window-"));

const projectId = "subject-window-contract";
const SUBJECT2 = "44444444-4444-4444-8444-444444444444";
const SUBJECT = "22222222-2222-4222-8222-222222222222", FILL = "11111111-1111-4111-8111-111111111111", NEW = "33333333-3333-4333-8333-333333333333";
const mask = { source_url: `/api/projects/${projectId}/media/grid-mattes/cut-1`, source_start_seconds: 0, fps: 50, frame_count: 314, width: 96, height: 54, source_sha256: "a".repeat(64) };
const now = "2026-10-14T00:00:00.000Z";
function clip(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  return { id, project_id: projectId, type: "video_clip", source_url: `/api/projects/${projectId}/media/sources/${id}.mp4`,
    props: { source_duration_seconds: 6.28 }, beat_id: null, character_id: null, timeline_start: 0, duration: 6, lane_key: "visual_1", lane_index: 0,
    trim_start: 0, trim_end: null, volume: 0, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null,
    removed_reason: null, created_at: now, updated_at: now, ...overrides } as TimelineElement;
}
type Operations = Parameters<typeof deriveProposalTimeline>[1];

createProject(projectId, "web");
writeTimeline(projectId, { elements: [clip(SUBJECT2, { lane_key: "visual_4", lane_index: 3, duration: 4 }), clip(SUBJECT), clip(FILL, { lane_key: "visual_2", lane_index: 1, duration: 0.6, timeline_start: 0.6 })], transitions: [] }, "fixture");
const manifestDir = path.join(internalGridMatteDirectory(projectId), "cut-1");
fs.mkdirSync(manifestDir, { recursive: true });
fs.writeFileSync(path.join(manifestDir, "manifest.json"), JSON.stringify({ binding: mask, masks: [] }));
// A shorter prepared cutout: the first 5 s of the second subject's footage.
const shortMask = { ...mask, source_url: `/api/projects/${projectId}/media/grid-mattes/cut-2`, frame_count: 250 };
fs.mkdirSync(path.join(internalGridMatteDirectory(projectId), "cut-2"), { recursive: true });
fs.writeFileSync(path.join(internalGridMatteDirectory(projectId), "cut-2", "manifest.json"), JSON.stringify({ binding: shortMask, masks: [] }));

test("props accept a bounded subject window and reject out-of-range or malformed values", () => {
  const parsed = editorAgentPropsSchema.parse({ subject_window_parent_id: SUBJECT, subject_window_mask: mask, subject_window_mode: "outside", subject_window_feather: 12, subject_window_expand: -6, subject_window_strength: 0.5 });
  assert.equal(parsed.subject_window_mode, "outside");
  assert.throws(() => editorAgentPropsSchema.parse({ subject_window_mode: "around" }));
  assert.throws(() => editorAgentPropsSchema.parse({ subject_window_feather: 101 }));
  assert.throws(() => editorAgentPropsSchema.parse({ subject_window_expand: -81 }));
  assert.throws(() => editorAgentPropsSchema.parse({ subject_window_mask: { ...mask, source_url: "/elsewhere" } }));
});

test("a props patch windows an existing fill by the subject clip; preview derivation keeps the binding", () => {
  const ops = [{ element_id: FILL, props: { subject_window_parent_id: SUBJECT, subject_window_mask: mask, subject_window_feather: 8 } }] as Operations;
  const derived = deriveProposalTimeline(readTimeline(projectId), ops, projectId);
  const fill = derived.timeline.elements.find(element => element.id === FILL)!;
  assert.equal(fill.props?.subject_window_parent_id, SUBJECT);
  assert.equal(fill.props?.subject_window_feather, 8);
});

test("create_visual places a windowed fill in one operation", () => {
  const ops = [{ element_id: NEW, create_visual: { type: "still", source_url: `/api/projects/${projectId}/media/sources/meadow.png`, timeline_start: 1.2,
    duration_seconds: 0.6, lane_key: "visual_3", lane_index: 2,
    subject_window_parent_id: SUBJECT, subject_window_mask: mask, subject_window_mode: "inside", subject_window_strength: 1 } }] as Operations;
  const created = deriveProposalTimeline(readTimeline(projectId), ops, projectId).timeline.elements.find(element => element.id === NEW)!;
  assert.equal(created.props?.subject_window_parent_id, SUBJECT);
  assert.deepEqual(created.props?.subject_window_mask, mask);
  assert.equal(created.props?.subject_window_strength, 1);
});

test("bindings are refused when the subject, mask provenance or coverage is wrong", () => {
  const derive = (props: Record<string, unknown>, extra: Operations = []) => deriveProposalTimeline(readTimeline(projectId), [{ element_id: FILL, props }, ...extra] as Operations, projectId);
  assert.throws(() => derive({ subject_window_parent_id: NEW, subject_window_mask: mask }), /subject clip is missing/);
  assert.throws(() => derive({ subject_window_parent_id: FILL, subject_window_mask: mask }), /itself/);
  assert.throws(() => derive({ subject_window_parent_id: SUBJECT, subject_window_mask: { ...mask, source_url: "/api/projects/other/media/grid-mattes/cut-1" } }), /this project's prepared cutout/);
  assert.throws(() => derive({ subject_window_parent_id: SUBJECT, subject_window_mask: { ...mask, frame_count: 100 } }), /does not cover|does not match/);
  // Removing or retiming the subject is checked against every clip windowed by it.
  const bound = deriveProposalTimeline(readTimeline(projectId), [{ element_id: FILL, props: { subject_window_parent_id: SUBJECT2, subject_window_mask: shortMask } }] as Operations, projectId).timeline;
  assert.throws(() => deriveProposalTimeline(bound, [{ element_id: SUBJECT2, patch: { trim_start: 2 } }] as Operations, projectId), /does not cover/);
  assert.throws(() => deriveProposalTimeline(bound, [{ element_id: SUBJECT2, remove_visual: { reason: "test" } }] as Operations, projectId), /missing/);
});

test("project validation stages a subject window through GPU write admission", () => {
  const raw = { schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Show the fill only inside the subject.", assumptions: [], unresolved_gaps: [],
    options: [{ id: "a", label: "Subject window", recommended: true, summary: "Window the fill by the subject.", operations: [{ element_id: FILL, props: { subject_window_parent_id: SUBJECT, subject_window_mask: mask, subject_window_mode: "inside", subject_window_feather: 6, subject_window_expand: 0, subject_window_strength: 1 } }] }] };
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(raw, 20, projectId));
});

test("a subject animation the window cannot follow is refused on either side of the binding", () => {
  const bind = { element_id: FILL, props: { subject_window_parent_id: SUBJECT, subject_window_mask: mask } };
  const bound = deriveProposalTimeline(readTimeline(projectId), [bind] as Operations, projectId).timeline;
  // Slides and pops are followed; rotation is not.
  assert.doesNotThrow(() => deriveProposalTimeline(bound, [{ element_id: SUBJECT, props: { animationIn: "slide_up", animationOut: "pop" } }] as Operations, projectId));
  assert.throws(() => deriveProposalTimeline(bound, [{ element_id: SUBJECT, props: { animationIn: "rotate_in" } }] as Operations, projectId), /rotate animation/);
  const wiping = deriveProposalTimeline(readTimeline(projectId), [{ element_id: SUBJECT, props: { animationOut: "write_on" } }] as Operations, projectId).timeline;
  assert.throws(() => deriveProposalTimeline(wiping, [bind] as Operations, projectId), /write-on wipe/);
});

test("a transition that replaces the subject's animation lets the window bind", () => {
  // Transitions live beside the elements; validation must see the subject as the renderers do.
  const NEXT = "55555555-5555-4555-8555-555555555555";
  const base = readTimeline(projectId);
  const timeline = { ...base,
    elements: [...base.elements.map(element => element.id === SUBJECT ? { ...element, props: { ...element.props, animationOut: "write_on" } } : element), clip(NEXT, { timeline_start: 6, duration: 2 })],
    transitions: [{ id: "66666666-6666-4666-8666-666666666666", project_id: projectId, from_element_id: SUBJECT, to_element_id: NEXT, type: "fade", duration_seconds: 0.5, params: null, removed_at: null, removed_reason: null, created_at: now, updated_at: now }],
  } as Parameters<typeof deriveProposalTimeline>[0];
  const bind = [{ element_id: FILL, props: { subject_window_parent_id: SUBJECT, subject_window_mask: mask } }] as Operations;
  assert.doesNotThrow(() => deriveProposalTimeline(timeline, bind, projectId));
  assert.throws(() => deriveProposalTimeline({ ...timeline, transitions: [] }, bind, projectId), /write-on wipe/);
});
