import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { relationRectAt } from "@/lib/timeline/placement-relation";
import { placementPolicyIssues, relationOverlapMessage, reviewPlacementRelations } from "./proposal-placement";
import { applyProposalReviewOverrides } from "./proposal-overrides";
import { reviewProposal } from "./proposal-review";
import {
  countOperationMutations,
  previewEditorAgentProposal,
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
  withDefaultReviewControls,
} from "./timeline-editor-agent-apply";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-placement-"));

const SKY = "11111111-1111-4111-8111-111111111111";
const LABEL = "22222222-2222-4222-8222-222222222222";
const canvas = { width: 1920, height: 1080 };
const now = "2026-10-24T00:00:00.000Z";
const sky = (projectId: string, props: Record<string, unknown> = {}): TimelineElement => ({
  id: SKY, project_id: projectId, type: "shape", source_url: null, beat_id: null, character_id: null,
  props: { title: "skyline", shape_kind: "rect", shape_width: 0.3, shape_height: 0.2, shape_fill: "#ffffff", media_offset_x: 0.5, media_offset_y: -0.3, ...props },
  timeline_start: 0, duration: 8, lane_key: "visual_1", lane_index: 1, trim_start: 0, trim_end: 0, volume: 0, fade_in: 0, fade_out: 0, playback_rate: 1,
  position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
} as TimelineElement);
const labelText = (extra: Record<string, unknown>) => ({
  text: "1000 tasks", title: "Label", timeline_start: 5.4, duration_seconds: 2.6, lane_key: "captions_3", lane_index: 3,
  fontPreset: "caveat", fontSizePx: 64, styleVariant: "none", maxWidth: 0.25, textAlign: "center", textColor: "#ffffff", animationIn: "fade", animationInDuration: 0.4, ...extra,
});

function setup(projectId: string, elements: TimelineElement[] = [sky(projectId)]) {
  createProject(projectId, "web");
  writeTimeline(projectId, { elements, transitions: [] }, "fixture");
}

function draft(projectId: string, operations: Record<string, unknown>[], option: Record<string, unknown> = {}) {
  const count = countOperationMutations(operations as never);
  return withDefaultReviewControls({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "A label under the skyline", assumptions: [], unresolved_gaps: [], caps: { max_mutations: 512, requested_mutations: count, max_renders: 0 },
    options: [{ id: "label", label: "Label under the drawing", recommended: true, summary: "\"1000 tasks\" appears under the skyline", requested_mutations: count, operations, ...option }],
  });
}

const placedLabel = (place: Record<string, unknown>) => ({ element_id: LABEL, create_text: labelText({ place }) });

test("a label proposed below the skyline lands under it and passes the placement checks", () => {
  const projectId = "placement-below";
  setup(projectId);
  const proposal = validateEditorAgentProposalAgainstProject(draft(projectId, [placedLabel({ relative_to: SKY, side: "below" })]), 512, projectId);
  assert.deepEqual(proposal.options[0]!.operations[0]!.create_text!.place, { relative_to: SKY, side: "below", gap: 0.02, align: "center" });
  const elements = previewEditorAgentProposal(proposal).timeline.elements as TimelineElement[];
  const drawing = relationRectAt(elements.find(e => e.id === SKY)!, 6, elements, canvas)!;
  const label = relationRectAt(elements.find(e => e.id === LABEL)!, 6, elements, canvas)!;
  assert.ok(Math.abs(label.y - (drawing.y + drawing.height + 0.02 * 1080)) < 0.5);
  assert.ok(Math.abs(label.x + label.width / 2 - (drawing.x + drawing.width / 2)) < 0.5);
  assert.deepEqual(placementPolicyIssues(proposal.options, readTimeline(projectId)), []);
  assert.deepEqual(reviewPlacementRelations(projectId, readTimeline(projectId), proposal.options), []);
});

test("the card offers Side and Gap dials, and tuning them re-resolves the label", () => {
  const projectId = "placement-dials";
  setup(projectId);
  const proposal = validateEditorAgentProposalAgainstProject(draft(projectId, [placedLabel({ relative_to: [SKY], side: "below", gap: 0.02 })]), 512, projectId);
  const controls = proposal.options[0]!.review_controls!.map(control => control.field);
  assert.ok(controls.includes("place_side") && controls.includes("place_gap"), controls.join(", "));
  const changes = reviewProposal(readTimeline(projectId), proposal)[0]!.adjustment_rows.flatMap(row => row.changes);
  assert.equal(changes.find(change => change.field === "place_side")?.after_value, "below");
  assert.equal(changes.find(change => change.field === "place_gap")?.after_value, 0.02);
  const tuned = applyProposalReviewOverrides(proposal, "label", [
    { operation_index: 0, target: "create_text", field: "place_side", value: "above" },
    { operation_index: 0, target: "create_text", field: "place_gap", value: 0.05 },
  ]);
  const elements = previewEditorAgentProposal(tuned).timeline.elements as TimelineElement[];
  const drawing = relationRectAt(elements.find(e => e.id === SKY)!, 6, elements, canvas)!;
  const label = relationRectAt(elements.find(e => e.id === LABEL)!, 6, elements, canvas)!;
  assert.ok(Math.abs(label.y + label.height - (drawing.y - 0.05 * 1080)) < 0.5);
  assert.throws(() => applyProposalReviewOverrides(proposal, "label", [{ operation_index: 0, target: "create_text", field: "place_side", value: "beside" }]), /listed choices/);
});

test("raw coordinates on new text are refused without a stated reason; a preset beside them always", () => {
  const projectId = "placement-policy";
  setup(projectId);
  const coordinates = { element_id: LABEL, create_text: labelText({ absX: 0.8, absY: 0.537 }) };
  const bare = validateEditorAgentProposalAgainstProject(draft(projectId, [coordinates]), 512, projectId);
  assert.match(placementPolicyIssues(bare.options, readTimeline(projectId)).join(" "), /placed by coordinates \(absX, absY\).*coordinate_fallback_reason/);
  const reasoned = validateEditorAgentProposalAgainstProject(draft(projectId, [coordinates], { coordinate_fallback_reason: "The creator asked for the label at exactly 80% across." }), 512, projectId);
  assert.deepEqual(placementPolicyIssues(reasoned.options, readTimeline(projectId)), []);
  const mixed = validateEditorAgentProposalAgainstProject(draft(projectId, [{ element_id: LABEL, create_text: labelText({ absX: 0.8, absY: 0.537, positionPreset: "upper_right" }) }],
    { coordinate_fallback_reason: "The creator asked for the label at exactly 80% across." }), 512, projectId);
  assert.match(placementPolicyIssues(mixed.options, readTimeline(projectId)).join(" "), /both a position preset and coordinates/);
  const ring = { element_id: LABEL, create_shape: { title: "ring", timeline_start: 1, duration_seconds: 2, lane_key: "visual_2", lane_index: 2, shape_kind: "ellipse", shape_width: 0.1, shape_height: 0.1, shape_stroke: "#ffffff", media_offset_x: 0.1 } };
  const shapeOffsets = validateEditorAgentProposalAgainstProject(draft(projectId, [ring]), 512, projectId);
  assert.match(placementPolicyIssues(shapeOffsets.options, readTimeline(projectId)).join(" "), /the shape "ring" is placed by coordinates \(media_offset_x\)/);
});

test("place is the one placement mode and needs a real anchor", () => {
  const projectId = "placement-validation";
  setup(projectId);
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(projectId, [{ element_id: LABEL, create_text: labelText({ place: { relative_to: SKY, side: "below" }, absY: 0.5 }) }]), 512, projectId), /one placement mode/);
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(projectId, [{ element_id: LABEL, create_text: labelText({ place: { relative_to: SKY, side: "below" }, positionPreset: "upper_right" }) }]), 512, projectId), /one placement mode/);
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(projectId, [placedLabel({ relative_to: "33333333-3333-4333-8333-333333333333", side: "below" })]), 512, projectId), /not on the timeline/);
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(projectId, [{ element_id: LABEL, create_text: labelText({}) }]), 512, projectId), /Place the text/);
});

test("a later card can move a drawn shape to an exact spot, and what is placed on it follows", () => {
  const projectId = "placement-move-shape";
  const label = { ...sky(projectId), id: LABEL, type: "caption_text", lane_key: "captions_3", lane_index: 3, timeline_start: 5.4, duration: 2.6,
    props: { text: "1000 tasks", fontSizePx: 64, maxWidth: 0.25, textAlign: "center", place: { relative_to: [SKY], side: "below", gap: 0.02, align: "center" } } } as TimelineElement;
  setup(projectId, [sky(projectId), label]);
  const move = [{ element_id: SKY, props: { media_offset_x: -0.4, media_offset_y: 0.2 } }];
  assert.match(placementPolicyIssues(validateEditorAgentProposalAgainstProject(draft(projectId, move), 512, projectId).options, readTimeline(projectId)).join(" "), /placed by coordinates/);
  const proposal = validateEditorAgentProposalAgainstProject(draft(projectId, move, { coordinate_fallback_reason: "The creator marked the exact spot for the drawing." }), 512, projectId);
  assert.deepEqual(placementPolicyIssues(proposal.options, readTimeline(projectId)), []);
  const elements = previewEditorAgentProposal(proposal).timeline.elements as TimelineElement[];
  assert.equal(elements.find(e => e.id === SKY)!.props.media_offset_x, -0.4);
  const drawing = relationRectAt(elements.find(e => e.id === SKY)!, 6, elements, canvas)!;
  const moved = relationRectAt(elements.find(e => e.id === LABEL)!, 6, elements, canvas)!;
  assert.ok(Math.abs(moved.x + moved.width / 2 - (drawing.x + drawing.width / 2)) < 0.5);
});

test("a later card can change a drawn shape's entrance and exit within the shape presets", () => {
  const projectId = "placement-shape-fade";
  setup(projectId);
  const fade = [{ element_id: SKY, props: { animationIn: "fade", animationInDuration: 0.6, animationOut: "fade", animationOutDuration: 0.4 } }];
  const elements = previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(draft(projectId, fade), 512, projectId)).timeline.elements as TimelineElement[];
  const shape = elements.find(e => e.id === SKY)!;
  assert.equal(shape.props.animationIn, "fade");
  assert.equal(shape.props.animationOutDuration, 0.4);
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(projectId, [{ element_id: SKY, props: { animationIn: "slide_up" } }]), 512, projectId), /shape's animationIn is one of none, fade/);
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft(projectId, [{ element_id: SKY, props: { animationInDuration: 5 } }]), 512, projectId), /at most 2 seconds/);
});

test("resizing the drawing in a later card carries a label already placed under it", () => {
  const projectId = "placement-carry";
  const label = { ...sky(projectId), id: LABEL, type: "caption_text", lane_key: "captions_3", lane_index: 3, timeline_start: 5.4, duration: 2.6,
    props: { text: "1000 tasks", fontSizePx: 64, maxWidth: 0.25, textAlign: "center", place: { relative_to: [SKY], side: "below", gap: 0.02, align: "center" }, absX: 0.1, absY: 0.1 } } as TimelineElement;
  setup(projectId, [sky(projectId), label]);
  const proposal = validateEditorAgentProposalAgainstProject(draft(projectId, [{ element_id: SKY, props: { shape_width: 0.5, shape_height: 0.4 } }]), 512, projectId);
  assert.deepEqual(placementPolicyIssues(proposal.options, readTimeline(projectId)), []);
  const elements = previewEditorAgentProposal(proposal).timeline.elements as TimelineElement[];
  const drawing = relationRectAt(elements.find(e => e.id === SKY)!, 6, elements, canvas)!;
  const moved = relationRectAt(elements.find(e => e.id === LABEL)!, 6, elements, canvas)!;
  assert.ok(Math.abs(moved.y - (drawing.y + drawing.height + 0.02 * 1080)) < 0.5);
  assert.ok(Math.abs(moved.x + moved.width / 2 - (drawing.x + drawing.width / 2)) < 0.5);
});

test("a label the frame edge pushes back onto its drawing is reported for refusal", () => {
  const projectId = "placement-edge";
  setup(projectId, [sky(projectId, { media_offset_y: 0.85 })]);
  const proposal = validateEditorAgentProposalAgainstProject(draft(projectId, [placedLabel({ relative_to: SKY, side: "below" })]), 512, projectId);
  const found = reviewPlacementRelations(projectId, readTimeline(projectId), proposal.options);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.element_id, LABEL);
});

test("a relation that runs off the frame points at open_space_find for measured room", () => {
  const message = relationOverlapMessage([
    { option_id: "intro", element_id: "left-title", side: "left", share: 1 },
    { option_id: "intro", element_id: "right-title", side: "right", share: 0.06 },
  ] as Parameters<typeof relationOverlapMessage>[0]);
  assert.match(message, /left-title placed left its anchor still covers 100%/);
  assert.match(message, /right-title placed right its anchor still covers 6%/);
  assert.equal(message.match(/open_space_find/g)?.length, 1, "the hint appears once, after every item");
});
